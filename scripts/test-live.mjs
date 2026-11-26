// Real Supabase integration tests. Uses Publishable/anon + normal Auth sessions only.
// Creates two invitations and two retained test draw records; never deletes existing data.
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const testProfile = { p_nickname: '自动联调测试', p_avatar: 'data:image/jpeg;base64,' + (await readFile(new URL('../tests/fixtures/avatar.jpg', import.meta.url))).toString('base64') };
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const keyIsPublic = value => {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value || '')) return true;
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon'; } catch { return false; }
};
if (!url || !keyIsPublic(key)) {
  console.log('SKIPPED: real Supabase tests require a project URL and Publishable/anon key in ignored .env.local.');
  process.exit(2);
}
const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const anonA = makeClient(), anonB = makeClient(), admin = makeClient(), ordinary = makeClient();
const results = [];
async function test(name, body) {
  try { await body(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (e) { results.push({ name, status: 'FAIL' }); console.error(`FAIL ${name}: ${String(e.message || e).replaceAll(key, '[redacted]')}`); }
}
const call = async (client, method, args = {}) => client.rpc(method, args).abortSignal(AbortSignal.timeout(20000));
for (const method of ['admin_list_invites', 'admin_list_draws', 'admin_generate_codes']) {
  await test(`anonymous denied: ${method}`, async () => {
    const response = await call(anonA, method, method === 'admin_generate_codes' ? { p_count: 1 } : {});
    assert(response.error, 'Anonymous user accessed an admin endpoint');
    assert(/42501|PGRST301/.test(response.error.code) || /permission denied|NOT_ADMIN/i.test(response.error.message), 'Unexpected error; permission protection not verified');
  });
}
for (const code of ['BAD', 'abcd1234', 'ABCD!123']) {
  await test('malformed invitation rejected', async () => {
    const { error } = await call(anonA, 'redeem_and_draw', { p_code: code , ...testProfile });
    assert(error && /INVALID_CODE/.test(error.message), 'Expected explicit validation rejection');
  });
}
if (process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD) {
  await test('ordinary user cannot access all admin endpoints', async () => {
    const login = await ordinary.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    assert.ifError(login.error);
    for (const method of ['admin_list_invites', 'admin_list_draws', 'admin_generate_codes']) {
      const { error } = await call(ordinary, method, method === 'admin_generate_codes' ? { p_count: 1 } : {});
      assert(error && /NOT_ADMIN/.test(error.message), `${method} failed to enforce admin membership`);
    }
  });
} else { results.push({ name: 'ordinary account authorization', status: 'SKIPPED' }); }

if (process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD) {
  let invites;
  await test('existing administrator login', async () => {
    const { error } = await admin.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
    assert.ifError(error);
    const response = await call(admin, 'admin_list_invites'); assert.ifError(response.error);
    assert(Array.isArray(response.data)); invites = response.data;
  });
  if (invites) {
    await test('well-formed nonexistent invitation rejected', async () => {
      let code;
      do { code = randomBytes(4).toString('hex').toUpperCase(); } while (invites.some(r => r.code === code));
      const { error } = await call(anonA, 'redeem_and_draw', { p_code: code , ...testProfile });
      assert(error && /INVALID_CODE/.test(error.message));
    });
    for (const count of [0, 501]) await test('invalid batch size rejected', async () => {
      const { error } = await call(admin, 'admin_generate_codes', { p_count: count });
      assert(error && /COUNT_OUT_OF_RANGE/.test(error.message));
    });
    let batch;
    await test('batch code generation', async () => {
      const { data, error } = await call(admin, 'admin_generate_codes', { p_count: 2 });
      assert.ifError(error); assert.equal(data.length, 2); batch = data;
      assert.equal(new Set(data.map(r => r.code)).size, 2);
      assert(data.every(r => /^[A-Z0-9]{8}$/.test(r.code)));
    });
    if (batch) {
      let award;
      await test('correct invitation redeemed once', async () => {
        const { data, error } = await call(anonA, 'redeem_and_draw', { p_code: batch[0].code , ...testProfile });
        assert.ifError(error); assert(['蛋糕', '奶茶', '小吃', '送你一天的开心～'].includes(data.prize)); award = data;
      });
      await test('used invitation rejected', async () => {
        const { error } = await call(anonB, 'redeem_and_draw', { p_code: batch[0].code , ...testProfile });
        assert(error && /CODE_USED/.test(error.message));
      });
      await test('result survives refresh / a new browser session', async () => {
        const { data, error } = await call(makeClient(), 'get_draw_result', { p_code: batch[0].code });
        assert.ifError(error); assert.deepEqual(data, award);
      });
      await test('two independent clients redeem concurrently: exactly one wins', async () => {
        const responses = await Promise.all([call(anonA, 'redeem_and_draw', { p_code: batch[1].code , ...testProfile }), call(anonB, 'redeem_and_draw', { p_code: batch[1].code , ...testProfile })]);
        assert.equal(responses.filter(r => !r.error).length, 1);
        assert.equal(responses.filter(r => r.error && /CODE_USED/.test(r.error.message)).length, 1);
        const records = await call(admin, 'admin_list_draws'); assert.ifError(records.error);
        const winningId = responses.find(r => !r.error).data.id;
        assert.equal(records.data.filter(r => r.id === winningId).length, 1);
      });
    }
  }
} else { results.push({ name: 'admin login, generation, correct/duplicate/concurrent draw, durable results', status: 'SKIPPED' }); }
console.table(results);
console.log('Generated test records are retained. No existing administrator or data was deleted.');
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
else if (results.some(r => r.status === 'SKIPPED')) process.exitCode = 2;
