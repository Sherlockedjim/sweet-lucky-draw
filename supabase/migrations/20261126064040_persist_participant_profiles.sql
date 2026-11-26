-- Preserve all existing records. New draws atomically store the participant snapshot.
begin;
set local lock_timeout='5s';
lock table public.invite_codes,public.draw_records in access exclusive mode;

do $preflight$
begin
  if current_user <> 'postgres' then raise exception 'PREFLIGHT: run as postgres'; end if;
  if to_regprocedure('sweet_private.box_prize(integer)') is null
     or coalesce(obj_description('public.admin_list_draws()'::regprocedure,'pg_proc'),'') not in ('sweet-lucky-draw:secure-v1','sweet-lucky-draw:profiles-v1') then
    raise exception 'PREFLIGHT: audited six-box implementation required';
  end if;
  if coalesce(obj_description('public.get_draw_result(text)'::regprocedure,'pg_proc'),'') not in ('sweet-lucky-draw:secure-v1','sweet-lucky-draw:profiles-v1')
     or (to_regprocedure('public.save_draw_profile(text,text,text)') is not null
         and obj_description(to_regprocedure('public.save_draw_profile(text,text,text)'),'pg_proc') is distinct from 'sweet-lucky-draw:profiles-v1') then
    raise exception 'PREFLIGHT: existing profile endpoints require review';
  end if;
  if to_regprocedure('public.redeem_and_draw(text)') is not null then
    if obj_description('public.redeem_and_draw(text)'::regprocedure,'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1'
       or to_regprocedure('sweet_legacy.redeem_without_profile(text)') is not null
       or to_regprocedure('public.redeem_and_draw(text,text,text)') is not null then
      raise exception 'PREFLIGHT: existing draw functions require review';
    end if;
    alter function public.redeem_and_draw(text) rename to redeem_without_profile;
    alter function public.redeem_without_profile(text) set schema sweet_legacy;
    revoke all on function sweet_legacy.redeem_without_profile(text) from public,anon,authenticated;
  elsif obj_description(to_regprocedure('public.redeem_and_draw(text,text,text)'),'pg_proc') is distinct from 'sweet-lucky-draw:profiles-v1' then
    raise exception 'PREFLIGHT: unknown draw implementation';
  end if;
end $preflight$;

alter table public.draw_records add column if not exists participant_nickname text;
alter table public.draw_records add column if not exists participant_avatar text;

create or replace function sweet_private.valid_participant(p_nickname text,p_avatar text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare image bytea; n integer;
begin
  if p_nickname is null or p_avatar is null or char_length(p_nickname)>256
     or octet_length(p_nickname)>1024 or p_nickname !~ '[^[:space:]]'
     or p_nickname ~ '[[:cntrl:]]' or octet_length(p_avatar)>120000
     or p_avatar !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  image:=pg_catalog.decode(substr(p_avatar,24),'base64'); n:=octet_length(image);
  return n>=4 and pg_catalog.get_byte(image,0)=255 and pg_catalog.get_byte(image,1)=216
    and pg_catalog.get_byte(image,2)=255 and pg_catalog.get_byte(image,n-2)=255 and pg_catalog.get_byte(image,n-1)=217;
exception when invalid_parameter_value or invalid_text_representation then return false;
end $$;

alter table public.draw_records drop constraint if exists draw_records_participant_check;
alter table public.draw_records add constraint draw_records_participant_check check (
  (participant_nickname is null and participant_avatar is null)
  or sweet_private.valid_participant(participant_nickname,participant_avatar)
);

create or replace function sweet_private.receipt_json(p_record public.draw_records)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_record.id,'prize',sweet_private.display_prize(p_record.prize),'created_at',p_record.drawn_at,
    'participant',case when p_record.participant_nickname is null then null
      else jsonb_build_object('nickname',p_record.participant_nickname,'avatar',p_record.participant_avatar) end);
$$;

-- Defaults deliberately reject outdated one-argument clients instead of bypassing collection.
create or replace function public.redeem_and_draw(p_code text,p_nickname text default null,p_avatar text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare invitation public.invite_codes%rowtype; receipt public.draw_records%rowtype; award text; stamp timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  if p_nickname is null or p_avatar is null then raise exception 'PROFILE_REQUIRED' using errcode='22023'; end if;
  if not sweet_private.valid_participant(p_nickname,p_avatar) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  select * into invitation from public.invite_codes where code_hash=sweet_private.hash_code(p_code) for update;
  if not found then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  if invitation.status<>'unused' then raise exception 'CODE_USED' using errcode='22023'; end if;
  award:=sweet_private.random_prize(); stamp:=pg_catalog.clock_timestamp();
  update public.invite_codes set status='used',prize=award,redeemed_at=stamp where id=invitation.id;
  insert into public.draw_records(id,invite_id,prize,drawn_at,participant_nickname,participant_avatar)
    values(pg_catalog.gen_random_uuid(),invitation.id,award,stamp,btrim(p_nickname),p_avatar) returning * into receipt;
  return sweet_private.receipt_json(receipt);
end $$;

create or replace function public.get_draw_result(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare receipt jsonb;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  select sweet_private.receipt_json(d) into receipt from public.draw_records d
    join public.invite_codes i on i.id=d.invite_id where i.code_hash=sweet_private.hash_code(p_code) and i.status='used';
  return receipt;
end $$;

-- Only a holder of the exact original code may fill a historical empty profile, once.
-- Repeats return the stored snapshot and never overwrite it or draw again.
create or replace function public.save_draw_profile(p_code text,p_nickname text,p_avatar text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare invitation public.invite_codes%rowtype; receipt public.draw_records%rowtype;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  if not sweet_private.valid_participant(p_nickname,p_avatar) then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  select * into invitation from public.invite_codes where code_hash=sweet_private.hash_code(p_code) for update;
  if not found then raise exception 'INVALID_CODE' using errcode='22023'; end if;
  select * into receipt from public.draw_records where invite_id=invitation.id for update;
  if not found or invitation.status<>'used' then raise exception 'DRAW_NOT_FOUND' using errcode='22023'; end if;
  if receipt.participant_nickname is null and receipt.participant_avatar is null then
    update public.draw_records set participant_nickname=btrim(p_nickname),participant_avatar=p_avatar
      where id=receipt.id returning * into receipt;
  end if;
  return sweet_private.receipt_json(receipt);
end $$;

create or replace function public.admin_list_draws()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform sweet_private.assert_admin();
  select coalesce(jsonb_agg((sweet_private.receipt_json(d)||jsonb_build_object('code','••••'||i.code_suffix,'code_suffix',i.code_suffix))
    order by d.drawn_at desc,d.id),'[]'::jsonb) into result
    from public.draw_records d join public.invite_codes i on i.id=d.invite_id;
  return result;
end $$;

alter function sweet_private.valid_participant(text,text) owner to postgres;
alter function sweet_private.receipt_json(public.draw_records) owner to postgres;
alter function public.redeem_and_draw(text,text,text) owner to postgres;
alter function public.get_draw_result(text) owner to postgres;
alter function public.save_draw_profile(text,text,text) owner to postgres;
alter function public.admin_list_draws() owner to postgres;
revoke all on public.draw_records from public,anon,authenticated;
alter table public.draw_records enable row level security;
revoke all on function sweet_private.valid_participant(text,text),sweet_private.receipt_json(public.draw_records) from public,anon,authenticated;
revoke all on function public.redeem_and_draw(text,text,text),public.get_draw_result(text),public.save_draw_profile(text,text,text),public.admin_list_draws() from public,anon,authenticated;
grant execute on function public.redeem_and_draw(text,text,text),public.get_draw_result(text),public.save_draw_profile(text,text,text) to anon,authenticated;
grant execute on function public.admin_list_draws() to authenticated;
comment on function public.redeem_and_draw(text,text,text) is 'sweet-lucky-draw:profiles-v1';
comment on function public.get_draw_result(text) is 'sweet-lucky-draw:profiles-v1';
comment on function public.save_draw_profile(text,text,text) is 'sweet-lucky-draw:profiles-v1';
comment on function public.admin_list_draws() is 'sweet-lucky-draw:profiles-v1';
notify pgrst,'reload schema';
commit;
