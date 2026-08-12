import React from 'react'

// 塔罗卡背：活体神秘星空（深靛底 + 缓转星盘 + 流星划过 + 星点明灭）
const TarotBack = ({ className = '', style }) => {
  // 散落的背景星点（每颗独立动画延迟，制造错落明灭）
  const bgStars = Array.from({ length: 22 }, (_, i) => ({
    cx: 10 + ((i * 53) % 180),
    cy: 10 + ((i * 89) % 280),
    r: (i % 3) * 0.5 + 0.4,
    o: 0.2 + ((i * 7) % 5) * 0.12,
    d: (i * 1.7) % 6, // animation delay
  }))
  // 划过卡面的流星（1-2 颗，CSS 动画控制出现时机）
  const streaks = [
    { x1: 20, y1: 30, x2: 160, y2: 110, d: '3s', dur: '8s' },
    { x1: 170, y1: 200, x2: 40, y2: 260, d: '6s', dur: '11s' },
  ]
  return (
    <svg
      className={`tarot-back-svg ${className}`}
      style={style}
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="tb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#171a3a" />
          <stop offset="0.55" stopColor="#0e1030" />
          <stop offset="1" stopColor="#0a0a1f" />
        </linearGradient>
        <radialGradient id="tb-glow" cx="0.5" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#3a3f78" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3a3f78" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tb-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4e3a8" />
          <stop offset="0.5" stopColor="#e3c478" />
          <stop offset="1" stopColor="#b8923f" />
        </linearGradient>
        {/* 流星渐变 */}
        <linearGradient id="tb-streak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffe2b8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 深靛底 */}
      <rect x="0" y="0" width="200" height="300" rx="14" fill="url(#tb-bg)" />
      {/* 中央辉光 */}
      <rect x="0" y="0" width="200" height="300" fill="url(#tb-glow)" />

      {/* 散落星点（各自闪烁） */}
      {bgStars.map((s, i) => (
        <circle key={i} className="tarot-bstar" cx={s.cx} cy={s.cy} r={s.r}
          fill="#dfe6ff" opacity={s.o} style={{ animationDelay: s.d + 's' }} />
      ))}

      {/* 流星划过 */}
      {streaks.map((s, i) => (
        <line key={i} className="tarot-bstreak" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke="url(#tb-streak)" strokeWidth="1.2" strokeLinecap="round"
          style={{ animationDelay: s.d, animationDuration: s.dur }} />
      ))}

      {/* 烫金双线边框 */}
      <rect x="9" y="9" width="182" height="282" rx="11" fill="none" stroke="url(#tb-gold)" strokeWidth="1.6" opacity="0.9" />
      <rect x="15" y="15" width="170" height="270" rx="8" fill="none" stroke="url(#tb-gold)" strokeWidth="0.7" opacity="0.55" />

      {/* 中央旋转星盘（compass rose / astrolabe）—— 缓慢匀速转动 */}
      <g className="tarot-back-astrolabe" transform="translate(100 116)">
        {/* 外圈刻度环 */}
        <circle r="38" fill="none" stroke="url(#tb-gold)" strokeWidth="0.8" opacity="0.7" />
        <circle r="32" fill="none" stroke="url(#tb-gold)" strokeWidth="0.4" opacity="0.4" />
        {/* 刻度线 */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2
          const rOut = 38, rIn = i % 3 === 0 ? 33 : 35.5
          return <line key={i} x1={Math.cos(a) * rIn} y1={Math.sin(a) * rIn} x2={Math.cos(a) * rOut} y2={Math.sin(a) * rOut}
            stroke="#e3c478" strokeWidth={i % 3 === 0 ? 0.8 : 0.35} opacity={i % 3 === 0 ? 0.75 : 0.35} />
        })}
        {/* 主方位十字 + 斜向十字 */}
        <path d="M0 -42 L5 -6 L42 0 L5 6 L0 42 L-5 6 L-42 0 L-5 -6 Z" fill="url(#tb-gold)" opacity="0.92" />
        <path d="M0 -28 L3.5 -4.5 L28 0 L3.5 4.5 L0 28 L-3.5 4.5 L-28 0 L-3.5 -4.5 Z" transform="rotate(45)" fill="url(#tb-gold)" opacity="0.45" />
        {/* 内圈同心圆 */}
        <circle r="18" fill="none" stroke="url(#tb-gold)" strokeWidth="0.5" opacity="0.5" />
        <circle r="10" fill="none" stroke="url(#tb-gold)" strokeWidth="0.35" opacity="0.3" />
        {/* 中心轴点 */}
        <circle r="5" fill="#0a0a1f" stroke="url(#tb-gold)" strokeWidth="1" />
        <circle r="2" fill="#e3c478" opacity="0.9" />
      </g>

      {/* 顶部与底部小星饰（微微呼吸） */}
      <g className="tarot-back-ornament" fill="url(#tb-gold)" opacity="0.85">
        <path d="M100 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
        <path d="M100 268 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
      </g>

      <text x="100" y="250" textAnchor="middle" fontSize="12" letterSpacing="6"
        fill="url(#tb-gold)" opacity="0.9" fontFamily="Georgia, 'Songti SC', 'Noto Serif SC', serif">TAROT</text>
    </svg>
  )
}

export default TarotBack
