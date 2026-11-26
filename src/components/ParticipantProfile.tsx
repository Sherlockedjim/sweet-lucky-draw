import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Camera, LoaderCircle, PenLine, UserRound, X } from 'lucide-react';
import { emptyProfile, hasProfile, normalizeNickname, prepareAvatar, type ParticipantProfile } from '../lib/participant';

function ProfileAvatar({ profile }: { profile: ParticipantProfile }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [profile.avatar]);
  return <span className="participant-avatar">{profile.avatar && !broken ? <img src={profile.avatar} alt={`${profile.nickname || '我'}的头像`} onError={() => setBroken(true)}/> : <UserRound size={27} strokeWidth={1.5}/>}</span>;
}

export function ParticipantEditor({ value, onChange, onBusyChange, disabled = false, required = false }: {
  value: ParticipantProfile; onChange: (profile: ParticipantProfile) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean; required?: boolean;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { sequence.current++; }, []);

  function clear() {
    sequence.current++; setBusy(false); onBusyChange(false); setError(''); onChange(emptyProfile());
  }

  async function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const run = ++sequence.current;
    setBusy(true); onBusyChange(true); setError('');
    try {
      const avatar = await prepareAvatar(file);
      if (run === sequence.current) onChange({ ...value, avatar });
    } catch (failure) {
      if (run === sequence.current) setError(failure instanceof Error ? failure.message : '头像处理失败，请重新选择。');
    } finally {
      if (run === sequence.current) { setBusy(false); onBusyChange(false); }
    }
  }

  return <section className="participant-editor" aria-label={required ? '昵称与头像（必填）' : '昵称与头像'}>
    <div className="participant-heading"><span><PenLine size={15}/>给这份好运署个名 {required && <small>必填</small>}</span>{hasProfile(value) && <button type="button" className="text-button" onClick={clear} disabled={disabled}><X size={13}/>清除资料</button>}</div>
    <div className="participant-fields"><div className="avatar-picker"><button type="button" className="avatar-picker-button" aria-label={value.avatar ? '更换头像' : '选择头像'} onClick={() => fileInput.current?.click()} disabled={disabled || busy}><ProfileAvatar profile={value}/><span className="avatar-camera">{busy ? <LoaderCircle size={13} className="spin"/> : <Camera size={13}/>}</span></button><input ref={fileInput} className="avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="头像图片文件" aria-required={required} onChange={e => void selectAvatar(e)} disabled={disabled || busy}/><span>{busy ? '处理中…' : value.avatar ? '更换头像' : '选择头像'}</span></div>
      <div className="participant-name"><label htmlFor={id}>昵称</label><input id={id} value={value.nickname} maxLength={512} placeholder="希望怎么称呼你？" autoComplete="off" aria-required={required} disabled={disabled || busy} onChange={e => onChange({ ...value, nickname: normalizeNickname(e.target.value, false) })}/><small>{required ? '昵称最多 24 个字符，两项填好后可使用邀请码' : '昵称最多 24 个字符'}</small></div>
    </div>
    <p className="participant-privacy">头像支持 JPG、PNG、WebP，最大 8MB。抽奖后资料仅保存在当前浏览器，换设备不同步。</p>
    {busy && <p className="participant-processing" role="status">正在压缩头像，请稍等…</p>}
    {error && <p className="participant-error" role="alert">{error}</p>}
  </section>;
}

export function RecipientBadge({ profile }: { profile: ParticipantProfile }) {
  if (!hasProfile(profile)) return null;
  return <div className="recipient-badge" role="group" aria-label="结果页个人资料"><ProfileAvatar profile={profile}/><div><span>这份小幸运，送给</span><strong>{profile.nickname || '幸运的你'}</strong></div></div>;
}
