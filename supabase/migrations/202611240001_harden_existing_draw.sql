-- PROPOSED / NOT APPLIED TO REMOTE.
-- Read supabase/audit.sql and docs/SECURITY.md before applying to the existing project.
-- This migration NEVER creates/replaces tables or deletes existing rows/users.
-- It deliberately aborts on an unsupported schema, conflicting legacy schema, or duplicate data.
-- The existing four RPC implementations are retained under sweet_legacy for review.
begin;

-- Acquire before validating: no invitations can change between preflight and installation.
lock table public.admin_users, public.invite_codes, public.draw_records in access exclusive mode;

do $preflight$
declare r record; actual text; signatures integer;
begin
  if current_user <> 'postgres' then
    raise exception 'PREFLIGHT: run as postgres in the existing project SQL Editor';
  end if;
  if exists(select 1 from pg_namespace n where n.nspname in ('sweet_private','sweet_legacy') and obj_description(n.oid,'pg_namespace') is distinct from 'sweet-lucky-draw:secure-v1') then
    raise exception 'SCHEMA_CONFLICT: pre-existing helper schema requires review. No objects overwritten.';
  end if;
  if to_regprocedure('public.get_draw_result(text)') is not null
     and obj_description(to_regprocedure('public.get_draw_result(text)'),'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1' then
    raise exception 'RPC_CONFLICT: existing get_draw_result requires review.';
  end if;
  for r in select * from (values
    ('admin_users','user_id','uuid'),
    ('invite_codes','id','uuid'),('invite_codes','code','text'),
    ('invite_codes','is_used','boolean'),('invite_codes','created_at','timestamp with time zone'),
    ('invite_codes','used_at','timestamp with time zone'),('invite_codes','created_by','uuid'),
    ('draw_records','id','uuid'),('draw_records','invite_id','uuid'),
    ('draw_records','prize','text'),('draw_records','created_at','timestamp with time zone')
  ) as expected(tbl,col,typ) loop
    select data_type into actual from information_schema.columns
    where table_schema='public' and table_name=r.tbl and column_name=r.col;
    if actual is distinct from r.typ then
      raise exception 'SCHEMA_MISMATCH: expected public.%.% (%), found %. Audit and adapt; no data changed.',r.tbl,r.col,r.typ,actual;
    end if;
  end loop;
  if exists(select 1 from public.invite_codes where code is null or code !~ '^[A-Z0-9]{8}$' or is_used is null or (is_used <> (used_at is not null))) then
    raise exception 'DATA_REVIEW_REQUIRED: invitation formats/statuses differ. Preserve rows and resolve after audit.';
  end if;
  if exists(select 1 from public.invite_codes group by code having count(*)>1)
     or exists(select 1 from public.draw_records group by invite_id having count(*)>1)
     or exists(select 1 from public.draw_records d left join public.invite_codes i on i.id=d.invite_id where i.id is null or not i.is_used or d.prize not in ('蛋糕','奶茶','小吃'))
     or exists(select 1 from public.invite_codes i where i.is_used and not exists(select 1 from public.draw_records d where d.invite_id=i.id)) then
    raise exception 'DATA_REVIEW_REQUIRED: existing duplicate or inconsistent receipts. No rows deleted.';
  end if;
  -- A record insert must not rely on an unknown required column.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='draw_records' and is_nullable='NO' and column_default is null and column_name not in ('id','invite_id','prize','created_at')) then
    raise exception 'SCHEMA_MISMATCH: draw_records contains additional required columns. Audit and adapt.';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='invite_codes' and is_nullable='NO' and column_default is null and column_name not in ('id','code','is_used','used_at','created_by','created_at')) then
    raise exception 'SCHEMA_MISMATCH: invite_codes contains additional required columns. Audit and adapt.';
  end if;
  for r in select * from (values ('redeem_and_draw'),('admin_generate_codes'),('admin_list_invites'),('admin_list_draws')) as funcs(name) loop
    select count(*) into signatures from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.name;
    if signatures>1 then raise exception 'OVERLOAD_REVIEW_REQUIRED: % has multiple signatures',r.name; end if;
  end loop;
end $preflight$;

create schema if not exists sweet_private;
create schema if not exists sweet_legacy;
comment on schema sweet_private is 'sweet-lucky-draw:secure-v1';
comment on schema sweet_legacy is 'sweet-lucky-draw:secure-v1';
revoke all on schema sweet_private, sweet_legacy from public, anon, authenticated;

-- Move original implementations, preserving their definitions and dependent objects.
-- Repeat application only accepts our marked replacement functions.
do $preserve$
declare r record; target regprocedure; legacy regprocedure;
begin
  for r in select * from (values
    ('redeem_and_draw','text'),('admin_generate_codes','integer'),
    ('admin_list_invites',''),('admin_list_draws','')
  ) as funcs(name,args) loop
    target := to_regprocedure(format('public.%I(%s)',r.name,r.args));
    legacy := to_regprocedure(format('sweet_legacy.%I(%s)',r.name,r.args));
    if target is null then raise exception 'RPC_MISSING_OR_SIGNATURE_MISMATCH: public.%(%)',r.name,r.args; end if;
    if legacy is null then
      execute format('alter function %s set schema sweet_legacy',target);
      execute format('revoke all on function sweet_legacy.%I(%s) from public, anon, authenticated',r.name,r.args);
    elsif obj_description(target,'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1' then
      raise exception 'LEGACY_CONFLICT: review %. No functions overwritten.',r.name;
    end if;
  end loop;
end $preserve$;

alter table public.admin_users enable row level security;
alter table public.invite_codes enable row level security;
alter table public.draw_records enable row level security;
-- Existing policies remain in place, but no API role has direct table privileges.
revoke all on public.admin_users, public.invite_codes, public.draw_records from public, anon, authenticated;
-- Column grants are separate from table grants in PostgreSQL and must be removed too.
do $column_grants$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('admin_users','invite_codes','draw_records') loop
    execute format('revoke all (%I) on table public.%I from public,anon,authenticated',c.column_name,c.table_name);
  end loop;
end $column_grants$;

create unique index if not exists sweet_invite_code_unique on public.invite_codes(code);
create unique index if not exists sweet_draw_invite_unique on public.draw_records(invite_id);
create index if not exists sweet_invites_created on public.invite_codes(created_at desc);
create index if not exists sweet_draws_created on public.draw_records(created_at desc);

create or replace function sweet_private.assert_admin()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users a where a.user_id=auth.uid()) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
end $$;

-- UUID v4 uses cryptographically secure randomness. The first 40 bits precede version bits.
-- Eight 5-bit symbols give uniformly distributed, uppercase base32 codes (40 bits).
create or replace function sweet_private.random_code()
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare bits bigint; output text := ''; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; j integer;
begin
  bits := ('x'||substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,10))::bit(40)::bigint;
  for j in 1..8 loop
    output := output || substr(alphabet,((bits & 31)::integer)+1,1);
    bits := bits >> 5;
  end loop;
  return output;
end $$;

create or replace function sweet_private.random_prize()
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare n integer;
begin
  -- Reject 255 so that the remaining 255 possible bytes divide exactly by three.
  loop
    n := pg_catalog.get_byte(pg_catalog.uuid_send(pg_catalog.gen_random_uuid()),0);
    exit when n<255;
  end loop;
  return (array['蛋糕','奶茶','小吃'])[1+(n%3)];
end $$;

create or replace function public.redeem_and_draw(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' set statement_timeout = '15s' as $$
declare invitation public.invite_codes%rowtype; record_id uuid; award text; stamp timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then
    raise exception 'INVALID_CODE' using errcode='22023';
  end if;
  select * into invitation from public.invite_codes where code=p_code for update;
  if not found then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  if invitation.is_used or invitation.used_at is not null then
    raise exception 'CODE_USED' using errcode='22023';
  end if;
  record_id := pg_catalog.gen_random_uuid();
  award := sweet_private.random_prize();
  stamp := pg_catalog.clock_timestamp();
  update public.invite_codes set is_used=true,used_at=stamp where id=invitation.id;
  insert into public.draw_records(id,invite_id,prize,created_at) values(record_id,invitation.id,award,stamp);
  -- UPDATE and INSERT are in the same RPC transaction; any exception rolls both back.
  return jsonb_build_object('id',record_id,'prize',award,'created_at',stamp);
end $$;

-- An already-spent invitation is the recovery credential; no identity/private rows returned.
-- This is read-only, and can never redeem/re-randomize an invitation.
create or replace function public.get_draw_result(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '10s' as $$
declare receipt jsonb;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  select jsonb_build_object('id',d.id,'prize',d.prize,'created_at',d.created_at) into receipt
  from public.draw_records d join public.invite_codes i on i.id=d.invite_id
  where i.code=p_code and i.is_used;
  return receipt;
end $$;

create or replace function public.admin_generate_codes(p_count integer)
returns jsonb language plpgsql volatile security definer set search_path = '' set statement_timeout = '15s' as $$
declare inserted public.invite_codes%rowtype; generated jsonb := '[]'::jsonb; candidate text; j integer; attempts integer;
begin
  perform sweet_private.assert_admin();
  if p_count is null or p_count<1 or p_count>500 then raise exception 'COUNT_OUT_OF_RANGE' using errcode='22023'; end if;
  for j in 1..p_count loop
    attempts := 0;
    loop
      attempts := attempts+1;
      if attempts>20 then raise exception 'CODE_GENERATION_FAILED'; end if;
      candidate := sweet_private.random_code();
      insert into public.invite_codes(id,code,is_used,created_by,created_at,used_at)
      values(pg_catalog.gen_random_uuid(),candidate,false,auth.uid(),pg_catalog.clock_timestamp(),null)
      on conflict(code) do nothing returning * into inserted;
      exit when found;
    end loop;
    generated := generated || jsonb_build_array(jsonb_build_object('id',inserted.id,'code',inserted.code,'is_used',inserted.is_used,'created_at',inserted.created_at,'used_at',inserted.used_at));
  end loop;
  return generated;
end $$;

-- JSON arrays avoid PostgREST's default table-row cap silently truncating admin totals.
create or replace function public.admin_list_invites()
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '15s' as $$
declare result jsonb;
begin
  perform sweet_private.assert_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'is_used',i.is_used,'created_at',i.created_at,'used_at',i.used_at) order by i.created_at desc,i.id),'[]'::jsonb) into result from public.invite_codes i;
  return result;
end $$;

create or replace function public.admin_list_draws()
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '15s' as $$
declare result jsonb;
begin
  perform sweet_private.assert_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code',i.code,'prize',d.prize,'created_at',d.created_at) order by d.created_at desc,d.id),'[]'::jsonb) into result
  from public.draw_records d join public.invite_codes i on i.id=d.invite_id;
  return result;
end $$;

alter function public.redeem_and_draw(text) owner to postgres;
alter function public.get_draw_result(text) owner to postgres;
alter function public.admin_generate_codes(integer) owner to postgres;
alter function public.admin_list_invites() owner to postgres;
alter function public.admin_list_draws() owner to postgres;

revoke all on function sweet_private.assert_admin(),sweet_private.random_code(),sweet_private.random_prize() from public,anon,authenticated;
revoke all on function public.redeem_and_draw(text),public.get_draw_result(text),public.admin_generate_codes(integer),public.admin_list_invites(),public.admin_list_draws() from public,anon,authenticated;
grant execute on function public.redeem_and_draw(text),public.get_draw_result(text) to anon,authenticated;
grant execute on function public.admin_generate_codes(integer),public.admin_list_invites(),public.admin_list_draws() to authenticated;

comment on function public.redeem_and_draw(text) is 'sweet-lucky-draw:secure-v1';
comment on function public.get_draw_result(text) is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_generate_codes(integer) is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_list_invites() is 'sweet-lucky-draw:secure-v1';
comment on function public.admin_list_draws() is 'sweet-lucky-draw:secure-v1';

notify pgrst, 'reload schema';
commit;
