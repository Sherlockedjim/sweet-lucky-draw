-- READ ONLY. Run in the existing sweet-lucky-draw project before any migration.
-- Does not return Auth tokens, passwords, invite values, or administrator UUIDs.
select jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('admin_users','invite_codes','draw_records')),
  'columns', (select jsonb_agg(to_jsonb(c)) from (select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('admin_users','invite_codes','draw_records') order by table_name,ordinal_position) c),
  'constraints', (select jsonb_agg(jsonb_build_object('table',cl.relname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relname in ('admin_users','invite_codes','draw_records')),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('admin_users','invite_codes','draw_records')),
  'grants', (select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema='public' and table_name in ('admin_users','invite_codes','draw_records') and grantee in ('anon','authenticated','PUBLIC')),
  'column_grants', (select jsonb_agg(to_jsonb(g)) from information_schema.column_privileges g where table_schema='public' and table_name in ('admin_users','invite_codes','draw_records') and grantee in ('anon','authenticated','PUBLIC')),
  'security_definer_functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef),
  'functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('redeem_and_draw','get_draw_result','save_draw_profile','admin_generate_codes','admin_list_invites','admin_list_draws','is_admin')),
  'counts', jsonb_build_object('admin_users',(select count(*) from public.admin_users),'invite_codes',(select count(*) from public.invite_codes),'draw_records',(select count(*) from public.draw_records))
)) as audit;
