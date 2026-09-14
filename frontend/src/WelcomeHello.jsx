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
  const pathRef = useRef(null)
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
    const textEl = pathRef.current
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
        // v7「真·一笔写」：手工连笔 path，整条 dash 动画从 0 到 100%。
        // 一条 path = 一支笔，数学上保证"一笔写出"，没有"每字母各一支笔"。
        // 时长 2.8s + ease-in-out（起笔收笔呼吸感）；drop-shadow 仍在描边期间
        // 摘除（每帧重绘卡顿），写完 .hello-glow 点亮。
        const total = 2800
        textEl.style.strokeDasharray = 'none'
        const len = textEl.getTotalLength()
        textEl.style.strokeDasharray = String(len)
        textEl.style.strokeDashoffset = String(len)
        textEl.style.opacity = '1'
        const svgRoot = textEl.closest('svg')
        const wa = textEl.animate(
          [{ strokeDashoffset: String(len) }, { strokeDashoffset: '0' }],
          { duration: total, delay: 150, easing: 'ease-in-out', fill: 'forwards' }
        )
        wa.commitStyles?.()
        // 最后一笔落定 → 光晕点亮 + 推进阶段（定时器兜底，动画异常也能走到 onDone）
        phaseTimers.push(setTimeout(() => { svgRoot && svgRoot.classList.add('hello-glow') }, total + 200))
        phaseTimers.push(setTimeout(tail, total + 260))
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
        {/* v7「真·一笔写」：手工连笔 path——h-e-l-l-o 五个字母一条贝塞尔曲线，
            数学上就是一条 path，dash 动画从 0% 跑到 100% 就是「一笔写出」，
            不存在"每个字母各一支笔"。电脑/手机同一条 path 同一份代码，天然一致。
            路径数据按 300x130 视框手调：起笔 h 竖→拱→连 e 圈→两道 l 环→收尾 o 圈，
            单线圆滑（stroke-linecap:round 加持），Caveat 字体只用于下方欢迎语。 */}
        <path ref={pathRef} d="M 38 96
              C 36 64, 34 44, 33 30
              C 33 24, 38 22, 40 28
              C 42 34, 42 58, 44 74
              C 45 84, 48 88, 54 86
              C 62 84, 66 76, 64 68
              C 62 62, 54 62, 50 68
              C 45 76, 47 88, 58 88
              C 64 88, 69 84, 73 76
              C 76 70, 80 46, 82 34
              C 83 28, 88 26, 90 32
              C 92 38, 90 62, 92 76
              C 93 84, 96 88, 102 86
              C 108 84, 112 78, 111 72
              C 110 66, 103 66, 100 72
              C 96 80, 99 90, 109 89
              C 115 88, 119 82, 121 74
              C 123 66, 125 48, 126 36
              C 127 30, 132 28, 134 34
              C 136 40, 134 62, 136 76
              C 137 84, 141 88, 147 86
              C 153 84, 157 78, 156 72
              C 155 66, 148 66, 145 72
              C 141 80, 144 90, 154 89
              C 160 88, 164 82, 166 74
              C 168 66, 170 48, 171 36
              C 172 30, 177 28, 179 34
              C 181 40, 179 62, 181 76
              C 182 84, 186 88, 192 86
              C 200 84, 205 76, 204 68
              C 203 62, 195 62, 191 68
              C 186 76, 188 88, 200 89
              C 210 90, 218 84, 222 74
              C 226 64, 232 58, 240 58
              C 250 58, 256 66, 254 76
              C 252 86, 242 92, 234 88
              C 228 85, 228 76, 234 72"
          fill="none" stroke="currentColor" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round" opacity="0" />
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
