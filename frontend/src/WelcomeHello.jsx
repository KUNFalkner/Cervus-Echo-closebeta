import { useState, useEffect, useRef } from 'react'
import { animate } from 'animejs'

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

  // 等 Caveat 真字体加载（3s 超时降级）。
  // 注意 fonts.load 对多 unicode-range 子集：任一子集网络失败会整体 reject，
  // 但**已加载成功的子集仍可用**（latin 子集就够画 "hello"）——所以 reject 不算失败，
  // 只要 check() 探测到可用字形即视为就绪；两者皆无才降级。
  useEffect(() => {
    let dead = false
    const settle = (ok) => { if (!dead) { clearTimeout(t); ok ? setFontReady(true) : setFontFailed(true) } }
    const t = setTimeout(() => {
      // 兜底：再探一次，可用就绪，否则降级
      try { document.fonts.check('700 20px Caveat') ? setFontReady(true) : setFontFailed(true) } catch { setFontFailed(true) }
    }, 3000)
    if (document.fonts && document.fonts.load) {
      // 带采样文本 'hello'：FontFaceSet.load 只下载该文本命中的子集（latin），
      // 不会再被 cyrillic 等无关子集的网络失败连坐
      document.fonts.load('700 100px Caveat', 'hello').then((faces) => {
        settle(faces && faces.length > 0)
      }).catch(() => {
        if (dead) return
        try { document.fonts.check('700 20px Caveat') ? settle(true) : settle(false) } catch { settle(false) }
      })
    } else {
      settle(false)
    }
    return () => { dead = true; clearTimeout(t) }
  }, [])

  // 主动画序列：等字体+量长度 → 描边 → 昵称 → 品牌落款 → 淡出 → onDone
  useEffect(() => {
    // 降级渲染（字体不可用）：静态成品 → 短暂停留 → 淡出 → onDone。
    // 绝不能 return 了事 —— 否则 onDone 永不触发，遮罩关不掉，用户被锁死在欢迎层。
    if (fontFailed) {
      const timers = [
        setTimeout(() => setPhase('name'), 300),
        setTimeout(() => setPhase('brand'), 900),
        setTimeout(() => setPhase('fade'), 2000),
        setTimeout(() => doneRef.current && doneRef.current(), 2700),
      ]
      const root = rootRef.current
      const skip = () => { timers.forEach(clearTimeout); doneRef.current && doneRef.current() }
      root && root.addEventListener('click', skip)
      return () => { timers.forEach(clearTimeout); root && root.removeEventListener('click', skip) }
    }
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
