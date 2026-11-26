// Real anonymous HTTP tests against the configured Supabase project.
// Input: an ignored JSON array of freshly generated {id,code} invitations.
// Does not use privileged keys or create/delete Auth users.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const testProfile = { p_nickname: '自动联调测试', p_avatar: 'data:image/jpeg;base64,' + (await readFile(new URL('../tests/fixtures/avatar.jpg', import.meta.url))).toString('base64') };
const url=process.env.VITE_SUPABASE_URL, key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert(url && key && !key.startsWith('sb_secret_'),'Public connection configuration required');
if(!key.startsWith('sb_publishable_')) {
  assert.equal(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role,'anon');
}
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const first=client(),second=client();
const rpc=(c,name,args={})=>c.rpc(name,args).abortSignal(AbortSignal.timeout(20000));
async function readRpc(c,name,args={}) {
  for(let attempt=0;attempt<3;attempt++) {
    const value=await rpc(c,name,args);
    if(!value.error || !/fetch|network|timeout|abort/i.test(value.error.message) || attempt===2) return value;
  }
}
const results=[];
const seeds=process.argv[2] ? JSON.parse(await readFile(process.argv[2],'utf8')) : null;
if(seeds) assert(seeds.length>=2 && seeds.every(r=>/^[A-Z0-9]{8}$/.test(r.code))); 
async function check(name,body) {
  try { await body();results.push({name,status:'PASS'});console.log(`PASS ${name}`); }
  catch(e) { results.push({name,status:'FAIL',message:String(e.message||e).replaceAll(key,'[redacted]')});console.error(`FAIL ${name}`); }
}
for(const method of ['admin_list_invites','admin_list_draws','admin_generate_codes']) {
  await check(`anonymous denied: ${method}`,async()=>{
    const {error}=await readRpc(first,method,method==='admin_generate_codes'?{p_count:1}:{});
    assert(error && (/42501/.test(error.code)||/permission denied|NOT_ADMIN/i.test(error.message)));
  });
}
for(const table of ['admin_users','invite_codes','draw_records']) {
  await check(`direct table access denied: ${table}`,async()=>{
    let response;
    for(let attempt=0;attempt<3;attempt++) {
      response=await first.from(table).select('*').limit(1).abortSignal(AbortSignal.timeout(20000));
      if(!response.error || !/fetch|network|timeout|abort/i.test(response.error.message) || attempt===2) break;
    }
    const {data,error}=response;
    assert(error ? /42501|PGRST205/.test(error.code) || /permission denied/i.test(error.message) : Array.isArray(data)&&data.length===0);
  });
}
for(const code of ['BAD','abcd1234','ABCD!123']) {
  await check(`malformed invitation rejected: ${code}`,async()=>{
    const {error}=await readRpc(first,'redeem_and_draw',{p_code:code, ...testProfile });
    assert(error && /INVALID_CODE/.test(error.message));
  });
}
await check('missing participant rejected before invitation lookup',async()=>{
  const {error}=await readRpc(first,'redeem_and_draw',{p_code:'CHECK123'});
  assert(error && /PROFILE_REQUIRED/.test(error.message));
});
await check('invalid participant rejected before invitation lookup',async()=>{
  const {error}=await readRpc(first,'redeem_and_draw',{p_code:'CHECK123',p_nickname:'   ',p_avatar:testProfile.p_avatar});
  assert(error && /INVALID_PROFILE/.test(error.message));
});
// Supply only a well-formed code already verified absent in a read-only database query.
// Do not retry this call: a valid-code redemption can commit even when transport fails.
if(process.env.TEST_INVALID_CODE) {
  assert(/^[A-Z0-9]{8}$/.test(process.env.TEST_INVALID_CODE));
  await check('well-formed nonexistent invitation rejected',async()=>{
    const {error}=await rpc(first,'redeem_and_draw',{p_code:process.env.TEST_INVALID_CODE, ...testProfile });
    assert(error && /INVALID_CODE/.test(error.message));
  });
}
if(seeds) {
  let receipt;
  await check('correct invitation returns a saved server award',async()=>{
    const {data,error}=await rpc(first,'redeem_and_draw',{p_code:seeds[0].code, ...testProfile });
    assert.ifError(error);assert(['蛋糕','奶茶','小吃','送你一天的开心～'].includes(data.prize));
    assert(data.id && data.created_at);receipt=data;
  });
  await check('used invitation rejected from another client',async()=>{
    const {error}=await rpc(second,'redeem_and_draw',{p_code:seeds[0].code, ...testProfile });
    assert(error && /CODE_USED/.test(error.message));
  });
  await check('new client recovers the identical saved result',async()=>{
    const {data,error}=await readRpc(client(),'get_draw_result',{p_code:seeds[0].code});
    assert.ifError(error);assert.deepEqual(data,receipt);
  });
  await check('two independent clients redeem concurrently: exactly one succeeds',async()=>{
    const responses=await Promise.all([rpc(first,'redeem_and_draw',{p_code:seeds[1].code, ...testProfile }),rpc(second,'redeem_and_draw',{p_code:seeds[1].code, ...testProfile })]);
    assert.equal(responses.filter(r=>!r.error).length,1);
    assert.equal(responses.filter(r=>r.error && /CODE_USED/.test(r.error.message)).length,1);
    const winner=responses.find(r=>!r.error).data;
    const recovered=await readRpc(client(),'get_draw_result',{p_code:seeds[1].code});
    assert.ifError(recovered.error);assert.deepEqual(recovered.data,winner);
  });
}
await mkdir('artifacts',{recursive:true});
await writeFile(process.env.TEST_REPORT_FILE || 'artifacts/live-public-api-results.json',JSON.stringify({executedAt:new Date().toISOString(),mode:'real anonymous HTTP; no administrator password login',results},null,2)+'\n');
if(results.some(r=>r.status==='FAIL')) process.exitCode=1;
