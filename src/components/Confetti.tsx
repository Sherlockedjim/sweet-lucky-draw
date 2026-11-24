import { useMemo } from 'react';
import { randomInt } from '../lib/domain';
import type { CSSProperties } from 'react';

export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 52 }, (_, i) => ({ id: i, left: randomInt(100), delay: randomInt(50) / 100, turn: randomInt(1000), color: ['#edaf53', '#eba090', '#a6b87d', '#f4d878', '#bda5c6'][i % 5] })), []);
  return <div className="confetti" aria-hidden="true">{pieces.map(p => <i key={p.id} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, '--turn': `${p.turn}deg` } as CSSProperties}/>)}</div>;
}
