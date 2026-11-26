-- Six equally likely boxes: cake, milk tea, snack, and three happy wishes.
-- Existing invitations, results, administrator membership, RLS and public RPCs are preserved.
begin;
set local lock_timeout='5s';
lock table public.invite_codes,public.draw_records in access exclusive mode;

do $preflight$
begin
  if current_user <> 'postgres' then raise exception 'PREFLIGHT: run as postgres'; end if;
  if obj_description(to_regprocedure('public.redeem_and_draw(text)'),'pg_proc') is distinct from 'sweet-lucky-draw:secure-v1'
     or to_regprocedure('sweet_private.random_prize()') is null
     or to_regprocedure('sweet_private.display_prize(text)') is null then
    raise exception 'PREFLIGHT: audited RPC implementation is required';
  end if;
  if to_regprocedure('sweet_private.box_prize(integer)') is not null
     and obj_description(to_regprocedure('sweet_private.box_prize(integer)'),'pg_proc') is distinct from 'sweet-lucky-draw:six-boxes-v1' then
    raise exception 'PREFLIGHT: existing box helper requires review';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.invite_codes'::regclass and conname='invite_codes_prize_check' and contype='c')
     or not exists(select 1 from pg_constraint where conrelid='public.draw_records'::regclass and conname='draw_records_prize_check' and contype='c') then
    raise exception 'PREFLIGHT: prize constraints require review';
  end if;
  if exists(select 1 from public.invite_codes where prize not in ('cake','milk_tea','snack','happy'))
     or exists(select 1 from public.draw_records where prize not in ('cake','milk_tea','snack','happy')) then
    raise exception 'PREFLIGHT: unexpected existing prize values';
  end if;
end $preflight$;

alter table public.invite_codes drop constraint invite_codes_prize_check;
alter table public.invite_codes add constraint invite_codes_prize_check
  check(prize is null or prize in ('cake','milk_tea','snack','happy'));
alter table public.draw_records drop constraint draw_records_prize_check;
alter table public.draw_records add constraint draw_records_prize_check
  check(prize in ('cake','milk_tea','snack','happy'));

create or replace function sweet_private.box_prize(p_slot integer)
returns text language sql immutable strict security invoker set search_path='' as $$
  select (array['cake','milk_tea','snack','happy','happy','happy'])[p_slot+1];
$$;

create or replace function sweet_private.random_prize()
returns text language plpgsql volatile security invoker set search_path='' as $$
declare n integer;
begin
  -- The first UUID byte is fully random. 252 accepted values give 42 per slot.
  loop n:=pg_catalog.get_byte(pg_catalog.uuid_send(pg_catalog.gen_random_uuid()),0); exit when n<252; end loop;
  return sweet_private.box_prize(n%6);
end $$;

create or replace function sweet_private.display_prize(p_prize text)
returns text language sql immutable security invoker set search_path='' as $$
  select case p_prize when 'cake' then '蛋糕' when 'milk_tea' then '奶茶' when 'snack' then '小吃' when 'happy' then '送你一天的开心～' end;
$$;

alter function sweet_private.box_prize(integer) owner to postgres;
revoke all on function sweet_private.box_prize(integer),sweet_private.random_prize(),sweet_private.display_prize(text)
  from public,anon,authenticated;
comment on function sweet_private.box_prize(integer) is 'sweet-lucky-draw:six-boxes-v1';
notify pgrst,'reload schema';
commit;
