import React from 'react'

// 右下角悬浮水晶球：点击展开全屏塔罗。固定定位，z-index 低于 overlay。
const TarotOrb = ({ onOpen }) => (
  <button
    className="tarot-orb"
    onClick={onOpen}
    aria-label="打开塔罗占卜"
    title="塔罗占卜"
  >
    <span className="tarot-orb-glow" aria-hidden />
    <svg className="tarot-orb-core" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="orb-fill" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#cdb8ff" />
          <stop offset="45%" stopColor="#7b5cff" />
          <stop offset="100%" stopColor="#2a1b6b" />
        </radialGradient>
        <radialGradient id="orb-shine" cx="35%" cy="28%" r="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#orb-fill)" stroke="rgba(233,196,106,.8)" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="26" fill="url(#orb-shine)" />
      <path d="M32 12 L35 29 L52 32 L35 35 L32 52 L29 35 L12 32 L29 29 Z" fill="rgba(255,243,196,.85)" opacity=".9" />
      <circle cx="24" cy="22" r="3.4" fill="rgba(255,255,255,.85)" />
    </svg>
  </button>
)

export default TarotOrb
