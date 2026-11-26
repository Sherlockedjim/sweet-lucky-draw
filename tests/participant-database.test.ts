// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
let migration: string;
let historical: Record<string, unknown>;
const adminId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const avatar='data:image/jpeg;base64,/9j/2Q==';
async function role(role:'anon'|'authenticated',user:string,sql:string,params:unknown[]=[]) {
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    return tx.query(sql,params);
  });
}
async function invite(code:string) {
  await db.query("insert into public.invite_codes(code_hash,code_suffix) values(encode(sha256(convert_to($1,'UTF8')),'hex'),right($1,4))",[code]);
}
async function redeem(code:string,nickname:string|null='云朵同学',photo:string|null=avatar) {
  const value=await role('anon','','select public.redeem_and_draw($1,$2,$3) receipt',[code,nickname,photo]);
  return (value.rows[0] as {receipt:Record<string,unknown>}).receipt;
}
beforeAll(async()=>{
  db=new PGlite();
  for (const file of ['./fixtures/database.sql','../supabase/migrations/20261124094234_secure_existing_hashed_invites.sql','../supabase/migrations/20261126023841_six_boxes_with_happy_messages.sql']) await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
  historical=(await role('anon','',"select public.redeem_and_draw('EXISTING') receipt")).rows[0] as Record<string,unknown>;
  migration=await readFile(new URL('../supabase/migrations/20261126064040_persist_participant_profiles.sql',import.meta.url),'utf8');
  await db.exec(migration);
},30000);
afterAll(async()=>{await db?.close();});

describe('participant snapshot migration',()=>{
  it('preserves historical prizes, record IDs and existing administrator',async()=>{
    const recovered=await role('anon','',"select public.get_draw_result('EXISTING') receipt");
    expect((recovered.rows[0] as {receipt:unknown}).receipt).toEqual({...historical.receipt as object,participant:null});
    expect((await db.query('select count(*)::int n from public.admin_users')).rows).toEqual([{n:1}]);
  });
  it('rejects missing, blank, malformed and oversized profiles without consuming the invitation',async()=>{
    await invite('PROFILE1');
    for (const [name,photo] of [[null,avatar],['云朵',null],['   ',avatar],['云\n朵',avatar],['x'.repeat(257),avatar],['云朵','https://example.test/avatar.jpg'],['云朵','data:image/svg+xml;base64,PHN2Zz4='],['云朵','data:image/jpeg;base64,YWJjZA=='],['云朵','data:image/jpeg;base64,/9j/AAAA'],['云朵','data:image/jpeg;base64,'+'A'.repeat(120000)]] as [string|null,string|null][]) await expect(redeem('PROFILE1',name,photo)).rejects.toThrow(/PROFILE_REQUIRED|INVALID_PROFILE/);
    expect((await db.query("select status from public.invite_codes where code_suffix='ILE1'")).rows).toEqual([{status:'unused'}]);
  });
  it('rejects outdated one-argument calls and hides the archived bypass',async()=>{
    await expect(role('anon','',"select public.redeem_and_draw('PROFILE1')")).rejects.toThrow('PROFILE_REQUIRED');
    await expect(role('anon','',"select sweet_legacy.redeem_without_profile('PROFILE1')")).rejects.toThrow(/permission denied/);
    expect((await db.query("select to_regprocedure('public.redeem_and_draw(text)') old")).rows).toEqual([{old:null}]);
  });
  it('atomically saves nickname and avatar and recovers them in a fresh client',async()=>{
    const receipt=await redeem('PROFILE1');
    expect(receipt.participant).toEqual({nickname:'云朵同学',avatar});
    const fresh=await role('authenticated',userId,"select public.get_draw_result('PROFILE1') receipt");
    expect((fresh.rows[0] as {receipt:unknown}).receipt).toEqual(receipt);
    expect((await db.query("select i.status,d.participant_nickname,d.participant_avatar from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_suffix='ILE1'")).rows).toEqual([{status:'used',participant_nickname:'云朵同学',participant_avatar:avatar}]);
  });
  it('cannot overwrite the snapshot by drawing the same invitation again',async()=>{
    await expect(redeem('PROFILE1','另一位')).rejects.toThrow('CODE_USED');
    expect((await db.query("select participant_nickname from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_suffix='ILE1'")).rows).toEqual([{participant_nickname:'云朵同学'}]);
  });
  it('allows administrators to list profiles but denies ordinary and anonymous list access',async()=>{
    const listed=await role('authenticated',adminId,'select public.admin_list_draws() records');
    expect((listed.rows[0] as {records:{participant:unknown}[]}).records.some(r=>JSON.stringify(r.participant)===JSON.stringify({avatar,nickname:'云朵同学'}))).toBe(true);
    await expect(role('anon','','select public.admin_list_draws()')).rejects.toThrow(/permission denied/);
    await expect(role('authenticated',userId,'select public.admin_list_draws()')).rejects.toThrow('NOT_ADMIN');
  });
  it('denies direct profile column reads and writes and keeps helpers private',async()=>{
    for(const r of ['anon','authenticated'] as const) {
      await expect(role(r,userId,'select participant_avatar from public.draw_records')).rejects.toThrow(/permission denied/);
      await expect(role(r,userId,"update public.draw_records set participant_nickname='changed'")).rejects.toThrow(/permission denied/);
      await expect(role(r,userId,'select sweet_private.valid_participant($1,$2)',['云朵',avatar])).rejects.toThrow(/permission denied/);
    }
  });
  it('rolls back profile, award and invitation use together when inserting a record fails',async()=>{
    await invite('ROLLPRO1');
    await db.exec("create function public.block_profile_test() returns trigger language plpgsql as $$ begin raise exception 'TEST_FAILURE'; end $$; create trigger block_profile_test before insert on public.draw_records for each row execute function public.block_profile_test();");
    try { await expect(redeem('ROLLPRO1')).rejects.toThrow('TEST_FAILURE'); }
    finally { await db.exec('drop trigger block_profile_test on public.draw_records; drop function public.block_profile_test();'); }
    expect((await db.query("select status,redeemed_at from public.invite_codes where code_suffix='PRO1'")).rows).toEqual([{status:'unused',redeemed_at:null}]);
    expect((await db.query("select count(*)::int n from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_suffix='PRO1'")).rows).toEqual([{n:0}]);
  });
  it('fills historical profiles once without changing the prize, date or ID',async()=>{
    const saved=await role('anon','','select public.save_draw_profile($1,$2,$3) receipt',['EXISTING','旧参与者',avatar]);
    expect((saved.rows[0] as {receipt:unknown}).receipt).toEqual({...historical.receipt as object,participant:{nickname:'旧参与者',avatar}});
    const repeat=await role('anon','','select public.save_draw_profile($1,$2,$3) receipt',['EXISTING','不能覆盖',avatar]);
    expect(repeat.rows).toEqual(saved.rows);
    expect((await db.query("select count(*)::int n from public.draw_records d join public.invite_codes i on i.id=d.invite_id where i.code_suffix='TING'")).rows).toEqual([{n:1}]);
  });
  it('rejects profile attachment to an unused or nonexistent invitation',async()=>{
    for(const code of ['ROLLPRO1','MISSING1']) await expect(role('anon','','select public.save_draw_profile($1,$2,$3)',[code,'云朵',avatar])).rejects.toThrow(/DRAW_NOT_FOUND|INVALID_CODE/);
    expect((await role('anon','',"select public.get_draw_result('MISSING1') receipt")).rows).toEqual([{receipt:null}]);
  });
  it('supports 24 family emoji without splitting them at the SQL boundary',async()=>{
    await invite('EMOJI123'); const nickname='👨‍👩‍👧‍👦'.repeat(24);
    expect((await redeem('EMOJI123',nickname)).participant).toEqual({nickname,avatar});
  });
  it('enforces profile pairing even on direct database inserts',async()=>{
    await expect(db.query("insert into public.draw_records(invite_id,prize,participant_nickname) select id,'cake','partial' from public.invite_codes where code_suffix='PRO1'")).rejects.toThrow(/check constraint/);
  });
  it('reapplies without losing saved data and retains RLS and fixed search paths',async()=>{
    const before=await db.query('select * from public.draw_records order by id');
    await db.exec(migration);
    expect((await db.query('select * from public.draw_records order by id')).rows).toEqual(before.rows);
    expect((await db.query("select bool_and(relrowsecurity) ok from pg_class where oid in ('public.admin_users'::regclass,'public.invite_codes'::regclass,'public.draw_records'::regclass)")).rows).toEqual([{ok:true}]);
    const funcs=await db.query("select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef");
    expect(funcs.rows.every(r=>(r as {proconfig:string[]}).proconfig.includes('search_path=""'))).toBe(true);
  });
});
