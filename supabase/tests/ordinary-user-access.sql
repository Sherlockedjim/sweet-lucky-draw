-- Real database role/JWT-claim simulation, NOT a Supabase Auth password login.
-- Run as the project owner with db query --read-only. No lasting writes.
begin read only;
do $$ begin
  if exists(select 1 from public.admin_users where user_id='00000000-0000-4000-8000-000000000002') then
    raise exception 'Test subject unexpectedly belongs to admin_users';
  end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $$ begin
  if auth.uid() is distinct from '00000000-0000-4000-8000-000000000002'::uuid then raise exception 'Test claims not set'; end if;
  begin
    perform public.admin_list_invites();
    raise exception 'UNEXPECTED_ADMIN_ACCESS';
  exception when insufficient_privilege then if sqlerrm<>'NOT_ADMIN' then raise; end if; end;
  begin
    perform public.admin_list_draws();
    raise exception 'UNEXPECTED_ADMIN_ACCESS';
  exception when insufficient_privilege then if sqlerrm<>'NOT_ADMIN' then raise; end if; end;
  begin
    perform public.admin_generate_codes(1);
    raise exception 'UNEXPECTED_ADMIN_ACCESS';
  exception when insufficient_privilege then if sqlerrm<>'NOT_ADMIN' then raise; end if; end;
end $$;
commit;
