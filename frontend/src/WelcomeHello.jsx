import { useState, useEffect, useRef } from 'react'
import { animate } from 'animejs'
import '@fontsource/caveat/700.css'

/**
 * 登录欢迎遮罩：手写 "hello" 逐笔描出 → 昵称与品牌落款依次浮现。
 *
 * 字形方案（v3）：SVG <text> 直接用 Caveat 真手写字体渲染（字形绝对正确），
 * 描边动画用 stroke-dasharray + animejs 补间 strokeDashoffset（每字母一条 <text>，
 * 逐字 stagger 描出）。不再手搓贝塞尔，也不再依赖 opentype 运行时解析。
 *
 * 描边字用的是 text 的 stroke（fill 透明），dashoffset 从 length→0 形成书写感。
 */
const TEXT = 'hello'

const HelloStrokes = ({ fontReady }) => {
  const ref = useRef(null)
  const [lens, setLens] = useState(null)

  // 字体就绪后量每字母的笔画长度（驱动 dash 动画）
  useEffect(() => {
    if (!fontReady || !ref.current) return
    const els = ref.current.querySelectorAll('text')
    const l = [...els].map(t => {
      try { return t.getComputedTextLength() * 6 } // 周长近似：字宽×系数，略冗余保证画满
      catch { return 400 }
    })
    setLens(l)
  }, [fontReady])

  return (
    <svg ref={ref} viewBox="0 0 340 120" className="welcome-hello-svg" aria-label="hello">
      {[...TEXT].map((ch, i) => (
        <text key={i} x={18 + i * 62} y="88"
          className="welcome-hello-text"
          style={lens ? { strokeDasharray: lens[i], strokeDashoffset: lens[i] } : { opacity: 0 }}>
          {ch}
        </text>
      ))}
    </svg>
  )
}

export default function WelcomeHello({ nickname, onDone }) {
  const rootRef = useRef(null)
  const [phase, setPhase] = useState('drawing')
  const [fontReady, setFontReady] = useState(false)
  const [fontFailed, setFontFailed] = useState(false)

  // 等 Caveat 真字体加载完成（document.fonts API），3s 超时降级
  useEffect(() => {
    let dead = false
    const t = setTimeout(() => { if (!dead) setFontFailed(true) }, 3000)
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 100px Caveat').then(() => {
        if (dead) return
        clearTimeout(t); setFontReady(true)
      }).catch(() => { if (!dead) { clearTimeout(t); setFontFailed(true) } })
    } else {
      clearTimeout(t); setFontFailed(true)
    }
    return () => { dead = true; clearTimeout(t) }
  }, [])

  // 动画序列（任何失败都不炸 React 树）
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let phaseTimers = []
    const skip = () => { phaseTimers.forEach(clearTimeout); onDone && onDone() }
    root.addEventListener('click', skip)
    const keySkip = (e) => { if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); skip() } }
    window.addEventListener('keydown', keySkip)
    const goTo = setPhase
    const tail = () => {
      goTo('name')
      phaseTimers.push(setTimeout(() => goTo('brand'), 700))
      phaseTimers.push(setTimeout(() => { goTo('fade'); phaseTimers.push(setTimeout(() => onDone && onDone(), 800)) }, 2300))
    }

    if (reduce || fontFailed) {
      // 降级：不描边，直接成品
      goTo('name')
      phaseTimers.push(setTimeout(() => goTo('brand'), 600))
      phaseTimers.push(setTimeout(() => { goTo('fade'); phaseTimers.push(setTimeout(() => onDone && onDone(), 800)) }, 2200))
    } else if (fontReady) {
      try {
        const strokes = root.querySelectorAll('.welcome-hello-text')
        // animejs 补间 strokeDashoffset：length → 0 = 从无到有写出
        const anims = [...strokes].map((t, i) => {
          const dash = parseFloat(t.style.strokeDasharray) || 400
          return animate(t, {
            strokeDashoffset: [dash, 0],
            delay: 200 + i * 260,
            duration: 620,
            ease: 'inOutQuad',
          })
        })
        const last = anims[anims.length - 1]
        const chain = (last && typeof last.then === 'function') ? last.then.bind(last) : null
        if (chain) chain(tail)
        else phaseTimers.push(setTimeout(tail, 200 + 5 * 260 + 620 + 200))
      } catch (err) {
        console.warn('[WelcomeHello] 描边动画失败，降级静态', err)
        root.querySelectorAll('.welcome-hello-text').forEach(t => { t.style.strokeDasharray = 'none'; t.style.opacity = 1 })
        tail()
      }
    }
    return () => {
      root.removeEventListener('click', skip)
      window.removeEventListener('keydown', keySkip)
      phaseTimers.forEach(clearTimeout)
    }
  }, [fontReady, fontFailed, onDone])

  return (
    <div ref={rootRef} className={`welcome-overlay ${phase === 'fade' ? 'welcome-fade' : ''}`} role="dialog" aria-label="欢迎">
      <div className="welcome-inner">
        <div className={`welcome-hello-wrap ${fontFailed ? 'css-fallback' : ''}`}>
          {fontFailed
            ? <div className="welcome-hello-css">hello</div>
            : <HelloStrokes fontReady={fontReady} />}
        </div>
        <div className={`welcome-name ${phase === 'name' || phase === 'brand' || phase === 'fade' ? 'on' : ''}`}>
          {nickname ? `欢迎，${nickname}` : '欢迎回来'}
        </div>
        <div className={`welcome-brand ${phase === 'brand' || phase === 'fade' ? 'on' : ''}`}>
          鹿鸣回音 · Cervus Echo
        </div>
        <div className="welcome-skip-hint">点击或按任意键跳过</div>
      </div>
    </div>
  )
}
