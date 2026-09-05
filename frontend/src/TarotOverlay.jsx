import React, { useEffect, useRef, useMemo, useId, useState } from 'react'
import gsap from 'gsap'
import { animate } from 'animejs'
import TarotExperience from './TarotExperience'
import TarotCanvas from './TarotCanvas'

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 流星场：每颗独立角度/长度/路径/节奏，anime.js 驱动（加速掠过 + 渐隐 + 拖尾伸缩），
// 比纯 CSS 直线平移更自然。角度由外层 pivot 承载（anime.js 会覆盖 transform，
// 故不把 rotate 放进补间，否则每轮循环会从 0 重播造成抖动）；位移/伸缩/渐隐走 anime.js。
// 抽牌时随 body.tarot-dealing 暂停全部流星 JS 动画，避免 hero 面板 backdrop-filter 每帧重算。
// 自然化（用户反馈：太丑/太快/路径假）：
//  - 更慢：单次掠过 3.8~6.4s（真实流星其实很快，但作为背景氛围需要可观赏的缓速拖光）；
//  - 更稀：相邻两次出现间隔 6~13s，基础流星降到 3~4 颗，避免「一直在刷」；
//  - 角度更多样（18~68°），且起点散布在上方/左上不同位置、终点落在对侧下方，路径不再千篇一律；
//  - 拖尾更长更细、亮头更收、整体峰值更低，像夜空里一缕将散未散的流光，而非硬白横条。
function buildMeteors() {
  const rnd = (a, b) => a + Math.random() * (b - a)
  const out = []
  const count = 3 + (Math.random() < 0.5 ? 0 : 1) // 3~4 颗基础流星（稀疏）
  for (let i = 0; i < count; i++) {
    out.push({
      angle: +rnd(18, 68).toFixed(1),          // 角度更多样，斜掠更自然
      len: Math.round(rnd(150, 320)),           // 更长
      thick: +rnd(1, 2).toFixed(2),             // 更细
      x0: `${-rnd(2, 22).toFixed(1)}vw`,        // 起点散布在上方/左上
      y0: `${-rnd(2, 24).toFixed(1)}vh`,
      x1: `${rnd(58, 110).toFixed(1)}vw`,       // 终点落在对侧下方不同位置
      y1: `${rnd(40, 86).toFixed(1)}vh`,
      dur: Math.round(rnd(3800, 6400)),         // 更慢
      delay: Math.round(rnd(0, 7000)),
      loop: Math.round(rnd(6000, 13000)),       // 更稀疏
      peak: +rnd(0.5, 0.82).toFixed(2),
      // 自然化 v3：轨迹微弧（风偏）——终点横向偏移 ±6vw，配 rotate 补间让头微摆
      curve: +rnd(-6, 6).toFixed(1),
      // 亮度节奏：入窗慢 → 巡行亮 → 熄尾快（非线性补间，见 keyframes）
    })
  }
  // 偶尔成双：挑一颗做近孪生的第二颗（同角度、近同时、略短），像真实夜空「时不时划过两颗」
  if (Math.random() < 0.5) {
    const s = out[Math.floor(Math.random() * out.length)]
    out.push({
      angle: +(s.angle + rnd(-4, 4)).toFixed(1),
      len: Math.round(s.len * rnd(0.7, 1)),
      thick: s.thick,
      x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1,
      dur: s.dur, peak: +(s.peak * rnd(0.8, 1)).toFixed(2),
      delay: s.delay + Math.round(rnd(160, 520)),
      loop: s.loop,
      curve: +(s.curve + rnd(-2, 2)).toFixed(1),
    })
  }
  return out
}
const MeteorField = ({ perfTier }) => {
  const ref = useRef(null)
  const meteors = useMemo(buildMeteors, [])
  useEffect(() => {
    if (reduceMotion()) return
    if (perfTier === 'low') return
    // 手机端背景固定：不启动流星动画，CSS 会兜底隐藏整个流星场
    if (window.innerWidth <= 520) return
    const root = ref.current
    if (!root) return
    const anims = []
    root.querySelectorAll('.tarot-meteor').forEach((m, i) => {
      const c = meteors[i % meteors.length]
      // 自然化 v3（animejs skill · keyframes）：
      //  - 位移不再一条直线匀速：主补间走 inOutSine，但把 rotate 加一个 ±1.2° 的
      //    微摆（pivot 在尾端，视觉是「头微摆、尾拖住」），破坏机械感
      //  - 亮度四段 keyframes：暗入场(慢) → 亮起(快) → 巡行(稳) → 熄灭(快)，
      //    与真实流星「掠入视野才显形、离开前先熄」的观感一致
      //  - scaleX 尾迹：起步拖出(0.3→1) + 熄灭前回缩(1→0.25)，模拟尾巴收光
      anims.push(animate(m, {
        translateX: [c.x0, c.x1],
        translateY: [c.y0, c.y1],
        scaleX: [
          { to: 0.3, duration: 1 },
          { to: 1, duration: c.dur * 0.22, ease: 'outQuad' },
          { to: 1, duration: c.dur * 0.5 },
          { to: 0.25, duration: c.dur * 0.28, ease: 'inQuad' },
        ],
        opacity: [
          { to: 0, duration: 1 },
          { to: c.peak * 0.55, duration: c.dur * 0.18, ease: 'outSine' },
          { to: c.peak, duration: c.dur * 0.24, ease: 'inOutSine' },
          { to: c.peak * 0.9, duration: c.dur * 0.38 },
          { to: 0, duration: c.dur * 0.2, ease: 'inQuad' },
        ],
        duration: c.dur,
        delay: c.delay,
        loop: true,
        loopDelay: c.loop,
        ease: 'inOutSine',
      }))
      // 头部微摆：独立小补间挂在 pivot 上（rotate 固定角上叠加摆动，互不覆盖）
      const pivot = m.parentNode
      if (pivot && !pivot.dataset.sway) {
        pivot.dataset.sway = '1'
        anims.push(animate(pivot, {
          rotate: [`${c.angle}deg`, `${c.angle + (c.curve > 0 ? 1.4 : -1.4)}deg`, `${c.angle}deg`],
          duration: c.dur,
          delay: c.delay,
          loop: true,
          loopDelay: c.loop,
          ease: 'inOutQuad',
        }))
      }
    })
    const mo = new MutationObserver(() => {
      const dealing = document.body.classList.contains('tarot-dealing')
      anims.forEach(a => (dealing ? a.pause() : a.resume()))
    })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => { mo.disconnect(); anims.forEach(a => a.cancel && a.cancel()) }
  }, [perfTier, meteors])
  return (
    <div className="tarot-meteor-field" ref={ref} aria-hidden>
      {meteors.map((c, i) => (
        <span className="tarot-meteor-pivot" key={i} style={{ transform: `rotate(${c.angle}deg)` }}>
          <span className="tarot-meteor" style={{ width: c.len + 'px', height: c.thick + 'px' }} />
        </span>
      ))}
    </div>
  )
}

// 性能分档：先用设备内存/核心数做硬件启发式，再采样 ~1.2s 真实帧率校准，
// 输出 high/med/low。弱设备（内存小/核心少，或实测帧率过低）自动降特效。
// 与 prefers-reduced-motion 并存：reduce 走静态，本档位在此基础上再减元素。
function usePerfTier(open) {
  const [tier, setTier] = useState('high')
  useEffect(() => {
    if (!open) return
    const mem = navigator.deviceMemory || 4
    const cores = navigator.hardwareConcurrency || 4
    let guess = 'high'
    if (mem <= 2 || cores <= 2) guess = 'low'
    else if (mem <= 4 || cores <= 4) guess = 'med'
    setTier(guess)
    let frames = 0
    const start = performance.now()
    let rafId = 0
    const order = { low: 0, med: 1, high: 2 }
    const sample = (now) => {
      frames++
      const elapsed = now - start
      if (elapsed < 1200) {
        rafId = requestAnimationFrame(sample)
      } else {
        const fps = frames / (elapsed / 1000)
        let fpsTier = 'high'
        if (fps < 40) fpsTier = 'low'
        else if (fps < 52) fpsTier = 'med'
        // 取更保守的一档：硬件弱则保持低档，即便空闲帧率虚高
        const resolved = order[fpsTier] <= order[guess] ? fpsTier : guess
        setTier(resolved)
      }
    }
    rafId = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(rafId)
  }, [open])
  return tier
}

// 大星盘（时钟式表盘：同心环 + 填充盘面 + 12 时辰刻度 + 60 分度 + 放射线）
const BigAstrolabe = ({ className, stroke = '#e3c478' }) => {
  const gid = 'astro' + useId().replace(/[:]/g, '')
  return (
    <svg className={`tarot-astrolabe ${className}`} viewBox="0 0 200 200" aria-hidden>
      <defs>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0b0e22" stopOpacity="0.10" />
          <stop offset="55%" stopColor="#141a36" stopOpacity="0.34" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.14" />
        </radialGradient>
      </defs>
      <g fill="none" stroke={stroke} strokeWidth="0.5">
        {/* 填充盘面：中间不再空洞，像时钟表盘 */}
        <circle cx="100" cy="100" r="60" fill={`url(#${gid})`} stroke="none" />
        <circle cx="100" cy="100" r="60" />
        <circle cx="100" cy="100" r="40" opacity="0.5" />
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
      {/* 12 时辰刻度（像时钟的整点标记） */}
      <g fill={stroke}>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2
          return <circle key={i} cx={100 + Math.cos(a) * 56} cy={100 + Math.sin(a) * 56} r={i % 3 === 0 ? 1.9 : 1.1} opacity={i % 3 === 0 ? 0.95 : 0.6} />
        })}
      </g>
    </svg>
  )
}

// 全屏塔罗：神秘星空（canvas 粒子星海 + 旋转星盘 + 极光 + 微光星云 + 星座连线）
const TarotOverlay = ({ open, onClose }) => {
  const overlayRef = useRef(null)
  const innerRef = useRef(null)
  const perfTier = usePerfTier(open)
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
    const inner = innerRef.current
    if (!el || !inner) return
    if (open) {
      document.body.style.overflow = 'hidden'
      el.style.display = 'flex'
      // 缩放/淡入动画只作用于 .tarot-overlay-inner（仅包裹前景内容），
      // 绝不碰 .tarot-overlay 本身。这样背景层 .tarot-cosmos（含旋转星盘）
      // 永远不会因为祖先 transform 而把 position:fixed 降级，星盘稳定钉在视口，
      // 不会再出现「跟着聊天框动」的定时炸弹。
      if (reduce()) { gsap.set(inner, { opacity: 1, clearProps: 'transform' }); return }
      gsap.fromTo(inner,
        { opacity: 0, scale: 0.96, transformOrigin: 'bottom right' },
        { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out',
          onComplete: () => gsap.set(inner, { clearProps: 'transform' }) })
    } else {
      document.body.style.overflow = ''
      if (reduce()) { el.style.display = 'none'; return }
      gsap.to(inner, {
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
      <div className={`tarot-cosmos tarot-perf-${perfTier}`} aria-hidden>
        <TarotCanvas active={open} quality={perfTier} />
        <div className="tarot-nebula tarot-nebula-1" />
        <div className="tarot-nebula tarot-nebula-2" />
        <div className="tarot-nebula tarot-nebula-3" />
        {/* 极光带：缓慢漂移的彩色光晕，增添繁华魅力 */}
        <div className="tarot-aurora tarot-aurora-1" />
        <div className="tarot-aurora tarot-aurora-2" />
        {/* 旋转星盘（里外两层反向缓转） */}
        <BigAstrolabe className="tarot-astrolabe-outer" />
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
        {/* 第六星盘：移至右下、与中央星盘部分重合，如咬合齿轮（逆转） */}
        <BigAstrolabe className="tarot-astrolabe-mid-r" />
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
        {/* 流星场：anime.js 驱动的有机流光，错峰掠过背景 */}
        <MeteorField perfTier={perfTier} />
      </div>
      <div className="tarot-overlay-inner" ref={innerRef}>
        <button className="tarot-overlay-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="tarot-overlay-scroll">
          <TarotExperience />
        </div>
      </div>
    </div>
  )
}

export default TarotOverlay
