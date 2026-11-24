-- LOCAL DISPOSABLE TEST FIXTURE ONLY. NEVER run this against the Supabase project.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table public.admin_users(user_id uuid primary key,created_at timestamptz not null default now());
create table public.invite_codes(id uuid primary key default gen_random_uuid(),code text not null unique,is_used boolean not null default false,created_by uuid,created_at timestamptz not null default now(),used_at timestamptz);
create table public.draw_records(id uuid primary key default gen_random_uuid(),invite_id uuid not null references public.invite_codes(id),prize text not null,created_at timestamptz not null default now());
-- Simulate old unrestricted RPCs to prove they are preserved but no longer reachable.
create function public.redeem_and_draw(p_code text) returns text language sql as $$ select 'legacy' $$;
create function public.admin_generate_codes(p_count integer) returns text language sql as $$ select 'legacy' $$;
create function public.admin_list_invites() returns text language sql as $$ select 'legacy' $$;
create function public.admin_list_draws() returns text language sql as $$ select 'legacy' $$;
insert into public.admin_users(user_id) values('00000000-0000-4000-8000-000000000001');
insert into public.invite_codes(code) values('EXISTING');
grant select(code),update(is_used) on public.invite_codes to anon,authenticated;
create policy legacy_broad_policy on public.invite_codes for all to public using (true) with check (true);
