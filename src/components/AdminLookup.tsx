import { useState, type FormEvent } from 'react';
import { Clipboard, LoaderCircle, Search } from 'lucide-react';
import { recover } from '../lib/api';
import { HAPPY_MESSAGE, formatTime, friendlyError, normalizeCode, validCode, type DrawResult } from '../lib/domain';

export function AdminLookup({ onLocate }: { onLocate: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [message, setMessage] = useState('');

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const value = normalizeCode(code);
    if (!validCode(value) || busy) return;
    setBusy(true); setMessage(''); setResult(null);
    try {
      const receipt = await recover(value);
      setResult(receipt);
      if (!receipt) setMessage('暂时没有中奖记录。请核对完整邀请码，或等待参与者拆开盲盒后再查询。');
    } catch (e) { setMessage(friendlyError(e)); }
    finally { setBusy(false); }
  }

  return <section className="lookup-panel" aria-label="邀请码结果查询">
    <form onSubmit={lookup}><label htmlFor="lookup-code"><Search size={18}/>按完整邀请码查结果</label><div className="lookup-controls"><input id="lookup-code" aria-label="完整邀请码" placeholder="输入完整 8 位邀请码" maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} disabled={busy} onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null); setMessage(''); }}/><button className="secondary-button" disabled={!validCode(normalizeCode(code)) || busy}>{busy ? <><LoaderCircle size={16} className="spin"/>查询中…</> : '查询结果'}</button></div></form>
    {result && <div className="lookup-result" role="region" aria-label="该邀请码的中奖结果"><div><span>{result.prize === HAPPY_MESSAGE ? '开心礼盒' : '中奖奖品'}</span><strong>{result.prize}</strong></div><div><span>抽奖时间</span><b>{formatTime(result.created_at)}</b></div><div className="lookup-record"><span>记录编号</span><code>{result.id}</code></div><button className="text-button" onClick={() => onLocate(result.id)}>在记录中定位</button><button className="icon-button" aria-label="复制中奖记录编号" onClick={() => void navigator.clipboard.writeText(result.id).then(() => setMessage('记录编号已复制')).catch(() => setMessage('复制失败，请手动选择记录编号复制'))}><Clipboard size={16}/></button></div>}
    {message && <p className="lookup-message" role="status">{message}</p>}
  </section>;
}
