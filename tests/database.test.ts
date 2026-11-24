// Genuine PostgreSQL SQL/roles in PGlite. Single connection: this is NOT a live concurrency test.
// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const adminId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
let migration: string;

async function asRole(role: 'anon' | 'authenticated', user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    return tx.query(sql, params);
  });
}

beforeAll(async () => {
  db = new PGlite();
  const fixture = await readFile(new URL('./fixtures/database.sql', import.meta.url), 'utf8');
  migration = await readFile(new URL('../supabase/migrations/202611240001_harden_existing_draw.sql', import.meta.url), 'utf8');
  await db.exec(fixture);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });

describe('proposed migration on supported fixture', () => {
  it('preserves pre-existing rows and administrator', async () => {
    expect((await db.query('select count(*)::int n from public.admin_users')).rows).toEqual([{ n: 1 }]);
    expect((await db.query("select code from public.invite_codes where code='EXISTING'")).rows).toEqual([{ code: 'EXISTING' }]);
    expect((await db.query("select sweet_legacy.redeem_and_draw('EXISTING') result")).rows).toEqual([{ result: 'legacy' }]);
  });
  it('reapplies without moving new secure functions into the legacy schema', async () => {
    await db.exec(migration);
    expect((await db.query("select obj_description('public.redeem_and_draw(text)'::regprocedure,'pg_proc') marker")).rows).toEqual([{ marker: 'sweet-lucky-draw:secure-v1' }]);
  });
  it('rejects anonymous admin RPC execution', async () => {
    for (const sql of ['select public.admin_list_invites()', 'select public.admin_list_draws()', 'select public.admin_generate_codes(1)']) {
      await expect(asRole('anon', '', sql)).rejects.toThrow(/permission denied/i);
    }
  });
  it('rejects authenticated non-admin RPC execution', async () => {
    for (const sql of ['select public.admin_list_invites()', 'select public.admin_list_draws()', 'select public.admin_generate_codes(1)']) {
      await expect(asRole('authenticated', userId, sql)).rejects.toThrow(/NOT_ADMIN/);
    }
  });
  it('denies direct reads and self-promotion on all three tables', async () => {
    for (const role of ['anon', 'authenticated'] as const) for (const table of ['admin_users', 'invite_codes', 'draw_records']) {
      await expect(asRole(role, userId, `select * from public.${table}`)).rejects.toThrow(/permission denied/i);
    }
    await expect(asRole('authenticated', userId, 'insert into public.admin_users(user_id) values($1)', [userId])).rejects.toThrow(/permission denied/i);
    await expect(asRole('anon', '', 'select code from public.invite_codes')).rejects.toThrow(/permission denied/i);
    await expect(asRole('authenticated', userId, 'update public.invite_codes set is_used=true')).rejects.toThrow(/permission denied/i);
  });
  it('hides preserved legacy RPCs and helper functions from API roles', async () => {
    await expect(asRole('anon', '', "select sweet_legacy.redeem_and_draw('EXISTING')")).rejects.toThrow(/permission denied/i);
    await expect(asRole('authenticated', userId, 'select sweet_private.random_code()')).rejects.toThrow(/permission denied/i);
  });
  it('generates 1 and 500 unique codes as an authorized administrator', async () => {
    for (const count of [1, 500]) {
      const result = await asRole('authenticated', adminId, 'select public.admin_generate_codes($1) codes', [count]);
      const codes = (result.rows[0] as { codes: { code: string }[] }).codes;
      expect(codes).toHaveLength(count);
      expect(new Set(codes.map(r => r.code)).size).toBe(count);
      expect(codes.every(r => /^[A-Z0-9]{8}$/.test(r.code))).toBe(true);
    }
  });
  it('rejects invalid batch counts without inserting rows', async () => {
    const before = (await db.query('select count(*)::int n from public.invite_codes')).rows;
    for (const count of [0, -1, 501, null]) await expect(asRole('authenticated', adminId, 'select public.admin_generate_codes($1)', [count])).rejects.toThrow('COUNT_OUT_OF_RANGE');
    expect((await db.query('select count(*)::int n from public.invite_codes')).rows).toEqual(before);
  });
  it('redeems one invitation and recovers the same saved record', async () => {
    const result = await asRole('anon', '', "select public.redeem_and_draw('EXISTING') receipt");
    const receipt = (result.rows[0] as { receipt: { id: string; prize: string } }).receipt;
    expect(['蛋糕', '奶茶', '小吃']).toContain(receipt.prize);
    await expect(asRole('anon', '', "select public.redeem_and_draw('EXISTING')")).rejects.toThrow('CODE_USED');
    const recovered = await asRole('anon', '', "select public.get_draw_result('EXISTING') receipt");
    expect(recovered.rows[0]).toEqual(result.rows[0]);
    const count = await db.query("select count(*)::int n from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code='EXISTING'");
    expect(count.rows).toEqual([{ n: 1 }]);
  });
  it('rejects incorrect and malformed invitations', async () => {
    for (const code of ['WRONG123', 'bad', 'abcd1234', 'ABCD!123', '', null]) await expect(asRole('anon', '', 'select public.redeem_and_draw($1)', [code])).rejects.toThrow('INVALID_CODE');
  });
  it('rolls back invitation consumption when record insertion fails', async () => {
    await db.exec("insert into public.invite_codes(code) values('ROLLBACK'); create function public.test_block_draw() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_RECORD_FAILURE'; end $$; create trigger test_block_draw before insert on public.draw_records for each row execute function public.test_block_draw();");
    await expect(asRole('anon', '', "select public.redeem_and_draw('ROLLBACK')")).rejects.toThrow('SIMULATED_RECORD_FAILURE');
    expect((await db.query("select is_used,used_at from public.invite_codes where code='ROLLBACK'")).rows).toEqual([{ is_used: false, used_at: null }]);
    await db.exec('drop trigger test_block_draw on public.draw_records; drop function public.test_block_draw();');
  });
  it('enforces a unique draw per invitation even outside the RPC', async () => {
    await expect(db.exec("insert into public.draw_records(invite_id,prize) select id,'蛋糕' from public.invite_codes where code='EXISTING'")).rejects.toThrow(/unique constraint/i);
  });
  it('lists exact totals beyond the usual PostgREST 1000-row limit', async () => {
    await asRole('authenticated', adminId, 'select public.admin_generate_codes(500)');
    const result = await asRole('authenticated', adminId, 'select public.admin_list_invites() codes');
    expect((result.rows[0] as { codes: unknown[] }).codes.length).toBeGreaterThan(1000);
    const records = await asRole('authenticated', adminId, 'select public.admin_list_draws() records');
    expect((records.rows[0] as { records: unknown[] }).records).toHaveLength(1);
  });
  it('fixes search_path for every security definer endpoint and enables RLS', async () => {
    const functions = await db.query("select p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef");
    expect(functions.rows).toHaveLength(5);
    expect(functions.rows.every(r => (r as { proconfig: string[] }).proconfig.includes('search_path=""'))).toBe(true);
    const tables = await db.query("select relrowsecurity from pg_class where oid in ('public.admin_users'::regclass,'public.invite_codes'::regclass,'public.draw_records'::regclass)");
    expect(tables.rows.every(r => (r as { relrowsecurity: boolean }).relrowsecurity)).toBe(true);
  });
  it('aborts a mismatched schema without replacing RPCs or modifying rows', async () => {
    const before = await db.query('select count(*)::int n from public.invite_codes');
    await db.exec('alter table public.invite_codes rename column created_by to legacy_owner');
    await expect(db.exec(migration)).rejects.toThrow(/SCHEMA_MISMATCH/);
    await db.exec('rollback');
    expect((await db.query('select count(*)::int n from public.invite_codes')).rows).toEqual(before.rows);
    expect((await db.query("select sweet_legacy.redeem_and_draw('EXISTING') result")).rows).toEqual([{ result: 'legacy' }]);
    await db.exec('alter table public.invite_codes rename column legacy_owner to created_by');
  });
});
