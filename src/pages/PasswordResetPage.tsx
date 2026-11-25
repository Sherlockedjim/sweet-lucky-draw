import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronLeft, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { Brand } from '../components/Brand';
import { GiftArt } from '../components/Artwork';
import { configured, supabase } from '../lib/supabase';
import { recoveryError, recoveryRedirect } from '../lib/passwordRecovery';

export default function PasswordResetPage({ recovering = false }: { recovering?: boolean }) {
  const [mode, setMode] = useState<'checking' | 'request' | 'edit' | 'done'>(recovering ? 'checking' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const loginHref = `${window.location.pathname}#/admin`;

  useEffect(() => {
    if (!recovering || !supabase) { setMode('request'); return; }
    let alive = true;
    void (async () => {
      try {
        // getSession waits for the SDK to finish consuming a valid recovery callback.
        const session = await supabase!.auth.getSession();
        if (session.error || !session.data.session) throw new Error('RECOVERY_EXPIRED');
        const user = await supabase!.auth.getUser();
        if (user.error || !user.data.user) throw new Error('RECOVERY_EXPIRED');
        if (alive) { setEmail(user.data.user.email || ''); setMode('edit'); }
      } catch {
        if (alive) { setError('重置链接已失效或尚未验证，请重新申请邮件，并打开最新一封邮件中的链接。'); setMode('request'); }
      } finally {
        // Neither success nor error fragments remain in a copied URL or screenshot.
        if (alive) window.history.replaceState(null, '', recoveryRedirect(window.location.href));
      }
    })();
    return () => { alive = false; };
  }, [recovering]);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    if (!supabase || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setSent(false);
    try {
      const response = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirect(window.location.href) });
      if (response.error) throw response.error;
      setSent(true);
    } catch (failure) { setError(recoveryError(failure)); }
    finally { locked.current = false; setBusy(false); }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase || locked.current) return;
    if (password.length < 8) { setError('请设置至少 8 位的新密码。'); return; }
    if (password !== confirmation) { setError('两次输入的密码不一致，请重新确认。'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const response = await supabase.auth.updateUser({ password });
      if (response.error) throw response.error;
      setPassword(''); setConfirmation(''); setMode('done');
      // Require a fresh password login before returning to the management workspace.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } catch (failure) { setError(recoveryError(failure)); }
    finally { locked.current = false; setBusy(false); }
  }

  return <div className="admin-login-page"><header className="site-header"><Brand admin href={`${window.location.pathname}#/`}/><a className="text-button" href={loginHref}><ChevronLeft size={16}/>返回管理员登录</a></header>
    <main className="login-layout"><section className="login-intro"><span className="eyebrow">A FRESH LITTLE START</span><h1>找回小钥匙，<br/>继续派送快乐。</h1><p>验证你的邮箱，<br/>为甜甜抽奖屋设置新的密码。</p><GiftArt/><span className="login-note">YOUR LITTLE WORKSPACE IS WAITING.</span></section>
      <section className="login-card recovery-card"><span className="login-shield">{mode === 'done' ? <CheckCircle2 size={27}/> : <KeyRound size={27}/>}</span>
        <h2>{mode === 'edit' ? '设置新的登录密码' : mode === 'done' ? '新密码已保存' : '找回管理员密码'}</h2>
        {mode === 'checking' ? <p role="status"><LoaderCircle size={17} className="spin"/>正在验证重置链接…</p> : mode === 'done' ? <><p role="status">密码已更新，请使用新密码登录管理后台。</p><a className="primary-button login-submit" href={loginHref}>返回登录</a></> : mode === 'edit' ? <><p>{email} 的邮箱验证已完成。</p><form onSubmit={updatePassword}><label htmlFor="new-password">新密码</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/><span className="field-hint">至少 8 位，建议包含字母、数字和符号</span><label htmlFor="confirm-password">再次输入新密码</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy}/>{error && <div className="message error-message" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin"/>正在保存…</> : '保存新密码'}</button></form></> : <><p>输入原管理员邮箱，通过邮件验证后设置新密码。</p><form onSubmit={requestReset}><label htmlFor="recovery-email">管理员邮箱</label><input id="recovery-email" type="email" autoComplete="email" placeholder="your@email.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/>{error && <div className="message error-message" role="alert">{error}</div>}{sent && <div className="recovery-sent" role="status"><Mail size={20}/><p>如果此邮箱对应现有账号，重置邮件将发送到邮箱。请检查收件箱和垃圾邮件，并打开最新的重置链接。</p></div>}{!configured && <div className="setup-notice">后台连接尚未配置，请联系项目所有者。</div>}<button className="primary-button login-submit" disabled={busy || !configured}>{busy ? <><LoaderCircle size={17} className="spin"/>正在申请…</> : sent ? '重新发送邮件' : '发送重置邮件'}</button></form>{sent && <p className="recovery-help">没有收到邮件时，请稍后重试，或联系项目所有者检查邮件发送设置。</p>}</>}
        <p className="login-security"><ShieldCheck size={14}/>请只在此页面填写新密码</p>
      </section></main><footer className="login-footer">Sweet Lucky Draw · 让每一份快乐都有迹可循</footer></div>;
}
