import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Clipboard, Download, Gift, LayoutDashboard, LoaderCircle, LogOut, Plus, RefreshCw, Search, ShieldCheck, Ticket, Users, X } from 'lucide-react';
import { Brand } from '../components/Brand';
import { GiftArt } from '../components/Artwork';
import { useDialogFocus } from '../components/useDialogFocus';
import { AdminLookup } from '../components/AdminLookup';
import { supabase, configured } from '../lib/supabase';
import { generateCodes, listDraws, listInvites } from '../lib/api';
import { downloadCsv, formatTime, friendlyError, validCode, type DrawRecord, type Invite } from '../lib/domain';

const PAGE_SIZE = 20;

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [draws, setDraws] = useState<DrawRecord[]>([]);
  const [tab, setTab] = useState<'invites' | 'draws'>('invites');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [count, setCount] = useState('10');
  const [batch, setBatch] = useState<Invite[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  useDialogFocus(createOpen);

  const refresh = useCallback(async (authorize = false) => {
    if (!supabase) return;
    const run = generation.current;
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('NOT_ADMIN');
    const [codes, records] = await Promise.all([listInvites(), listDraws()]);
    if (run !== generation.current) return;
    // Authorization is established by both RPCs checking auth.uid() in PostgreSQL.
    if (authorize) setAdmin(user.email || '管理员');
    setInvites(codes); setDraws(records);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || !alive) return;
      try { await refresh(true); }
      catch (e) { if (alive) { setError(friendlyError(e)); await supabase!.auth.signOut({ scope: 'local' }); } }
    }).catch(e => { if (alive) setError(friendlyError(e)); }).finally(() => { if (alive) setChecking(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { generation.current++; setAdmin(null); setInvites([]); setDraws([]); setBatch(null); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [refresh]);

  useEffect(() => { setPage(0); }, [query, filter, tab]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); } }, [toast]);

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      setPassword('');
      await refresh(true);
    } catch (e) { setError(friendlyError(e)); await supabase.auth.signOut({ scope: 'local' }); }
    finally { setBusy(false); locked.current = false; }
  }

  async function logout() {
    // Erase rendered data immediately even if remote session revocation is offline.
    generation.current++; setAdmin(null); setInvites([]); setDraws([]); setBatch(null); setPassword(''); setError('');
    await supabase?.auth.signOut({ scope: 'local' });
  }

  async function reload() {
    if (busy) return;
    setBusy(true); setError('');
    try { await refresh(); setToast('已更新最新数据'); }
    catch (e) {
      setError(friendlyError(e));
      if (/NOT_ADMIN|permission denied|42501/i.test(String((e as { message?: string })?.message))) {
        setAdmin(null); setInvites([]); setDraws([]); await supabase?.auth.signOut({ scope: 'local' });
      }
    } finally { setBusy(false); }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) { setError('生成数量需要是 1 到 500 之间的整数。'); return; }
    if (locked.current) return;
    locked.current = true; setCreating(true); setError('');
    try {
      const rows = await generateCodes(amount);
      setBatch(rows); setCopyFailed(false);
      // Keep generated codes visible even if the following read fails.
      setInvites(old => [...rows, ...old.filter(v => !rows.some(r => r.id === v.id))]);
      setToast(`已生成 ${rows.length} 个邀请码`);
    } catch (e) { setError(`${friendlyError(e)} 若网络中断，请先刷新列表确认是否已生成，再创建新的一批。`); }
    finally { setCreating(false); locked.current = false; }
  }

  const used = invites.filter(i => i.is_used || i.used_at).length;
  const filteredInvites = invites.filter(i => i.code.includes(query.trim().toUpperCase()) && (filter === 'all' || (filter === 'used' ? !!(i.is_used || i.used_at) : !(i.is_used || i.used_at))));
  const filteredDraws = draws.filter(i => i.code.includes(query.trim().toUpperCase()) || i.prize.includes(query.trim()) || i.id.includes(query.trim()));
  const totalRows = tab === 'invites' ? filteredInvites.length : filteredDraws.length;
  const maxPage = Math.max(0, Math.ceil(totalRows / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const exportInvites = (rows: Invite[]) => downloadCsv(`sweet-invites-${new Date().toISOString().slice(0, 10)}.csv`, [rows.every(r => validCode(r.code)) ? '邀请码' : '邀请码（部分仅显示末4位）', '状态', '生成时间（北京时间）', '使用时间（北京时间）'], rows.map(r => [r.code, r.is_used || r.used_at ? '已使用' : '未使用', formatTime(r.created_at), formatTime(r.used_at)]));

  if (checking) return <div className="full-loading" role="status"><LoaderCircle className="spin"/>正在验证管理员身份…</div>;
  if (!admin) return <div className="admin-login-page"><header className="site-header"><Brand admin/><a className="text-button" href="#/"><ChevronLeft size={16}/>返回抽奖屋</a></header><main className="login-layout"><section className="login-intro"><span className="eyebrow">BEHIND THE SWEETNESS</span><h1>把快乐准备好，<br/>等好运来敲门。</h1><p>在这里，给每一份小惊喜<br/>安排一个甜甜的开始。</p><GiftArt/><span className="login-note">A LITTLE CARE MAKES A LOT OF JOY.</span></section><section className="login-card"><span className="login-shield"><ShieldCheck size={27}/></span><h2>欢迎回到甜甜抽奖屋</h2><p>使用管理员账号登录</p><form onSubmit={login}><label htmlFor="admin-email">邮箱地址</label><input id="admin-email" type="email" autoComplete="username" placeholder="your@email.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/><label htmlFor="admin-password">登录密码</label><input id="admin-password" type="password" autoComplete="current-password" required placeholder="输入你的密码" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/>{error && <div className="message error-message" role="alert">{error}</div>}{!configured && <div className="setup-notice">后台连接尚未配置，请按部署说明设置项目连接。</div>}<button className="primary-button login-submit" disabled={busy || !configured}>{busy ? <><LoaderCircle size={17} className="spin"/>正在验证…</> : '登录管理后台'}</button></form><a className="text-button forgot-password" href="#/admin/reset-password">忘记密码？</a><p className="login-security"><ShieldCheck size={14}/>仅限活动管理员访问</p></section></main><footer className="login-footer">Sweet Lucky Draw · 让每一份快乐都有迹可循</footer></div>;

  return <div className="admin-page"><aside className="admin-sidebar"><Brand admin/><span className="sidebar-label">WORKSPACE</span><button className="sidebar-item selected" onClick={() => { setTab('invites'); setQuery(''); }}><LayoutDashboard size={19}/>活动概览</button><button className="sidebar-item" onClick={() => setTab('invites')}><Ticket size={19}/>邀请码管理<span>{invites.length}</span></button><button className="sidebar-item" onClick={() => setTab('draws')}><Gift size={19}/>中奖记录<span>{draws.length}</span></button><div className="sidebar-bottom"><div className="admin-avatar"><span><Users size={20}/></span><div>活动管理员<small>{admin}</small></div></div><button className="sidebar-item" onClick={() => void logout()}><LogOut size={17}/>退出登录</button></div></aside>
    <div className="admin-main"><header className="admin-topbar"><span>管理工作台 <span className="topbar-divider">/</span> 活动概览</span><a href="#/" className="text-button"><Gift size={16}/>查看抽奖页面</a></header><main className="dashboard"><div className="dashboard-heading"><div><span className="section-eyebrow">A SWEET DAY STARTS HERE</span><h1>今天，也在派送快乐。<span aria-hidden="true">☀</span></h1><p>每一张邀请码，都是一份值得期待的小惊喜。</p></div><button className="primary-button" onClick={() => { setCreateOpen(true); setBatch(null); setError(''); }}><Plus size={18}/>生成邀请码</button></div>
      <div className="stats-grid">{[{ label: '邀请码总数', number: invites.length, detail: '已准备好的快乐', icon: Ticket, color: 'yellow' }, { label: '未使用', number: invites.length - used, detail: '等待好运开启', icon: Gift, color: 'green' }, { label: '已使用', number: used, detail: '已经送达的甜蜜', icon: Check, color: 'peach' }, { label: '中奖记录', number: draws.length, detail: '每一份惊喜都有记录', icon: Users, color: 'purple' }].map(s => <article className={`stat-card ${s.color}`} key={s.label}><div><span>{s.label}</span><s.icon size={19}/></div><strong>{s.number.toLocaleString()}</strong><small>{s.detail}</small></article>)}</div>
      <AdminLookup onLocate={id => { setTab('draws'); setQuery(id); }}/>{error && !createOpen && <div className="message error-message" role="alert">{error}</div>}
      <section className="data-panel"><div className="data-panel-heading"><div className="data-tabs" role="tablist" aria-label="管理数据"><button role="tab" aria-selected={tab === 'invites'} className={tab === 'invites' ? 'selected' : ''} onClick={() => setTab('invites')}><Ticket size={17}/>邀请码<span>{invites.length}</span></button><button role="tab" aria-selected={tab === 'draws'} className={tab === 'draws' ? 'selected' : ''} onClick={() => setTab('draws')}><Gift size={17}/>中奖记录<span>{draws.length}</span></button></div><button className="icon-button" aria-label="刷新数据" title="刷新数据" disabled={busy} onClick={() => void reload()}><RefreshCw size={17} className={busy ? 'spin' : ''}/></button></div>
        {tab === 'invites' && <p className="table-note">完整邀请码仅在生成时提供；历史记录显示末 4 位。</p>}<div className="table-toolbar"><div className="search-field"><Search size={17}/><input aria-label="搜索邀请码或奖品" placeholder={tab === 'invites' ? '搜索邀请码末 4 位' : '搜索邀请码末 4 位或奖品'} value={query} onChange={e => setQuery(e.target.value)}/></div><div className="toolbar-actions">{tab === 'invites' && <div className="select-wrap"><select aria-label="筛选邀请码状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option><option value="unused">未使用</option><option value="used">已使用</option></select></div>}<button className="secondary-button" disabled={!totalRows} onClick={() => tab === 'invites' ? exportInvites(filteredInvites) : downloadCsv('sweet-draw-records.csv', ['邀请码', '奖品', '抽奖时间（北京时间）', '记录编号'], filteredDraws.map(r => [r.code, r.prize, formatTime(r.created_at), r.id]))}><Download size={15}/>导出 CSV</button></div></div>
        <div className="table-scroll"><table><thead><tr>{(tab === 'invites' ? ['邀请码', '使用状态', '生成时间', '使用时间', '操作'] : ['邀请码', '中奖奖品', '抽奖时间', '记录编号']).map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{tab === 'invites' ? filteredInvites.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(r => <tr key={r.id}><td><code className="invite-code-cell">{r.code}</code></td><td><span className={`status-pill ${r.is_used || r.used_at ? 'used' : 'unused'}`}>{r.is_used || r.used_at ? '已使用' : '未使用'}</span></td><td>{formatTime(r.created_at)}</td><td>{formatTime(r.used_at)}</td><td><button className="icon-button" aria-label={`复制邀请码 ${r.code}`} disabled={!validCode(r.code)} title={validCode(r.code) ? "复制邀请码" : "完整邀请码仅在生成时提供"} onClick={() => void navigator.clipboard.writeText(r.code).then(() => setToast('邀请码已复制')).catch(() => setToast('复制失败，请手动选择邀请码复制'))}><Clipboard size={16}/></button></td></tr>) : filteredDraws.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(r => <tr key={r.id}><td><code className="invite-code-cell">{r.code}</code></td><td><span className="prize-pill">{r.prize}</span></td><td>{formatTime(r.created_at)}</td><td><code className="record-id">{r.id}</code></td></tr>)}</tbody></table>{totalRows === 0 && <div className="empty-state"><Gift size={32}/><h3>{query || filter !== 'all' ? '还没有匹配的记录' : tab === 'invites' ? '从第一份小惊喜开始' : '快乐还在路上'}</h3><p>{tab === 'invites' ? '生成邀请码，把好运分享出去吧。' : '有人拆开盲盒后，中奖记录就会出现在这里。'}</p></div>}</div>
        <div className="pagination"><span>共 {totalRows.toLocaleString()} 条记录{totalRows > 0 && ` · 第 ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, totalRows)} 条`}</span><div><button className="icon-button" aria-label="上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button><span>{currentPage + 1} / {maxPage + 1}</span><button className="icon-button" aria-label="下一页" disabled={currentPage >= maxPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button></div></div>
      </section><div className="dashboard-footnote"><ShieldCheck size={15}/>管理员操作由服务端校验权限，抽奖结果由数据库安全保存。</div>
    </main></div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {createOpen && <div className="modal-overlay" onClick={() => { if (!creating) setCreateOpen(false); }}><section className="generate-dialog" role="dialog" aria-modal="true" aria-labelledby="generate-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !creating) setCreateOpen(false); }}><button className="icon-button dialog-close" disabled={creating} aria-label="关闭生成窗口" onClick={() => setCreateOpen(false)}><X size={20}/></button><span className="dialog-icon"><Ticket size={27}/></span><h2 id="generate-title">{batch ? '小惊喜，已经准备好了' : '准备一批新的小惊喜'}</h2><p>{batch ? `已成功生成 ${batch.length} 个专属邀请码。请及时复制或导出，完整号码仅在本批生成后显示。` : '每个邀请码都是 8 位，只能使用一次。'}</p>{batch ? <><textarea className="batch-codes" readOnly value={batch.map(r => r.code).join('\n')} aria-label="本次生成的邀请码" onFocus={e => e.target.select()}/><div className="dialog-actions"><button className="primary-button" onClick={() => void navigator.clipboard.writeText(batch.map(r => r.code).join('\n')).then(() => { setToast('本批邀请码已全部复制'); setCopyFailed(false); }).catch(() => setCopyFailed(true))}><Clipboard size={16}/>复制全部</button><button className="secondary-button" onClick={() => exportInvites(batch)}><Download size={16}/>导出本批 CSV</button></div>{copyFailed && <p role="alert">浏览器未允许复制，请选中文本框手动复制。</p>}<button className="text-button create-again" onClick={() => setBatch(null)}>再准备一批</button></> : <form onSubmit={generate}><label htmlFor="code-count">生成数量</label><input id="code-count" type="number" min={1} max={500} step={1} required autoFocus value={count} onChange={e => setCount(e.target.value)} disabled={creating}/><span className="field-hint">每批支持 1–500 个邀请码</span>{error && <div className="message error-message" role="alert">{error}</div>}<button className="primary-button generate-submit" disabled={creating}>{creating ? <><LoaderCircle size={17} className="spin"/>正在准备…</> : <><Plus size={17}/>生成邀请码</>}</button></form>}</section></div>}
  </div>;
}
