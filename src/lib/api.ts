import { rpc } from './supabase';
import { parseDraw, type DrawRecord, type Invite } from './domain';
import { isCompleteProfile, safeProfile, type ParticipantProfile } from './participant';

const profileParams = (profile: ParticipantProfile) => {
  const clean = safeProfile(profile);
  if (!isCompleteProfile(clean)) throw new Error('PROFILE_REQUIRED');
  return { p_nickname: clean.nickname, p_avatar: clean.avatar };
};
export const draw = async (code: string, profile: ParticipantProfile) => parseDraw(await rpc('redeem_and_draw', { p_code: code, ...profileParams(profile) }));
export const saveDrawProfile = async (code: string, profile: ParticipantProfile) => parseDraw(await rpc('save_draw_profile', { p_code: code, ...profileParams(profile) }));
export const recover = async (code: string) => {
  const result = await rpc<unknown>('get_draw_result', { p_code: code });
  if (result === null || (Array.isArray(result) && result.length === 0)) return null;
  return parseDraw(result);
};
export const listInvites = () => rpc<Invite[]>('admin_list_invites');
export const listDraws = () => rpc<DrawRecord[]>('admin_list_draws');
export const generateCodes = (count: number) => rpc<Invite[]>('admin_generate_codes', { p_count: count });

const RECOVERY_KEY = 'sweet-last-invite-v1';
export const readPendingCode = () => { try { return localStorage.getItem(RECOVERY_KEY) || ''; } catch { return ''; } };
export const rememberCode = (code: string) => { try { localStorage.setItem(RECOVERY_KEY, code); } catch { /* The user can re-enter the code to recover. */ } };
export const forgetCode = () => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* Storage may be unavailable. */ } };
