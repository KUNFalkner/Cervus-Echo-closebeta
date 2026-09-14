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
        // v6「Apple 式一笔写」：按字母接力描边，不是五支笔同时描。
        // 原理：SVG <text> 整词一条 dash 动画时，浏览器把每个字母轮廓同时描
        // （等效五个字母各一支笔齐写 = 站长说的"好几个笔各自写一个字母"）。
        // 改成逐字母 <text> 元素（h→e→l→l→o），每个字母独立 dash 动画，
        // 后一个字母在前一个写到 ~65% 时起笔（接力重叠，像连续手写）。
        // 时长 2.6s（原 1.5s 站长说"急促"），ease-in-out 有起笔收笔的呼吸感。
        // 卡顿根因：drop-shadow 光晕滤镜每帧全字重绘——描边期间挂在父级、
        // 写完最后一笔才加到整词（视觉上光晕随最后一笔点亮，反而更有"点睛"感）。
        const letters = Array.from(textEl.querySelectorAll('tspan'))
        if (!letters.length || !textEl.animate) throw new Error('no tspans/WAAPI')
        const seq = []
        for (const ch of letters) {
          const w = ch.getComputedTextLength()
          const dash = w * 5.5 + 80  // 周长近似 + 冗余，保证描满
          ch.style.strokeDasharray = String(dash)
          ch.style.strokeDashoffset = String(dash)
          ch.style.opacity = '1'
          seq.push({ el: ch, dash })
        }
        const svgRoot = textEl.closest('svg')
        const total = 2600           // 全词总时长
        const overlap = 0.65         // 接力点：前一个字母完成 65% 时下一个起笔
        const n = seq.length
        // 每字母时长 = 总时长 / (1 + (n-1)*overlap)，保证最后一个字母恰好收尾
        const per = total / (1 + (n - 1) * overlap)
        seq.forEach((s, i) => {
          const start = i * per * overlap
          const wa = s.el.animate(
            [{ strokeDashoffset: String(s.dash) }, { strokeDashoffset: '0' }],
            { duration: per, delay: start, easing: 'ease-in-out', fill: 'forwards' }
          )
          wa.commitStyles?.()
        })
        // 最后一笔落定 → 点亮光晕 + 推进后续阶段
        phaseTimers.push(setTimeout(() => { svgRoot && svgRoot.classList.add('hello-glow') }, total + 80))
        phaseTimers.push(setTimeout(tail, total + 120))
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
        {/* v6：逐字母 tspan —— 每个字母独立描边动画，按序接力（Apple 式一笔写） */}
        <text ref={textRef} x="150" y="92" textAnchor="middle" className="welcome-hello-text"
          style={{ opacity: 0 }}>
          {'hello'.split('').map((c, i) => <tspan key={i}>{c}</tspan>)}
        </text>
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
