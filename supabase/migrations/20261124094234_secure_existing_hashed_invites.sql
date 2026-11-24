-- Audited against existing sweet-lucky-draw on 2026-11-24.
-- Keeps existing tables, hashed invitations, Auth users and administrator membership.
-- Existing RPC implementations are retained in the non-exposed sweet_legacy schema.
begin;
lock table public.admin_users,public.invite_codes,public.draw_records in access exclusive mode;

do $preflight$
declare r record; actual text; signatures integer;
begin
  if current_user <> 'postgres' then raise exception 'PREFLIGHT: run as postgres'; end if;
  if exists(select 1 from pg_namespace n where n.nspname in ('sweet_private','sweet_legacy') and obj_description(n.oid,'pg_namespace') is distinct from 'sweet-lucky-draw:secure-v1') then
    raise exception 'SCHEMA_CONFLICT: existing helper schema requires review';
  end if;
  if to_regprocedure('public.get_draw_result(text)') is not null and obj_description(to_regprocedure('public.get_draw_result(text)'),'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1' then
    raise exception 'RPC_CONFLICT: existing get_draw_result requires review';
  end if;
  for r in select * from (values
    ('admin_users','user_id','uuid'),
    ('invite_codes','id','uuid'),('invite_codes','code_hash','text'),('invite_codes','code_suffix','text'),
    ('invite_codes','status','text'),('invite_codes','prize','text'),('invite_codes','created_by','uuid'),
    ('invite_codes','created_at','timestamp with time zone'),('invite_codes','redeemed_at','timestamp with time zone'),
    ('draw_records','id','uuid'),('draw_records','invite_id','uuid'),('draw_records','prize','text'),
    ('draw_records','drawn_at','timestamp with time zone')
  ) as expected(tbl,col,typ) loop
    select data_type into actual from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col;
    if actual is distinct from r.typ then raise exception 'SCHEMA_MISMATCH: expected %.% (%), found %',r.tbl,r.col,r.typ,actual; end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.invite_codes'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (code_hash)')
     or not exists(select 1 from pg_constraint where conrelid='public.draw_records'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (invite_id)') then
    raise exception 'SCHEMA_MISMATCH: required existing uniqueness constraints are missing';
  end if;
  if exists(select 1 from public.invite_codes where code_hash !~ '^[a-f0-9]{64}$' or code_suffix !~ '^[A-Z0-9]{4}$' or status not in ('unused','used')
    or (status='unused' and (prize is not null or redeemed_at is not null))
    or (status='used' and (prize is null or redeemed_at is null)))
    or exists(select 1 from public.draw_records d left join public.invite_codes i on i.id=d.invite_id where i.id is null or i.status<>'used' or i.prize is distinct from d.prize)
    or exists(select 1 from public.invite_codes i where i.status='used' and not exists(select 1 from public.draw_records d where d.invite_id=i.id)) then
    raise exception 'DATA_REVIEW_REQUIRED: preserve and review inconsistent existing rows';
  end if;
  for r in select * from (values ('redeem_and_draw'),('admin_generate_codes'),('admin_list_invites'),('admin_list_draws')) f(name) loop
    select count(*) into signatures from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.name;
    if signatures>1 then raise exception 'OVERLOAD_REVIEW_REQUIRED: %',r.name; end if;
  end loop;
end $preflight$;

create schema if not exists sweet_private;
create schema if not exists sweet_legacy;
comment on schema sweet_private is 'sweet-lucky-draw:secure-v1';
comment on schema sweet_legacy is 'sweet-lucky-draw:secure-v1';
revoke all on schema sweet_private,sweet_legacy from public,anon,authenticated;

do $preserve$
declare r record; target regprocedure; legacy regprocedure;
begin
  for r in select * from (values ('redeem_and_draw','text'),('admin_generate_codes','integer'),('admin_list_invites',''),('admin_list_draws','')) f(name,args) loop
    target:=to_regprocedure(format('public.%I(%s)',r.name,r.args));
    legacy:=to_regprocedure(format('sweet_legacy.%I(%s)',r.name,r.args));
    if target is null then raise exception 'RPC_MISSING_OR_SIGNATURE_MISMATCH: %',r.name; end if;
    if legacy is null then
      execute format('alter function %s set schema sweet_legacy',target);
      execute format('revoke all on function sweet_legacy.%I(%s) from public,anon,authenticated',r.name,r.args);
    elsif obj_description(target,'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1' then
      raise exception 'LEGACY_CONFLICT: original implementation preserved; review %',r.name;
    end if;
  end loop;
end $preserve$;

alter table public.admin_users enable row level security;
alter table public.invite_codes enable row level security;
alter table public.draw_records enable row level security;
revoke all on public.admin_users,public.invite_codes,public.draw_records from public,anon,authenticated;
do $columns$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('admin_users','invite_codes','draw_records') loop
    execute format('revoke all (%I) on table public.%I from public,anon,authenticated',c.column_name,c.table_name);
  end loop;
end $columns$;
grant usage on schema public to anon,authenticated;
create index if not exists sweet_invites_created on public.invite_codes(created_at desc);
create index if not exists sweet_draws_created on public.draw_records(drawn_at desc);

create or replace function sweet_private.assert_admin()
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
end $$;

-- Same SHA-256 representation as the existing extensions.digest(...,'sha256').
create or replace function sweet_private.hash_code(p_code text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code,'UTF8')),'hex');
$$;

create or replace function sweet_private.display_prize(p_prize text)
returns text language sql immutable security invoker set search_path='' as $$
  select case p_prize when 'cake' then '蛋糕' when 'milk_tea' then '奶茶' when 'snack' then '小吃' end;
$$;

create or replace function sweet_private.random_code()
returns text language plpgsql volatile security invoker set search_path='' as $$
declare bits bigint; result text:=''; alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; j integer;
begin
  bits:=('x'||substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,10))::bit(40)::bigint;
  for j in 1..8 loop result:=result||substr(alphabet,((bits & 31)::integer)+1,1); bits:=bits >> 5; end loop;
  return result;
end $$;

create or replace function sweet_private.random_prize()
returns text language plpgsql volatile security invoker set search_path='' as $$
declare n integer;
begin
  loop n:=pg_catalog.get_byte(pg_catalog.uuid_send(pg_catalog.gen_random_uuid()),0); exit when n<255; end loop;
  return (array['cake','milk_tea','snack'])[1+(n%3)];
end $$;

create or replace function public.redeem_and_draw(p_code text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare invitation public.invite_codes%rowtype; record_id uuid; award text; stamp timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  select * into invitation from public.invite_codes where code_hash=sweet_private.hash_code(p_code) for update;
  if not found then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  if invitation.status<>'unused' then raise exception 'CODE_USED' using errcode='22023'; end if;
  award:=sweet_private.random_prize(); record_id:=pg_catalog.gen_random_uuid(); stamp:=pg_catalog.clock_timestamp();
  update public.invite_codes set status='used',prize=award,redeemed_at=stamp where id=invitation.id;
  insert into public.draw_records(id,invite_id,prize,drawn_at) values(record_id,invitation.id,award,stamp);
  return jsonb_build_object('id',record_id,'prize',sweet_private.display_prize(award),'created_at',stamp);
end $$;

create or replace function public.get_draw_result(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare receipt jsonb;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  select jsonb_build_object('id',d.id,'prize',sweet_private.display_prize(d.prize),'created_at',d.drawn_at) into receipt
  from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_hash=sweet_private.hash_code(p_code) and i.status='used';
  return receipt;
end $$;

create or replace function public.admin_generate_codes(p_count integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare inserted public.invite_codes%rowtype; generated jsonb:='[]'::jsonb; candidate text; j integer; attempts integer;
begin
  perform sweet_private.assert_admin();
  if p_count is null or p_count<1 or p_count>500 then raise exception 'COUNT_OUT_OF_RANGE' using errcode='22023'; end if;
  for j in 1..p_count loop
    attempts:=0;
    loop
      attempts:=attempts+1; if attempts>20 then raise exception 'CODE_GENERATION_FAILED'; end if;
      candidate:=sweet_private.random_code();
      insert into public.invite_codes(id,code_hash,code_suffix,status,prize,created_by,created_at,redeemed_at)
      values(pg_catalog.gen_random_uuid(),sweet_private.hash_code(candidate),right(candidate,4),'unused',null,auth.uid(),pg_catalog.clock_timestamp(),null)
      on conflict(code_hash) do nothing returning * into inserted;
      exit when found;
    end loop;
    -- Full code is returned ONCE, never stored in a table or log.
    generated:=generated||jsonb_build_array(jsonb_build_object('id',inserted.id,'code',candidate,'code_suffix',inserted.code_suffix,'is_used',false,'created_at',inserted.created_at,'used_at',null));
  end loop;
  return generated;
end $$;

create or replace function public.admin_list_invites()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform sweet_private.assert_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'code','••••'||i.code_suffix,'code_suffix',i.code_suffix,'is_used',i.status='used','prize',sweet_private.display_prize(i.prize),'created_at',i.created_at,'used_at',i.redeemed_at) order by i.created_at desc,i.id),'[]'::jsonb) into result from public.invite_codes i;
  return result;
end $$;

create or replace function public.admin_list_draws()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform sweet_private.assert_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code','••••'||i.code_suffix,'code_suffix',i.code_suffix,'prize',sweet_private.display_prize(d.prize),'created_at',d.drawn_at) order by d.drawn_at desc,d.id),'[]'::jsonb) into result
  from public.draw_records d join public.invite_codes i on i.id=d.invite_id;
  return result;
end $$;

alter function public.redeem_and_draw(text) owner to postgres;
alter function public.get_draw_result(text) owner to postgres;
alter function public.admin_generate_codes(integer) owner to postgres;
alter function public.admin_list_invites() owner to postgres;
alter function public.admin_list_draws() owner to postgres;
revoke all on function sweet_private.assert_admin(),sweet_private.hash_code(text),sweet_private.display_prize(text),sweet_private.random_code(),sweet_private.random_prize() from public,anon,authenticated;
revoke all on function public.redeem_and_draw(text),public.get_draw_result(text),public.admin_generate_codes(integer),public.admin_list_invites(),public.admin_list_draws() from public,anon,authenticated;
grant execute on function public.redeem_and_draw(text),public.get_draw_result(text) to anon,authenticated;
grant execute on function public.admin_generate_codes(integer),public.admin_list_invites(),public.admin_list_draws() to authenticated;
comment on function public.redeem_and_draw(text) is 'sweet-lucky-draw:secure-v1';
comment on function public.get_draw_result(text) is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_generate_codes(integer) is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_list_invites() is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_list_draws() is 'sweet-lucky-draw:secure-v1';
notify pgrst,'reload schema';
commit;
