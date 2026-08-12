import React from 'react'

// 右下角悬浮触发点：星空球 —— 深靛底 + 烫金星月 + 柔光晕。
const TarotOrb = ({ onOpen }) => (
  <button
    className="tarot-orb"
    onClick={onOpen}
    aria-label="打开塔罗占卜"
    title="塔罗占卜"
  >
    <svg className="tarot-orb-core" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="orb-bg" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#2a2f63" />
          <stop offset="1" stopColor="#0c0e28" />
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
      <g fill="#dfe6ff" opacity="0.85">
        <circle cx="18" cy="20" r="0.9" /><circle cx="46" cy="40" r="0.8" />
        <circle cx="22" cy="44" r="0.7" /><circle cx="42" cy="18" r="0.7" />
      </g>
      {/* 烫金弯月 + 小星，带柔光 */}
      <g filter="url(#orb-glow)">
        <path d="M39 18 A16 16 0 1 0 39 46 A12 12 0 1 1 39 18 Z" fill="none" stroke="url(#orb-gold)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M47 23 l1.5 3.6 l3.6 1.5 l-3.6 1.5 l-1.5 3.6 l-1.5 -3.6 l-3.6 -1.5 l3.6 -1.5 Z" fill="url(#orb-gold)" />
      </g>
    </svg>
  </button>
)

export default TarotOrb
