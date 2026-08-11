import React from 'react'

// 塔罗卡背：靛蓝+金色八芒星+月相+回纹边框。纯内联 SVG，自适应容器尺寸。
const TarotBack = ({ className = '', style }) => (
  <svg
    className={`tarot-back-svg ${className}`}
    style={style}
    viewBox="0 0 200 300"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient id="tb-bg" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stopColor="#3a2d7a" />
        <stop offset="55%" stopColor="#1f1b4d" />
        <stop offset="100%" stopColor="#0c0a26" />
      </radialGradient>
      <linearGradient id="tb-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff3c4" />
        <stop offset="45%" stopColor="#e9c46a" />
        <stop offset="100%" stopColor="#b8862f" />
      </linearGradient>
      <radialGradient id="tb-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(233,196,106,.55)" />
        <stop offset="100%" stopColor="rgba(233,196,106,0)" />
      </radialGradient>
      <filter id="tb-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
    </defs>

    {/* 底色 */}
    <rect x="0" y="0" width="200" height="300" rx="14" fill="url(#tb-bg)" />

    {/* 外回纹边框 */}
    <rect x="9" y="9" width="182" height="282" rx="10" fill="none" stroke="url(#tb-gold)" strokeWidth="2.2" opacity=".9" />
    <rect x="15" y="15" width="170" height="270" rx="7" fill="none" stroke="url(#tb-gold)" strokeWidth=".9" opacity=".55" />
    {/* 四角小方块点缀 */}
    {[[15,15],[185,15],[15,285],[185,285]].map(([cx,cy],i)=>(
      <rect key={i} x={cx-3} y={cy-3} width="6" height="6" fill="url(#tb-gold)" opacity=".85" transform={`rotate(45 ${cx} ${cy})`} />
    ))}

    {/* 中心光晕 */}
    <circle cx="100" cy="118" r="62" fill="url(#tb-glow)" />

    {/* 八芒星：两枚旋转 45° 的金色方块 */}
    <g transform="translate(100 110)">
      <g fill="none" stroke="url(#tb-gold)" strokeWidth="2.4" opacity=".95">
        <rect x="-34" y="-34" width="68" height="68" rx="3" />
        <rect x="-34" y="-34" width="68" height="68" rx="3" transform="rotate(45)" />
      </g>
      <circle r="22" fill="none" stroke="url(#tb-gold)" strokeWidth="1.2" opacity=".7" />
      {/* 中央月相微章：新月→满月 */}
      <g filter="url(#tb-soft)">
        <circle cx="0" cy="0" r="13" fill="#0c0a26" stroke="url(#tb-gold)" strokeWidth="1.4" />
        <path d="M2,-11 A11,11 0 1,0 2,11 A8,11 0 1,1 2,-11 Z" fill="url(#tb-gold)" />
      </g>
    </g>

    {/* 底部月相序列（8 相） */}
    <g transform="translate(100 210)">
      {Array.from({ length: 8 }).map((_, i) => {
        const x = -63 + i * 18
        const phase = i / 8
        // 用两块圆叠出月相观感
        const lit = phase <= 0.5 ? phase * 2 : (1 - phase) * 2
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <circle r="6.2" fill="#0c0a26" stroke="url(#tb-gold)" strokeWidth=".8" />
            <path
              d={`M0,-6.2 A6.2,6.2 0 0,1 0,6.2 A${6.2 * Math.max(.05, lit)},6.2 0 0,${lit < 1 ? 0 : 1} 0,-6.2 Z`}
              fill="url(#tb-gold)"
              opacity=".9"
            />
          </g>
        )
      })}
    </g>

    {/* 顶部 / 底部装饰文 */}
    <text x="100" y="262" textAnchor="middle" fontSize="11" letterSpacing="4"
      fill="url(#tb-gold)" opacity=".8" fontFamily="serif">TAROT</text>
  </svg>
)

export default TarotBack
