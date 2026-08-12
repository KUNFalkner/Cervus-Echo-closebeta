import React, { useEffect, useRef, useMemo } from 'react'
import gsap from 'gsap'
import TarotExperience from './TarotExperience'
import TarotCanvas from './TarotCanvas'

// 全屏塔罗：神秘星空（canvas 粒子星海 + 旋转星盘 + 极光 + 微光星云 + 星座连线）
const TarotOverlay = ({ open, onClose }) => {
  const overlayRef = useRef(null)
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 星座连线（仿 Image #1：散落的星点+细线图案，缓慢漂移）
  const constellations = useMemo(() => [
    { points: '18,12 52,38 44,78 76,58', top: 4, left: 2, dur: 90, rev: false },
    { points: '6,40 38,28 70,42 56,72 82,60', top: 28, left: 68, dur: 110, rev: true },
    { points: '10,20 46,14 62,48 38,66', top: 58, left: 8, dur: 95, rev: false },
    { points: '8,30 34,16 58,32 44,64 74,50', top: 68, left: 55, dur: 120, rev: true },
    { points: '14,10 42,26 30,54 58,42', top: 12, left: 38, dur: 85, rev: false },
    { points: '4,24 36,12 64,28 48,56 80,40', top: 42, left: 32, dur: 100, rev: true },
  ], [])

  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    if (open) {
      document.body.style.overflow = 'hidden'
      el.style.display = 'flex'
      if (reduce()) { gsap.set(el, { opacity: 1, scale: 1 }); return }
      gsap.fromTo(el,
        { opacity: 0, scale: 0.96, transformOrigin: 'bottom right' },
        { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' })
    } else {
      document.body.style.overflow = ''
      if (reduce()) { el.style.display = 'none'; return }
      gsap.to(el, {
        opacity: 0, scale: 0.96, duration: 0.3, ease: 'power2.in',
        onComplete: () => { el.style.display = 'none' }
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      ref={overlayRef}
      className="tarot-overlay tarot-mystic"
      style={{ display: 'none' }}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="塔罗占卜"
    >
      <div className="tarot-cosmos" aria-hidden>
        <TarotCanvas active={open} />
        <div className="tarot-nebula tarot-nebula-1" />
        <div className="tarot-nebula tarot-nebula-2" />
        <div className="tarot-nebula tarot-nebula-3" />
        {/* 极光带：缓慢漂移的彩色光晕，增添繁华魅力 */}
        <div className="tarot-aurora tarot-aurora-1" />
        <div className="tarot-aurora tarot-aurora-2" />
        {/* 旋转星盘（里外两层反向缓转） */}
        <svg className="tarot-astrolabe tarot-astrolabe-outer" viewBox="0 0 200 200">
          <g fill="none" stroke="#e3c478" strokeWidth="0.5">
            <circle cx="100" cy="100" r="96" /><circle cx="100" cy="100" r="80" /><circle cx="100" cy="100" r="62" />
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2
              const r1 = i % 5 === 0 ? 80 : 88
              return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 96} y2={100 + Math.sin(a) * 96} />
            })}
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i / 12) * Math.PI * 2
              return <line key={i} x1={100 + Math.cos(a) * 62} y1={100 + Math.sin(a) * 62} x2={100 + Math.cos(a) * 96} y2={100 + Math.sin(a) * 96} opacity="0.6" />
            })}
          </g>
        </svg>
        <svg className="tarot-astrolabe tarot-astrolabe-inner" viewBox="0 0 200 200">
          <g fill="none" stroke="#cdd6e8" strokeWidth="0.5">
            <circle cx="100" cy="100" r="44" /><circle cx="100" cy="100" r="30" />
            <path d="M100 8 L104 96 L192 100 L104 104 L100 192 L96 104 L8 100 L96 96 Z" opacity="0.5" />
            <circle cx="100" cy="20" r="2" fill="#e3c478" stroke="none" />
            <circle cx="180" cy="100" r="2" fill="#e3c478" stroke="none" />
            <circle cx="100" cy="180" r="2" fill="#e3c478" stroke="none" />
            <circle cx="20" cy="100" r="2" fill="#e3c478" stroke="none" />
          </g>
        </svg>
        {/* 第二星盘：浑天仪式黄道环（呼应卡背旋转星盘，反向缓转） */}
        <svg className="tarot-astrolabe tarot-astrolabe-zodiac" viewBox="0 0 200 200">
          <g fill="none" stroke="#e3c478" strokeWidth="0.4" opacity="0.2">
            {/* 倾斜椭圆环（模拟黄道面） */}
            <ellipse cx="100" cy="100" rx="90" ry="34" transform="rotate(-20 100 100)" />
            <ellipse cx="100" cy="100" rx="74" ry="26" transform="rotate(-20 100 100)" />
            <ellipse cx="100" cy="100" rx="56" ry="18" transform="rotate(-20 100 100)" />
            {/* 赤道环 */}
            <circle cx="100" cy="100" r="70" stroke="rgba(180,190,230,.25)" strokeWidth="0.35" />
            <circle cx="100" cy="100" r="52" stroke="rgba(180,190,230,.15)" strokeWidth="0.3" />
            {/* 交点标记 */}
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2 - 0.4
              const px = 100 + Math.cos(a) * 90
              const py = 100 + Math.sin(a) * 34
              // 椭圆上的点（近似）
              const ex = 100 + Math.cos(a) * 90 * Math.cos(-20 * Math.PI / 180) - Math.sin(a) * 34 * Math.sin(-20 * Math.PI / 180)
              const ey = 100 + Math.cos(a) * 90 * Math.sin(-20 * Math.PI / 180) + Math.sin(a) * 34 * Math.cos(-20 * Math.PI / 180)
              return <circle key={i} cx={ex} cy={ey} r={i % 2 === 0 ? 1.5 : 0.8} fill="#e3c478" stroke="none" opacity={0.3 + (i % 3) * 0.15} />
            })}
            {/* 经线弧 */}
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i / 6) * Math.PI
              return <line key={i} x1={100} y1={100}
                x2={100 + Math.cos(a) * 70} y2={100 + Math.sin(a) * 70}
                stroke="rgba(180,190,230,.12)" strokeWidth="0.3" />
            })}
          </g>
        </svg>
        {/* 第三星盘：左上角缓转刻度盘（细分刻度 + 十字游丝） */}
        <svg className="tarot-astrolabe tarot-astrolabe-dial-tl" viewBox="0 0 200 200">
          <g fill="none" stroke="#e3c478" strokeWidth="0.4" opacity="0.16">
            <circle cx="100" cy="100" r="92" /><circle cx="100" cy="100" r="80" strokeWidth="0.3" />
            {Array.from({ length: 72 }).map((_, i) => {
              const a = (i / 72) * Math.PI * 2
              const r1 = i % 6 === 0 ? 74 : 82
              return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92} strokeWidth={i % 6 === 0 ? 0.6 : 0.25} />
            })}
            {/* 十字游丝 */}
            <line x1="100" y1="14" x2="100" y2="186" strokeWidth="0.3" opacity="0.5" />
            <line x1="14" y1="100" x2="186" y2="100" strokeWidth="0.3" opacity="0.5" />
            <circle cx="100" cy="100" r="4" fill="#e3c478" stroke="none" opacity="0.4" />
          </g>
        </svg>
        {/* 第四星盘：右下角浑仪环（双层交叉椭圆环 + 行星点） */}
        <svg className="tarot-astrolabe tarot-astrolabe-armillary-br" viewBox="0 0 200 200">
          <g fill="none" stroke="#bcd2ff" strokeWidth="0.35" opacity="0.16">
            <ellipse cx="100" cy="100" rx="90" ry="46" />
            <ellipse cx="100" cy="100" rx="90" ry="46" transform="rotate(70 100 100)" />
            <ellipse cx="100" cy="100" rx="68" ry="34" transform="rotate(35 100 100)" stroke="#e3c478" strokeWidth="0.3" opacity="0.6" />
            <circle cx="100" cy="100" r="52" strokeWidth="0.3" />
            {/* 行星点 */}
            <circle cx="190" cy="100" r="2" fill="#e3c478" stroke="none" opacity="0.5" />
            <circle cx="100" cy="146" r="1.6" fill="#bcd2ff" stroke="none" opacity="0.5" />
            <circle cx="42" cy="68" r="1.6" fill="#d9c4ff" stroke="none" opacity="0.5" />
          </g>
        </svg>
        {/* 第五星盘：居中轨道系（细环 + 行星沿轨，极缓转，垫于星盘之下增加纵深） */}
        <svg className="tarot-astrolabe tarot-astrolabe-orbits" viewBox="0 0 200 200">
          <g fill="none" stroke="rgba(200,210,255,.18)" strokeWidth="0.3">
            <circle cx="100" cy="100" r="40" /><circle cx="100" cy="100" r="58" /><circle cx="100" cy="100" r="76" />
            <circle cx="140" cy="100" r="2" fill="#e3c478" stroke="none" opacity="0.4" />
            <circle cx="100" cy="158" r="1.6" fill="#bcd2ff" stroke="none" opacity="0.4" />
            <circle cx="24" cy="100" r="1.6" fill="#d9c4ff" stroke="none" opacity="0.4" />
          </g>
        </svg>
        {/* 星座连线（散落的星图图案，缓慢漂移） */}
        <div className="tarot-constellations">
          {constellations.map((c, i) => (
            <svg key={i} className={`tarot-constellation-map ${c.rev ? 'rev' : ''}`}
              viewBox="0 0 90 85" style={{ top: c.top + '%', left: c.left + '%', animationDuration: c.dur + 's' }}
              aria-hidden>
              <g stroke="rgba(200,210,255,.35)" strokeWidth="0.5" fill="rgba(200,210,255,.5)">
                <polyline points={c.points} fill="none" />
                {c.points.split(' ').map((pt, j) => {
                  const [cx, cy] = pt.split(',').map(Number)
                  return <circle key={j} cx={cx} cy={cy} r={1 + (j % 3) * 0.6}
                    opacity={0.4 + (j % 4) * 0.15} />
                })}
              </g>
            </svg>
          ))}
        </div>
      </div>
      <button className="tarot-overlay-close" onClick={onClose} aria-label="关闭">×</button>
      <div className="tarot-overlay-scroll">
        <TarotExperience />
      </div>
    </div>
  )
}

export default TarotOverlay
