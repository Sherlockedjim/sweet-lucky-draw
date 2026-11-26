import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, ChevronDown, CircleHelp, Gift, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Ticket, X } from 'lucide-react';
import { Brand, Footer } from '../components/Brand';
import { GiftArt, PrizeArt } from '../components/Artwork';
import { Confetti } from '../components/Confetti';
import { useDialogFocus } from '../components/useDialogFocus';
import { draw, recover, readPendingCode, rememberCode, forgetCode } from '../lib/api';
import { configured } from '../lib/supabase';
import { BOX_CONTENTS, HAPPY_MESSAGE, friendlyError, formatTime, normalizeCode, PRIZES, randomInt, revealOrder, shuffle, validCode, type DrawResult, type Prize } from '../lib/domain';

const captions = { '蛋糕': ['一口柔软，满分甜蜜', '把生活切成小块，每一块都甜甜的。'], '奶茶': ['快乐，当然要加满', '今天的快乐，从第一颗珍珠开始。'], '小吃': ['咔嚓一下，好心情', '嘴巴有点忙，烦恼先放一旁。'], [HAPPY_MESSAGE]: ['收下一份好心情', '把烦恼轻轻放下，愿你今天嘴角一直向上。'] };
const boxTitles = ['心动一下', '好运加倍', '甜蜜出发', '装好快乐', '今天很棒', '给你欢喜'];

export default function DrawPage() {
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [selected, setSelected] = useState(-1);
  const [burst, setBurst] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [boxOrder] = useState(() => shuffle([0, 1, 2, 0, 1, 2]));
  const [shelf] = useState(() => shuffle(PRIZES));
  const lock = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<Prize[]>(() => [...BOX_CONTENTS]);
  useDialogFocus(rulesOpen);

  useEffect(() => {
    let current = true;
    const pending = readPendingCode();
    if (!configured || !validCode(pending)) { setRecovering(false); return; }
    setCode(pending);
    recover(pending).then(value => {
      if (!current) return;
      if (value) { setResult(value); setSelected(1); setRevealed(revealOrder(value.prize, 1)); }
      else setUncertain(false);
    }).catch(e => { if (current) { setError(friendlyError(e)); setUncertain(true); } })
      .finally(() => { if (current) setRecovering(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(false), 4200);
    return () => clearTimeout(timer);
  }, [burst]);

  function unlock(e: FormEvent) {
    e.preventDefault();
    const value = normalizeCode(code);
    setCode(value);
    if (!validCode(value)) { setError('请输入 8 位邀请码，只能包含大写英文字母和数字。'); return; }
    if (!configured) { setError('活动正在准备中，请稍后再来。'); return; }
    setError(''); setUnlocked(true);
  }

  async function openBox(index: number) {
    if (lock.current || !unlocked || result || uncertain || busy || recovering) return;
    lock.current = true; setBusy(true); setError(''); setSelected(index);
    rememberCode(code);
    try {
      const award = await draw(code);
      setRevealed(revealOrder(award.prize, index)); setResult(award); setBurst(true);
      setTimeout(() => resultRef.current?.focus(), 80);
    } catch (e) {
      const message = String((e as { message?: string })?.message || e);
      setError(friendlyError(e));
      // A timeout may have committed on the server. Recover before another mutation.
      setUncertain(!/INVALID_CODE|CODE_NOT_FOUND/i.test(message));
      setSelected(-1);
      if (/INVALID_CODE|CODE_NOT_FOUND/i.test(message)) setUnlocked(false);
    } finally { setBusy(false); lock.current = false; }
  }

  async function recoverResult() {
    if (!validCode(code) || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const award = await recover(code);
      if (award) { setResult(award); setSelected(1); setRevealed(revealOrder(award.prize, 1)); rememberCode(code); }
      else { setUncertain(false); setError('暂时没有这张邀请码的中奖记录，可以选择盲盒。'); setUnlocked(true); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); lock.current = false; }
  }

  function reset() {
    if (busy || recovering) return;
    forgetCode(); setCode(''); setResult(null); setUnlocked(false); setUncertain(false); setSelected(-1); setError(''); setBurst(false);
  }

  return <div className="draw-page">
    {burst && <Confetti/>}
    <header className="site-header"><Brand/><button className="text-button rules-button" onClick={() => setRulesOpen(true)}><CircleHelp size={17}/>活动说明</button></header>
    <main>
      <section className="hero">
        <div className="hero-art hero-art-left"><span className="art-ring"/><PrizeArt prize="奶茶"/><span className="little-caption">今天也要开心呀</span></div>
        <div className="hero-copy"><div className="eyebrow"><Sparkles size={15}/> A LITTLE LUCK, A LOT OF SWEETNESS</div>
          <h1>今天的快乐，<br/><span className="highlight">拆开就好<svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M5 12Q135 0 292 9M18 17Q160 7 280 14"/></svg></span><span className="title-spark" aria-hidden="true">✳</span></h1>
          <p>六个礼盒，三份甜蜜、三份开心。<br className="mobile-break"/>蛋糕、奶茶、小吃，或一句送给你的温柔祝福。</p>
          <div className="hero-label"><span className="mini-sun" aria-hidden="true">☀</span> 今日宜：被快乐击中</div>
        </div>
        <div className="hero-art hero-art-right"><span className="art-ring"/><PrizeArt prize="蛋糕"/><span className="little-caption">甜蜜正在派送中</span></div>
      </section>

      <section className="lucky-studio" aria-labelledby="studio-title">
        <div className="studio-heading"><div><span className="section-eyebrow">YOUR LITTLE LUCKY MOMENT</span><h2 id="studio-title">一份小惊喜，等你来拆 <Sparkles size={21}/></h2></div><span className="edition-tag">SWEET EDITION</span></div>
        <ol className="steps" aria-label="抽奖步骤">{['输入邀请码', '挑选幸运盲盒', '收下小甜蜜'].map((text, i) => <li className={i <= (result ? 2 : unlocked ? 1 : 0) ? 'active' : ''} key={text}><span>{i < (result ? 2 : unlocked ? 1 : 0) ? <Check size={13}/> : `0${i + 1}`}</span>{text}</li>)}</ol>

        {recovering ? <div className="loading-panel" role="status"><LoaderCircle className="spin"/>正在找回你的甜蜜记录…</div> : result ? <div className="result-panel" ref={resultRef} tabIndex={-1}>
          <div className="result-art"><PrizeArt prize={result.prize}/><span className="result-star" aria-hidden="true">✦</span></div>
          <div className={`result-copy ${result.prize === HAPPY_MESSAGE ? 'happy-result' : ''}`}><span className="result-kicker"><CheckCircle2 size={16}/>{result.prize === HAPPY_MESSAGE ? '开心已送达' : '好运已送达'}</span>{result.prize === HAPPY_MESSAGE ? <h3><span>{HAPPY_MESSAGE}</span></h3> : <h3>恭喜你，抽中了<span>{result.prize}！</span></h3>}<p>{captions[result.prize][1]}</p><div className="receipt-meta"><span>抽奖时间 <b>{formatTime(result.created_at)}</b></span><span>记录编号 <code>{result.id}</code></span></div><p className="claim-note">{result.prize === HAPPY_MESSAGE ? '这是一份没有实物奖品的开心礼盒，愿好心情陪你度过今天。' : '请保留这份记录，并联系活动管理员兑换奖品。'}</p><button className="secondary-button" onClick={reset}><Ticket size={16}/>使用另一个邀请码</button></div>
        </div> : <>
          <form className={`invite-form ${unlocked ? 'is-unlocked' : ''}`} onSubmit={unlock}>
            <label htmlFor="invite-code"><Ticket size={18}/> 你的专属邀请码</label>
            <div className="invite-input-row"><div className="input-wrap"><input id="invite-code" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }} placeholder="输入 8 位邀请码" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={8} disabled={busy || unlocked} aria-describedby="invite-hint" aria-invalid={!!error && !unlocked}/>{unlocked && <CheckCircle2 size={18}/>}</div>{unlocked ? <button type="button" className="edit-code text-button" onClick={() => { setUnlocked(false); setUncertain(false); setError(''); }} disabled={busy}>更换</button> : <button className="primary-button" disabled={busy || !code.trim()}>开启好运 <Sparkles size={17}/></button>}</div>
            <p id="invite-hint">{unlocked ? '邀请码已填写，选一个最有眼缘的盒子吧。' : <><LockKeyhole size={13}/>8 位大写英文字母或数字 · 每个邀请码仅限一次</>}</p>
          </form>
          {!configured && <div className="setup-notice" role="status">活动正在准备中，盲盒很快就来。</div>}
          <div className={`boxes ${!unlocked ? 'boxes-locked' : ''} ${busy ? 'boxes-busy' : ''}`} aria-label="选择一个幸运盲盒">
            {boxOrder.map((tone, i) => <button className={`box-card box-tone-${tone} ${selected === i && busy ? 'box-shaking' : ''}`} key={i} disabled={!configured || !unlocked || busy || uncertain} onClick={() => void openBox(i)} aria-label={`选择第 ${i + 1} 个幸运盲盒`}>
              <span className="box-mini-label">A LITTLE SURPRISE</span><GiftArt tone={tone} open={busy && selected === i}/><span className="box-title">{boxTitles[i]}</span><span className="box-hint">{busy && selected === i ? '好运正在揭晓…' : unlocked ? '就选这个！' : '等你来拆'}</span><span className="box-sticker" aria-hidden="true">{['♡', '✧', '☺'][tone]}</span>
            </button>)}
          </div>
          <div className="stage-bottom">{busy ? <span role="status"><LoaderCircle size={16} className="spin"/>正在确认你的甜蜜，请稍等…</span> : <><span><ShieldCheck size={15}/>每个邀请码一次机会 · 结果安全保存</span><button className="text-button random-button" disabled={!unlocked || busy || uncertain || !configured} onClick={() => void openBox(randomInt(BOX_CONTENTS.length))}><Sparkles size={15}/>帮我挑一个</button></>}</div>
        </>}
        {error && <div className="message error-message" role="alert"><span>{error}</span>{uncertain && <button className="secondary-button" disabled={busy} onClick={() => void recoverResult()}><RotateCcw size={15}/>找回抽奖结果</button>}</div>}
        {result && <div className="revealed-row" aria-label="本次盲盒揭晓">{revealed.map((p, i) => <div key={i} className={i === selected ? 'chosen' : ''}><PrizeArt prize={p}/><span>{p}</span>{i === selected && <span className="chosen-label">你的礼盒</span>}</div>)}</div>}
      </section>

      <section className="prize-section" aria-labelledby="prizes-title"><div className="prize-heading"><span className="heading-line"/><div><span className="section-eyebrow">GOOD THINGS ARE WAITING</span><h2 id="prizes-title">今日份甜蜜清单</h2></div><span className="heading-line"/></div><div className="prize-shelf">{shelf.map(p => <article className="prize-item" key={p}><div className={`prize-icon prize-icon-${PRIZES.indexOf(p)}`}><PrizeArt prize={p}/></div><div><h3>{p}<span>{['SWEET TREAT', 'HAPPY SIP', 'CRUNCHY JOY'][PRIZES.indexOf(p)]}</span></h3><p>{captions[p][0]}</p></div></article>)}</div></section>
      <div className="closing-note"><span aria-hidden="true">♡</span> 生活偶尔有点忙，记得给自己一点甜。</div>
    </main><Footer/>
    {rulesOpen && <div className="modal-overlay" onClick={() => setRulesOpen(false)}><section className="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setRulesOpen(false); }}><button className="icon-button dialog-close" aria-label="关闭活动说明" autoFocus onClick={() => setRulesOpen(false)}><X size={20}/></button><span className="dialog-icon"><Gift size={28}/></span><h2 id="rules-title">一点点好运的小约定</h2><ol><li>向活动管理员获取 8 位邀请码。</li><li>填写邀请码，选择一个盲盒，或让好运帮你挑。</li><li>六个礼盒等概率：蛋糕、奶茶、小吃各一个，另有三个空礼盒写着“送你一天的开心～”。三种实物各占 1/6，开心空盒合计占 1/2，由服务端决定并保存结果。</li><li>每个邀请码只能抽取一次，抽奖与记录保存同步完成。</li><li>刷新页面会找回上次结果。换设备时，可重新填写原邀请码，再点击找回结果。</li><li>抽中蛋糕、奶茶或小吃时，请凭记录编号联系活动管理员兑换。</li></ol><button className="primary-button" onClick={() => setRulesOpen(false)}>知道啦，去收下好运 <ChevronDown size={17}/></button></section></div>}
  </div>;
}
