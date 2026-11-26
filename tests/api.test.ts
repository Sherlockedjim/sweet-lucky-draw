import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({rpc:mocks.rpc}));
import { draw, recover, saveDrawProfile } from '../src/lib/api';
const participant={nickname:'云朵',avatar:'data:image/jpeg;base64,/9j/2Q=='};
const receipt={id:'record',prize:'奶茶',created_at:'2026-11-26T06:00:00Z',participant};
beforeEach(()=>{mocks.rpc.mockReset().mockResolvedValue(receipt);});
it('submits the complete profile with the invitation in one draw RPC',async()=>{
  expect(await draw('ABCD1234',participant)).toEqual(receipt);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('redeem_and_draw',{p_code:'ABCD1234',p_nickname:'云朵',p_avatar:participant.avatar});
});
it('refuses an incomplete profile before contacting Supabase',async()=>{
  await expect(draw('ABCD1234',{nickname:'',avatar:participant.avatar})).rejects.toThrow('PROFILE_REQUIRED');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('uses the separate idempotent attachment RPC for historical profiles',async()=>{
  expect(await saveDrawProfile('ABCD1234',participant)).toEqual(receipt);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_draw_profile',{p_code:'ABCD1234',p_nickname:'云朵',p_avatar:participant.avatar});
});
it('recovers the saved profile using only the exact original invitation',async()=>{
  expect(await recover('ABCD1234')).toEqual(receipt);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_draw_result',{p_code:'ABCD1234'});
});
