import { Gift, Sparkles } from 'lucide-react';

export function Brand({ admin = false, href = '#/' }: { admin?: boolean; href?: string }) {
  return <a className="brand" href={href} aria-label="Sweet Lucky Draw 首页"><span className="brand-mark"><Gift size={23} strokeWidth={1.8}/></span><span>Sweet Lucky Draw<small>{admin ? '小小的后台 · 大大的快乐' : '让今天，甜一点。'}</small></span></a>;
}
export function Footer() {
  return <footer className="site-footer"><span>Made with a little sweetness <Sparkles size={14}/></span><a href="#/admin">管理员入口</a></footer>;
}
