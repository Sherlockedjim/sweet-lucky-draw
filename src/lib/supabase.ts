import { createClient } from '@supabase/supabase-js';
import { acceptsRecoveryCallback, isRecoveryReturn } from './passwordRecovery';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export function isPublicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export const configured = !!url && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) && !!key && isPublicKey(key);
// Capture the landing mode before the SDK consumes and removes the recovery fragment.
export const recoveryReturnExpected = typeof window !== 'undefined' && isRecoveryReturn(new URL(window.location.href));
// Fall back to tab memory when browser privacy settings disable sessionStorage.
const memory = new Map<string, string>();
const sessionStore = {
  getItem(name: string) { try { return sessionStorage.getItem(name); } catch { return memory.get(name) ?? null; } },
  setItem(name: string, value: string) { try { sessionStorage.setItem(name, value); } catch { memory.set(name, value); } },
  removeItem(name: string) { try { sessionStorage.removeItem(name); } catch { memory.delete(name); } },
};
export const supabase = configured ? createClient(url!, key!, {
  auth: { storage: sessionStore, storageKey: `sweet-admin-${new URL(url!).hostname.split('.')[0]}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: acceptsRecoveryCallback },
}) : null;

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('CONFIG_MISSING');
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  return data as T;
}
