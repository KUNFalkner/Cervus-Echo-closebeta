import { useState, useEffect, useRef } from 'react'
import { animate } from 'animejs'
import '@fontsource/caveat/700.css'

/**
 * 登录欢迎遮罩：手写 "hello" 整词描出 → 昵称与品牌落款依次浮现。
 *
 * v4：
 * - 字形：SVG <text> + Caveat 700（连笔手写体，字母自然相连，l 不再生硬）
 * - 动画：整词一道 strokeDashoffset 描边（连笔字本来就是一笔，逐字反而生硬）
 * - 关键修复：onDone 用 ref 持有，避免父组件重渲染（通知轮询每 2s）
 *   换新函数引用导致 effect 反复重跑、遮罩冻在半透明水印状态的 bug
 * - 降级链：字体 3s 未就绪 → CSS 手写体；动画异常 → 静态成品；均不炸页面
 */
export default function WelcomeHello({ nickname, onDone }) {
  const rootRef = useRef(null)
  const textRef = useRef(null)
  const [phase, setPhase] = useState('drawing')
  const [fontReady, setFontReady] = useState(false)
  const [fontFailed, setFontFailed] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone  // 永远指向最新回调，但不触发 effect 重跑

  // 等 Caveat 真字体加载（3s 超时降级）
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

  // 主动画序列：等字体+量长度 → 描边 → 昵称 → 品牌落款 → 淡出 → onDone
  useEffect(() => {
    if (fontFailed) return  // 走降级渲染，无动画
    if (!fontReady) return  // 字体没好，先不启动
    const root = rootRef.current
    const textEl = textRef.current
    if (!root || !textEl) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let phaseTimers = []
    let cancelled = false
    const finish = () => { if (!cancelled) doneRef.current && doneRef.current() }
    const skip = () => { phaseTimers.forEach(clearTimeout); finish() }
    root.addEventListener('click', skip)
    const keySkip = (e) => { if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); skip() } }
    window.addEventListener('keydown', keySkip)
    const tail = () => {
      if (cancelled) return
      setPhase('name')
      phaseTimers.push(setTimeout(() => setPhase('brand'), 700))
      phaseTimers.push(setTimeout(() => setPhase('fade'), 2300))
      phaseTimers.push(setTimeout(finish, 3100))
    }

    if (reduce) {
      setPhase('name'); setPhase('brand')
      phaseTimers.push(setTimeout(() => setPhase('fade'), 1400))
      phaseTimers.push(setTimeout(finish, 2200))
    } else {
      try {
        // 连笔整词：先无描边隐藏，量真实笔画长度，再一道写出
        const len = textEl.getComputedTextLength() * 5.5 + 260  // 周长近似，冗余量保证画满
        textEl.style.strokeDasharray = String(len)
        textEl.style.strokeDashoffset = String(len)
        textEl.style.opacity = '1'
        const anim = animate(textEl, {
          strokeDashoffset: [len, 0],
          duration: 1500,
          delay: 250,
          ease: 'inOutQuad',
        })
        const chain = (anim && typeof anim.then === 'function') ? anim.then.bind(anim) : null
        if (chain) chain(tail)
        else phaseTimers.push(setTimeout(tail, 2100))
      } catch (err) {
        console.warn('[WelcomeHello] 描边动画失败，降级静态', err)
        textEl.style.strokeDasharray = 'none'
        textEl.style.opacity = '1'
        tail()
      }
    }
    return () => {
      cancelled = true
      root.removeEventListener('click', skip)
      window.removeEventListener('keydown', keySkip)
      phaseTimers.forEach(clearTimeout)
    }
  }, [fontReady, fontFailed])

  const helloNode = fontFailed
    ? <div className="welcome-hello-css">hello</div>
    : (
      <svg viewBox="0 0 300 130" className="welcome-hello-svg" aria-label="hello">
        <text ref={textRef} x="150" y="92" textAnchor="middle" className="welcome-hello-text"
          style={{ opacity: 0 }}>hello</text>
      </svg>
    )

  return (
    <div ref={rootRef} className={`welcome-overlay ${phase === 'fade' ? 'welcome-fade' : ''}`} role="dialog" aria-label="欢迎">
      <div className="welcome-inner">
        <div className="welcome-hello-wrap">{helloNode}</div>
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
