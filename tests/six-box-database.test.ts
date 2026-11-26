// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
let migration: string;
let historical: unknown;
const adminId='00000000-0000-4000-8000-000000000001';

async function asRole(role:'anon'|'authenticated', user:string, sql:string) {
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    return tx.query(sql);
  });
}

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(await readFile(new URL('./fixtures/database.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261124094234_secure_existing_hashed_invites.sql',import.meta.url),'utf8'));
  historical=(await asRole('anon','',"select public.redeem_and_draw('EXISTING') receipt")).rows[0];
  migration=await readFile(new URL('../supabase/migrations/20261126023841_six_boxes_with_happy_messages.sql',import.meta.url),'utf8');
  await db.exec(migration);
},30000);
afterAll(async()=>{await db?.close();});

describe('six-box migration',()=>{
  it('preserves the administrator and previously saved physical result',async()=>{
    expect((await db.query('select count(*)::int n from public.admin_users')).rows).toEqual([{n:1}]);
    expect((await asRole('anon','',"select public.get_draw_result('EXISTING') receipt")).rows[0]).toEqual(historical);
    expect((await db.query('select count(*)::int n from public.draw_records')).rows).toEqual([{n:1}]);
  });
  it('assigns one treat to each of three slots and wishes to the other three',async()=>{
    const result=await db.query('select sweet_private.box_prize(n) prize from generate_series(0,5) n order by n');
    expect(result.rows.map(r=>(r as {prize:string}).prize)).toEqual(['cake','milk_tea','snack','happy','happy','happy']);
    const counts=await db.query('select sweet_private.box_prize(n%6) prize,count(*)::int n from generate_series(0,251) n group by 1 order by 1');
    expect(counts.rows).toEqual([{prize:'cake',n:42},{prize:'happy',n:126},{prize:'milk_tea',n:42},{prize:'snack',n:42}]);
    const source=(await db.query("select pg_get_functiondef('sweet_private.random_prize()'::regprocedure) source")).rows[0] as {source:string};
    expect(source.source).toMatch(/n<252/);
    expect(source.source).toMatch(/box_prize\(n%6\)/);
  });
  it('keeps the new helper private and continues denying non-admin access',async()=>{
    await expect(asRole('anon','', 'select sweet_private.box_prize(3)')).rejects.toThrow(/permission denied/);
    await expect(asRole('authenticated','00000000-0000-4000-8000-000000000002','select public.admin_generate_codes(1)')).rejects.toThrow('NOT_ADMIN');
    const privileges=await db.query("select has_function_privilege('anon','sweet_private.box_prize(integer)','execute') allowed");
    expect(privileges.rows).toEqual([{allowed:false}]);
  });
  it('keeps RLS and fixed search paths on the existing public RPCs',async()=>{
    expect((await db.query("select bool_and(relrowsecurity) enabled from pg_class where oid in ('public.admin_users'::regclass,'public.invite_codes'::regclass,'public.draw_records'::regclass)")).rows).toEqual([{enabled:true}]);
    const functions=await db.query("select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef");
    expect(functions.rows).toHaveLength(5);
    expect(functions.rows.every(r=>(r as {proconfig:string[]}).proconfig.includes('search_path=""'))).toBe(true);
  });
  it('consumes a happy invitation once and restores its exact recorded wish',async()=>{
    await db.exec("insert into public.invite_codes(code_hash,code_suffix) values(encode(sha256(convert_to('HAPPY123','UTF8')),'hex'),'Y123');");
    const original=(await db.query("select pg_get_functiondef('sweet_private.random_prize()'::regprocedure) source")).rows[0] as {source:string};
    await db.exec("create or replace function sweet_private.random_prize() returns text language sql volatile security invoker set search_path='' as $$ select 'happy'::text $$;");
    try {
      const receipt=await asRole('anon','',"select public.redeem_and_draw('HAPPY123') receipt");
      expect((receipt.rows[0] as {receipt:{prize:string}}).receipt.prize).toBe('送你一天的开心～');
      await expect(asRole('anon','',"select public.redeem_and_draw('HAPPY123')")).rejects.toThrow('CODE_USED');
      expect((await asRole('anon','',"select public.get_draw_result('HAPPY123') receipt")).rows).toEqual(receipt.rows);
      expect((await db.query("select status,prize from public.invite_codes where code_suffix='Y123'")).rows).toEqual([{status:'used',prize:'happy'}]);
      expect((await db.query("select count(*)::int n from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_suffix='Y123'")).rows).toEqual([{n:1}]);
      const records=await asRole('authenticated',adminId,'select public.admin_list_draws() records');
      expect((records.rows[0] as {records:{prize:string}[]}).records.some(r=>r.prize==='送你一天的开心～')).toBe(true);
    } finally { await db.exec(original.source); }
  });
  it('can be reapplied without losing physical or happy records',async()=>{
    const before=await db.query('select id,prize from public.draw_records order by id');
    await db.exec(migration);
    expect((await db.query('select id,prize from public.draw_records order by id')).rows).toEqual(before.rows);
  });
});
