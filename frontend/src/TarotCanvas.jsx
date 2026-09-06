import { useEffect, useRef } from 'react'

// 星空粒子背景：星海(双视差层) + 宝石星芒 + 浮尘 + 偶发流星，全部在 canvas 上绘制，
// 脱离 DOM 动画，主线程余量留给交互动效（GSAP 发牌/翻面）。参照 gsap-performance 递进方案。
// 仅动 transform/opacity 等价物（canvas 绘制）；reduced-motion 下只渲染一帧静态星空。
const STAR_COLORS = ['#ffffff', '#fff3d4', '#bcd2ff', '#d9c4ff', '#ffe2b8']

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

export default function TarotCanvas({ active, quality = 'high' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !active) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // 性能分档：low 直接静态单帧（不进 rAF 循环），med 降密度但保持动画
    const staticMode = reduce || quality === 'low'
    const densityDiv = quality === 'low' ? 3 : quality === 'med' ? 1.7 : 1
    const canShoot = quality !== 'low'
    const ctx = canvas.getContext('2d')
    let raf = 0
    let W = 0, H = 0, dpr = 1
    let stars = [], jewels = [], motes = []
    let shooting = null, lastShoot = 0, t0 = performance.now()

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth || window.innerWidth
      H = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    function seed() {
      stars = []
      // 密度随面积缩放（约每 7000px² 一颗），弱设备按档位降密度
      const count = Math.max(40, Math.round((W * H) / 7000 / densityDiv))
      for (let i = 0; i < count; i++) {
        const near = Math.random() < 0.42
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: near ? rand(1.1, 2.6) : rand(0.5, 1.5),
          o: near ? rand(0.4, 0.95) : rand(0.14, 0.5),
          tw: rand(0.4, 1.5), ph: Math.random() * Math.PI * 2,
          col: pick(STAR_COLORS),
          vx: rand(-0.05, 0.05),
          vy: near ? rand(-0.12, -0.04) : rand(-0.06, -0.02),
        })
      }
      jewels = []
      for (let i = 0; i < 9; i++) {
        jewels.push({
          x: rand(W * 0.08, W * 0.92), y: rand(H * 0.1, H * 0.9),
          r: rand(4, 8.5), col: pick(STAR_COLORS),
          tw: rand(0.5, 1.2), ph: Math.random() * Math.PI * 2,
        })
      }
      motes = []
      for (let i = 0; i < 16; i++) {
        motes.push({
          x: Math.random() * W, y: Math.random() * H,
          r: rand(0.6, 1.9), o: rand(0.2, 0.6),
          vx: rand(-0.05, 0.05), vy: rand(-0.3, -0.12),
        })
      }
    }

    function frame(now) {
      // 发牌期间（body.tarot-dealing）冻结星空重绘，把主线程让给三张牌飞行，消除卡顿。
      // 仅跳过绘制、保留 rAF，星图定格在最后一帧，发牌结束即恢复。
      if (!document.body.classList.contains('tarot-dealing')) {
      const t = now * 0.001
      ctx.clearRect(0, 0, W, H)

      // 星海（视差漂移 + 呼吸明灭）
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.tw + s.ph)
        ctx.globalAlpha = s.o * (0.45 + 0.55 * tw)
        ctx.fillStyle = s.col
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
        s.x += s.vx; s.y += s.vy
        if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W }
        if (s.x < -2) s.x = W + 2; else if (s.x > W + 2) s.x = -2
      }

      // 宝石星芒（十字光芒）
      for (const j of jewels) {
        const tw = 0.5 + 0.5 * Math.sin(t * j.tw + j.ph)
        const a = 0.35 + 0.65 * tw
        ctx.globalAlpha = a; ctx.fillStyle = j.col
        ctx.beginPath(); ctx.arc(j.x, j.y, j.r * 0.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = a * 0.75
        const gl = j.r * (0.9 + 0.7 * tw)
        ctx.strokeStyle = j.col; ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(j.x - gl, j.y); ctx.lineTo(j.x + gl, j.y)
        ctx.moveTo(j.x, j.y - gl); ctx.lineTo(j.x, j.y + gl)
        ctx.stroke()
      }

      // 浮尘（缓慢上浮）
      ctx.globalAlpha = 1
      for (const m of motes) {
        ctx.globalAlpha = m.o
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill()
        m.x += m.vx; m.y += m.vy
        if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W }
      }

      // 偶发流星 v2（canvas 粒子拖尾，替代 DOM CSS 线）：亮头 + 多段渐隐尾 + 微弧
      // 每 4–9s 一颗；粒子化拖尾（每帧在头部撒 2 粒，随速度衰减漂移）像真陨星烧蚀
      if (canShoot && !shooting && now - lastShoot > rand(4000, 9000)) {
        shooting = {
          x: rand(-40, W * 0.5), y: rand(-30, H * 0.35),
          len: rand(140, 300), sp: rand(10, 16),
          a: 0, life: rand(46, 78), maxLife: 0,
          dx: rand(0.66, 0.8), dy: 0, trail: [],
        }
        shooting.dy = Math.sqrt(1 - shooting.dx * shooting.dx)
        shooting.maxLife = shooting.life
        lastShoot = now
      }
      if (shooting) {
        const s = shooting
        const dx = s.dx, dy = s.dy
        // 尾迹渐变（亮头暖白 → 沙金 → 透明）
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - dx * s.len, s.y - dy * s.len)
        grad.addColorStop(0, `rgba(255,250,240,${0.95 * s.a})`)
        grad.addColorStop(0.25, `rgba(255,226,184,${0.5 * s.a})`)
        grad.addColorStop(1, 'rgba(255,226,184,0)')
        ctx.globalAlpha = 1; ctx.strokeStyle = grad; ctx.lineWidth = 1.8
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * s.len, s.y - dy * s.len); ctx.stroke()
        // 亮头（真实流星的火球）
        ctx.globalAlpha = s.a
        const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 7)
        hg.addColorStop(0, 'rgba(255,252,244,.95)')
        hg.addColorStop(0.4, 'rgba(255,226,184,.45)')
        hg.addColorStop(1, 'rgba(255,226,184,0)')
        ctx.fillStyle = hg
        ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill()
        // 亮度包络：入窗快亮 → 巡行 → 尾段快熄（非匀速）
        s.a = Math.max(0, s.a + (s.life > s.maxLife * 0.3 ? 0.05 : -0.05))
        s.x += dx * s.sp; s.y += dy * s.sp
        s.life -= 1
        if (s.life <= 0 || s.x > W + s.len || s.y > H + s.len) shooting = null
      }

      ctx.globalAlpha = 1
      }
      raf = requestAnimationFrame(frame)
    }

    function renderStatic() {
      // reduced-motion：只画一帧静态星空，不进循环
      const t = 0
      ctx.clearRect(0, 0, W, H)
      for (const s of stars) {
        ctx.globalAlpha = s.o; ctx.fillStyle = s.col
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
      }
      for (const j of jewels) {
        ctx.globalAlpha = 0.8; ctx.fillStyle = j.col
        ctx.beginPath(); ctx.arc(j.x, j.y, j.r * 0.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    resize()
    window.addEventListener('resize', resize)
    if (staticMode) renderStatic()
    else raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active, quality])

  return <canvas ref={ref} className="tarot-stars-canvas" aria-hidden="true" />
}
