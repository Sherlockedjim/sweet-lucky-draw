import { useId } from 'react';
import { HAPPY_MESSAGE, type Prize } from '../lib/domain';

export function GiftArt({ tone = 0, open = false }: { tone?: number; open?: boolean }) {
  const colors = [['#ffe291', '#f2a39a'], ['#f5d8a3', '#a4bb97'], ['#f7d2a6', '#e6a369']][tone];
  return <svg className={`gift-art ${open ? 'gift-open' : ''}`} viewBox="0 0 240 230" fill="none" aria-hidden="true">
    <ellipse cx="120" cy="204" rx="74" ry="11" fill="#71512b" opacity=".09" />
    <g className="gift-body" stroke="#80613a" strokeWidth="2.6" strokeLinejoin="round">
      <path d="M56 110h128v76c0 9-6 13-14 13H70c-8 0-14-4-14-13z" fill={colors[0]}/>
      <path d="M58 122h124v12H58z" fill="#80613a" opacity=".07" stroke="none"/>
      <path d="M107 111h26v88h-26z" fill={colors[1]}/>
      <path d="M70 146v29" stroke="#fff7d7" strokeWidth="5"/>
      <path d="m76 158 5 5-5 5m83-20 4 4-4 4m-14 19 3 3-3 3" stroke="#80613a" strokeWidth="2" opacity=".32"/>
    </g>
    <g className="gift-lid" stroke="#80613a" strokeWidth="2.6" strokeLinejoin="round">
      <path d="M120 91C88 98 64 69 77 56c14-14 36 10 43 35z" fill={colors[1]}/>
      <path d="M120 91c32 7 56-22 43-35-14-14-36 10-43 35z" fill={colors[1]}/>
      <path d="m88 66 27 25m37-25-27 25" stroke="#fff6df" opacity=".6"/>
      <rect x="46" y="95" width="148" height="28" rx="7" fill={colors[0]}/>
      <path d="M106 95h28v28h-28z" fill={colors[1]}/>
      <ellipse cx="120" cy="92" rx="10" ry="8" fill={colors[1]}/>
    </g>
    <g stroke="#b99455" strokeWidth="2.5" strokeLinecap="round">
      <path d="M35 92v12m-6-6h12m155-42v12m-6-6h12M41 154l-3 7m155-4 4 6"/>
    </g>
    <path d="m60 38 3 7 8 1-6 5 1 8-7-4-6 4 1-8-5-5 8-1z" fill="#e5b557"/>
    <circle cx="190" cy="133" r="3" fill="#e7ab91"/>
  </svg>;
}

export function PrizeArt({ prize, className = '' }: { prize: Prize; className?: string }) {
  const id = useId();
  return <svg className={`prize-art ${className}`} viewBox="0 0 200 200" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <defs><pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0l7 7" stroke="#fff" strokeOpacity=".12" /></pattern></defs>
    <ellipse cx="100" cy="171" rx="64" ry="10" fill="#73532b" opacity=".08" />
    {prize === HAPPY_MESSAGE && <g stroke="#ad873b" strokeWidth="3">
      <path d="M100 24v13m0 113v13M31 94h13m112 0h13M51 45l10 10m79 79 10 10M51 144l10-10m79-79 10-10"/>
      <circle cx="100" cy="94" r="46" fill="#ffe49a"/>
      <path d="M78 87q5-9 10 0m24 0q5-9 10 0M84 107q16 20 32 0"/>
      <g stroke="none" fill="#edae94"><ellipse cx="73" cy="101" rx="9" ry="5"/><ellipse cx="127" cy="101" rx="9" ry="5"/></g>
      <path d="m159 37 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#eec977" strokeWidth="1.5"/>
    </g>}
    {prize === '蛋糕' && <g stroke="#865b40" strokeWidth="2.5">
      <ellipse cx="100" cy="160" rx="66" ry="12" fill="#fff9e9"/>
      <path d="M47 91h106v61c0 17-106 17-106 0z" fill="#f5c895"/>
      <path d="M48 117c28 12 78 12 104 0v13c-26 12-76 12-104 0z" fill="#fff7d7" stroke="none"/>
      <ellipse cx="100" cy="91" rx="53" ry="16" fill="#fff8e0"/>
      <path d="M48 94c5 0 5 18 13 18s7-13 15-13 6 17 15 17 8-16 17-16 8 13 16 13 8-14 15-14 7 9 14-5" stroke="#fff8e0" strokeWidth="10"/>
      <path d="M84 70c-12-21 5-33 16-20 11-13 28-1 16 20l-16 14z" fill="#ee8e85"/>
      <path d="M100 51c1-14 9-20 16-22" stroke="#809660" strokeWidth="3"/>
      <path d="M101 44c-9-13-23-10-19-3 2 5 12 8 19 3z" fill="#aabc7e" stroke="#809660"/>
      <path d="m91 57 1 2m15 1 1-2m-9 11 1 2" stroke="#fff2cb" strokeWidth="3"/>
      <path d="M60 141v8" stroke="#ffedc8" strokeWidth="5"/>
    </g>}
    {prize === '奶茶' && <g stroke="#806345" strokeWidth="2.5">
      <path d="m105 62 19-40" stroke="#829969" strokeWidth="11"/>
      <path d="m105 62 19-40" stroke="#c5d3a2" strokeWidth="5"/>
      <path d="M53 70h94l-10 81c-1 11-8 16-18 16H81c-10 0-17-5-18-16z" fill="#eac797"/>
      <path d="M58 94c30 10 55-10 84 0l-7 58c-1 8-6 12-17 12H82c-10 0-15-4-17-12z" fill="#d9b08a" stroke="none"/>
      <rect x="46" y="61" width="108" height="17" rx="8" fill="#edf0d8"/>
      <path d="m67 87 5 38" stroke="#fff0d5" strokeWidth="5"/>
      <g fill="#77604c" stroke="none"><circle cx="83" cy="148" r="7"/><circle cx="101" cy="155" r="6"/><circle cx="119" cy="144" r="7"/><circle cx="102" cy="137" r="6"/><circle cx="124" cy="158" r="4"/></g>
      <path d="M88 108c-9-13 6-19 12-8 7-11 21-5 12 8l-12 13z" fill="#fff2cf" stroke="#b08c60" strokeWidth="1.5"/>
    </g>}
    {prize === '小吃' && <g stroke="#95653d" strokeWidth="2.5">
      <g fill="#f6cf7e"><rect x="57" y="47" width="15" height="81" rx="4" transform="rotate(-12 57 47)"/><rect x="77" y="32" width="16" height="94" rx="4" transform="rotate(-3 77 32)"/><rect x="102" y="41" width="16" height="84" rx="4" transform="rotate(8 102 41)"/><rect x="125" y="47" width="15" height="80" rx="4" transform="rotate(17 125 47)"/><rect x="43" y="65" width="14" height="68" rx="4" transform="rotate(-21 43 65)"/></g>
      <path d="M46 91q54 23 108 0l-13 65c-1 8-7 12-17 12H76c-10 0-16-4-17-12z" fill="#e99f7c"/>
      <path d="M47 93q53 22 106 0" stroke="#ffdfae" strokeWidth="5"/>
      <path d="M83 130c-10-14 8-23 17-10 10-13 27-4 17 10l-17 18z" fill="#fff3d1" stroke="none"/>
      <path d="m70 140 2 13" stroke="#f9c0a0" strokeWidth="4"/>
    </g>}
    <g stroke="#c49e51" strokeWidth="2" strokeLinecap="round"><path d="M29 71v10m-5-5h10m134-25v10m-5-5h10"/></g>
    <circle cx="162" cy="125" r="3" fill="#e3b65b"/>
  </svg>;
}
