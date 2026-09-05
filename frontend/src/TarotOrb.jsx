import React from 'react'

// 右下角悬浮触发球：墨蓝夜空底 + 沙金星月 + 呼吸光晕。
// 配色与登录页/主题统一（同一套午夜蓝 + 沙金体系）。
const TarotOrb = ({ onOpen }) => (
  <button
    className="tarot-orb"
    onClick={onOpen}
    aria-label="打开塔罗占卜"
    title="塔罗占卜"
  >
    <svg className="tarot-orb-core" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="orb-bg" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#232850" />
          <stop offset="0.62" stopColor="#141833" />
          <stop offset="1" stopColor="#0a0c1f" />
        </radialGradient>
        <linearGradient id="orb-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4e3a8" />
          <stop offset="1" stopColor="#b8923f" />
        </linearGradient>
        <filter id="orb-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#orb-bg)" stroke="url(#orb-gold)" strokeWidth="1.2" opacity="0.96" />
      {/* 散落小星 */}
      <g fill="#e8edff" opacity="0.8">
        <circle cx="18" cy="20" r="0.9" /><circle cx="46" cy="40" r="0.8" />
        <circle cx="22" cy="44" r="0.7" /><circle cx="42" cy="18" r="0.7" />
      </g>
      {/* 烫金弯月 + 四芒星（同色系沙金，带柔光） */}
      <g filter="url(#orb-glow)">
        <path d="M39 18 A16 16 0 1 0 39 46 A12 12 0 1 1 39 18 Z" fill="none" stroke="url(#orb-gold)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M47 23 l1.5 3.6 l3.6 1.5 l-3.6 1.5 l-1.5 3.6 l-1.5 -3.6 l-3.6 -1.5 l3.6 -1.5 Z" fill="url(#orb-gold)" />
      </g>
      {/* 顶部高光弧：玻璃球质感 */}
      <path d="M18 22 A17 17 0 0 1 44 14" stroke="rgba(240,244,255,.35)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  </button>
)

export default TarotOrb
