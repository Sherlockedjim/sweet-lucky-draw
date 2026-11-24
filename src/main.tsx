import { Component, StrictMode, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import DrawPage from './pages/DrawPage';
import './styles.css';

const AdminPage = lazy(() => import('./pages/AdminPage'));
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="full-loading"><h1>页面暂时走神了</h1><p>刷新页面，再找回你的那份小甜蜜。</p><button className="primary-button" onClick={() => location.reload()}>刷新页面</button></main> : this.props.children; }
}
function App() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => { const update = () => setRoute(location.hash); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const admin = /^#\/admin(?:\/|$)/.test(route);
  useEffect(() => { document.title = admin ? '管理工作台 · Sweet Lucky Draw' : 'Sweet Lucky Draw · 今天的快乐，拆开就好'; window.scrollTo(0, 0); }, [admin]);
  return <Suspense fallback={<div className="full-loading">正在打开甜甜抽奖屋…</div>}>{admin ? <AdminPage/> : <DrawPage/>}</Suspense>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
