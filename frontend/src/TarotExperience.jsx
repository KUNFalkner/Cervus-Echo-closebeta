import React, { useRef, useState, useEffect } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { animate, createScope } from 'animejs'
gsap.registerPlugin(useGSAP)
import { TAROT_DECK, TAROT_POSITIONS, ELEMENT_THEME } from './tarotData'
import { useToast } from './ToastContext'
import TarotBack from './TarotBack'

// 牌面图：纯函数映射，与 scripts/convert_tarot.py 输出名一致
const faceSrc = (c) => `/tarot/${c.suit}-${String(c.num).padStart(2, '0')}.webp`

const GOLD = '#e3c478'
// 与 App.jsx 一致的 API 基址：dev 直连 8000，生产走同源 /api（经 nginx 反代）
const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : '/api'
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── 抽牌历史（localStorage 多日留存，每日一条，最多 30 条）──
const HISTORY_KEY = 'treehole_tarot_history_v1'
// 只接受结构完整的 entry；旧版本/损坏的历史可能缺 cards 等字段，
// 直接进 state 会在历史面板 h.cards.map 时抛错、导致整页历史打不开（表现为「抽了却不记录」）
const validEntry = (e) => !!e && typeof e === 'object' && typeof e.date === 'string' && Array.isArray(e.cards)
const loadHistory = () => {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(v)) return []
    const good = v.filter(validEntry)
    if (good.length !== v.length) console.warn('[tarot] 已过滤', v.length - good.length, '条结构损坏的历史记录')
    return good
  } catch { return [] }
}
const persistHistory = (list) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)) } catch {} }
// 跨端同步：把当日一抽推到服务器（本地 localStorage 仍作离线缓存）。无 token 时静默跳过。
const pushHistory = async (entry) => {
  try {
    const t = localStorage.getItem('token')
    if (!t) return
    await fetch(`${API_BASE}/tarot/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify(entry),
    })
  } catch {}
}
// 跨端同步：拉取服务器历史，与本地按日期合并，取最新一次写入（ts 大者胜）
const pullHistory = async (setHistory) => {
  try {
    const t = localStorage.getItem('token')
    if (!t) return
    const r = await fetch(`${API_BASE}/tarot/history`, { headers: { 'Authorization': 'Bearer ' + t } })
    if (!r.ok) return
    const server = await r.json()
    if (!Array.isArray(server)) return
    setHistory(prev => {
      const local = Array.isArray(prev) ? prev : []
      const byDate = new Map()
      for (const h of [...local, ...server]) {
        if (!validEntry(h)) continue
        const k = h.date
        const ex = byDate.get(k)
        if (!ex || (h.ts || 0) > (ex.ts || 0)) byDate.set(k, h)
      }
      const merged = [...byDate.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30)
      persistHistory(merged)
      return merged
    })
  } catch {}
}

// 分享图：按字符换行（兼容中英，避免单词截断），measureLines 返回行数、wrapText 实际绘制
const measureLines = (ctx, text, maxW) => {
  let lines = 1, line = ''
  for (const ch of String(text)) {
    const t = line + ch
    if (ctx.measureText(t).width > maxW && line) { lines++; line = ch } else line = t
  }
  return lines
}
const wrapText = (ctx, text, x, y, maxW, lh) => {
  let line = '', yy = y
  for (const ch of String(text)) {
    const t = line + ch
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = ch; yy += lh } else line = t
  }
  if (line) ctx.fillText(line, x, yy)
  return yy + lh
}
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })

// 英雄星盘：开页即居于画面正中、缓缓反向旋转的大星盘，
// 让「点开塔罗即是星盘转动」成为第一观感。三层独立旋转（外环/内星/核心），
// 只用 transform（rotate），不触发任何祖先 transform，故不会降级 position:fixed 背景星盘。
const HeroAstrolabe = () => {
  const wrapRef = useRef(null)
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const coreRef = useRef(null)
  useEffect(() => {
    if (reduceMotion()) return
    const anims = []
    // 开页旋入：星盘从微缩+透明缓入到巡航尺寸，强化「星盘转动」登场仪式感
    if (wrapRef.current) anims.push(animate(wrapRef.current, { scale: [0.82, 1], opacity: [0, 0.6], duration: 900, ease: 'out(3)' }))
    if (outerRef.current) anims.push(animate(outerRef.current, { rotate: 360, duration: 120000, loop: true, ease: 'linear' }))
    if (innerRef.current) anims.push(animate(innerRef.current, { rotate: -360, duration: 88000, loop: true, ease: 'linear' }))
    if (coreRef.current) anims.push(animate(coreRef.current, { rotate: 360, duration: 60000, loop: true, ease: 'linear' }))
    return () => anims.forEach(a => a.cancel && a.cancel())
  }, [])
  return (
    <div className="tarot-hero-astrolabe-wrap" ref={wrapRef} aria-hidden>
      <svg className="tarot-hero-astrolabe" viewBox="0 0 200 200">
        <defs>
          <radialGradient id="heroAstroGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e3c478" stopOpacity="0.20" />
            <stop offset="55%" stopColor="#e3c478" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#e3c478" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="url(#heroAstroGlow)" />
        {/* 外环：时钟式刻度盘，缓转 */}
        <g ref={outerRef} fill="none" stroke={GOLD} strokeWidth="0.7">
          <circle cx="100" cy="100" r="96" /><circle cx="100" cy="100" r="80" /><circle cx="100" cy="100" r="62" />
          <circle cx="100" cy="100" r="40" opacity="0.5" />
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
        {/* 内星：四角星芒 + 环，反向缓转 */}
        <g ref={innerRef} fill="none" stroke={GOLD} strokeWidth="0.6">
          <circle cx="100" cy="100" r="52" opacity="0.7" />
          <path d="M100 16 L105 95 L184 100 L105 105 L100 184 L95 105 L16 100 L95 95 Z" fill={GOLD} fillOpacity="0.85" stroke="none" />
          <path d="M100 16 L105 95 L184 100 L105 105 L100 184 L95 105 L16 100 L95 95 Z" transform="rotate(45 100 100)" fill={GOLD} fillOpacity="0.32" stroke="none" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2
            return <circle key={i} cx={100 + Math.cos(a) * 52} cy={100 + Math.sin(a) * 52} r="1.4" fill={GOLD} stroke="none" />
          })}
        </g>
        {/* 核心：缓慢自转的小光点 + 环 */}
        <g ref={coreRef}>
          <circle cx="100" cy="100" r="11" fill="none" stroke={GOLD} strokeWidth="0.6" opacity="0.5" />
          <circle cx="100" cy="100" r="5.5" fill={GOLD} fillOpacity="0.9" />
        </g>
      </svg>
    </div>
  )
}

// 塔罗占卜核心体验：可独立挂载，也可被 TarotOverlay 包裹为全屏模式。
// 「过去 · 现在 · 未来」三张时间牌阵，每日一抽（localStorage 持久化）。
const TarotExperience = () => {
  const toast = useToast()
  const pageRef = useRef(null)
  const scopeRef = useRef(null)
  const deckRef = useRef(null)
  const deckTweenRef = useRef(null)
  // 用 useGSAP 建立 GSAP 作用域；dealCards/flip 是点击触发的"按需动画"，
  // 用 contextSafe 包裹后，它们会被纳入该作用域，组件卸载时自动 revert，
  // 避免游离补间在已卸载节点上继续跑（GSAP × React 官方推荐模式）。
  const { contextSafe } = useGSAP({ scope: pageRef })
  // 按「本地日期」分日（非 UTC），保证「每日一抽」与用户所在时区一致；
  // 跨端同步也以本地日期合并，避免深夜跨本地日却落在同一 UTC 日导致两次抽牌被合并
  const todayStr = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
  const todayKey = 'treehole_tarot_' + todayStr
  const [drawn, setDrawn] = useState(() => {
    try { return JSON.parse(localStorage.getItem(todayKey) || 'null') } catch { return null }
  })
  const [revealed, setRevealed] = useState(() => drawn ? [true, true, true] : [false, false, false])
  const [openIdx, setOpenIdx] = useState(-1)
  const [shuffling, setShuffling] = useState(false)
  const [question, setQuestion] = useState('')
  const [interpreting, setInterpreting] = useState(false)
  const [counsel, setCounsel] = useState(null) // { text, source }
  const counselRef = useRef(null)
  const freshRef = useRef(false)
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null)
  const cardRefs = [r0, r1, r2]
  // 抽牌历史（多日）：每次每日一抽写入一条，可回看与展开解读
  const [history, setHistory] = useState(() => loadHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [openTs, setOpenTs] = useState(null)

  // 跨端同步：进入塔罗即拉取服务器历史，与本地合并（手机/电脑一致）
  useEffect(() => { pullHistory(setHistory) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const themeOf = (card) => ELEMENT_THEME[card.arcana === 'major' ? 'major' : card.suit]

  // 环境动画（anime.js）：中央法阵缓慢旋转 + 洗牌星盘旋转
  useEffect(() => {
    const root = pageRef.current
    if (!root) return
    scopeRef.current = createScope({ root })
    const anims = []
    if (!reduceMotion()) {
      root.querySelectorAll('.tarot-constellation').forEach((c, idx) =>
        anims.push(animate(c, { rotate: idx % 2 ? -360 : 360, duration: 160000, loop: true, ease: 'linear' })))
    }
    return () => { anims.forEach(a => a.cancel && a.cancel()); scopeRef.current && scopeRef.current.revert() }
  }, [])

  // 洗牌星盘旋转（GSAP）
  useEffect(() => {
    if (shuffling && deckRef.current && !reduceMotion()) {
      const t = gsap.to(deckRef.current, { rotation: 360, duration: 1.1, repeat: -1, ease: 'none', transformOrigin: '50% 50%' })
      deckTweenRef.current = t
      return () => { t.kill(); deckTweenRef.current = null }
    }
  }, [shuffling])

  // 金色彗星：从中央牌库点拖出一条光迹尾随卡牌落位（挂在卡列上，避免卡牌 3D 上下文重绘）
  const spawnComet = (el, x0, y0) => {
    if (!el || reduceMotion()) return
    const host = el.parentNode || el
    const comet = document.createElement('span')
    comet.className = 'tarot-comet'
    host.appendChild(comet)
    // 更柔和的彗尾：用 expo.out 衰减，不突然消失
    gsap.fromTo(comet,
      { x: x0, y: y0, scale: 0.2, autoAlpha: 0 },
      { x: 0, y: 0, scale: 1, autoAlpha: 0.7, duration: 1.1, ease: 'expo.out',
        onComplete: () => gsap.to(comet, { autoAlpha: 0, scale: 1.4, duration: 0.5, ease: 'power2.in', onComplete: () => comet.remove() }) })
  }

  // 金色星屑迸发（anime.js）：落位 / 翻面时的仪式火花（少量、无光晕，避免重绘卡顿）
  const sparkleBurst = (el) => {
    if (!el || reduceMotion()) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    for (let k = 0; k < 8; k++) {
      const p = document.createElement('i')
      p.className = 'tarot-spark-ani'
      p.style.position = 'fixed'
      p.style.left = cx + 'px'
      p.style.top = cy + 'px'
      p.style.background = GOLD
      document.body.appendChild(p)
      const ang = (Math.PI * 2 * k) / 8 + Math.random() * 0.4
      const dist = 30 + Math.random() * 60
      animate(p, {
        translateX: [0, Math.cos(ang) * dist],
        translateY: [0, Math.sin(ang) * dist],
        opacity: [1, 0],
        scale: [0.3, 1],
        duration: 650 + Math.random() * 380,
        ease: 'outExpo',
        onComplete: () => p.remove(),
      })
    }
  }

  // 金色光 sweep：翻面时一道光横扫卡面
  const spawnSweep = (el) => {
    if (!el || reduceMotion()) return
    const face = el.querySelector('.tarot-front')
    if (!face) return
    const sweep = document.createElement('span')
    sweep.className = 'tarot-sweep'
    face.appendChild(sweep)
    gsap.fromTo(sweep,
      { xPercent: -130, autoAlpha: 0 },
      { xPercent: 130, autoAlpha: 0.9, duration: 0.7, ease: 'power1.inOut',
        onComplete: () => gsap.to(sweep, { autoAlpha: 0, duration: 0.25, onComplete: () => sweep.remove() }) })
  }

  // 发牌：三张牌从中央牌库飞向各自位置（GSAP 时间线 + 有机错位 + 柔和彗星尾迹）
  // 设计原则：每张牌略有不同（时长/角度/延迟微随机），避免机器般的整齐划一；
  // 发牌时只出彗星（轻量），翻面时才迸发星屑（隆重），减少同屏 DOM 动画压力。
  const dealCards = contextSafe(() => {
    if (reduceMotion()) return
    // 发牌窗口冻结最吃主线程的星空粒子 + 模糊光晕（见 TarotCanvas / App.css .tarot-dealing），
    // 把算力让给三张牌飞行，消除抽牌卡顿；落位完成后解除。
    document.body.classList.add('tarot-dealing')
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.62
    const tl = gsap.timeline({
      defaults: { ease: 'expo.out', force3D: true },
      onComplete: () => document.body.classList.remove('tarot-dealing'),
    })
    cardRefs.forEach((r, i) => {
      const el = r.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x0 = cx - (rect.left + rect.width / 2)
      const y0 = cy - (rect.top + rect.height / 2)
      // 每张牌初始旋转不同，飞行中自然摆正
      const rotStart = gsap.utils.random(-50, 50)
      gsap.set(el, { x: x0, y: y0, scale: 0.25, rotation: rotStart, autoAlpha: 0, transformOrigin: '50% 50%' })
      // 微随机化：起始延迟 ±0.06s，时长 ±0.12s，让节奏像"手洗牌"而非机器
      const at = i * 0.22 + gsap.utils.random(-0.06, 0.06)
      const dur = 1.0 + gsap.utils.random(-0.12, 0.12)
      // 主飞入：expo.out 平滑减速落位（含自然摆正）。不再叠加独立摇摆补间，
      // 避免它与 rotation 主补间争用同一属性造成跳变/卡顿。
      tl.to(el, { x: 0, y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: dur }, at)
      // 彗星尾迹（轻量，挂在卡列上，不与卡牌抢主线程）
      tl.add(() => spawnComet(el, x0, y0), at)
    })
  })

  const draw = () => {
    if (shuffling) return
    setShuffling(true)
    freshRef.current = true
    setTimeout(() => {
      const finish = () => {
        const deck = [...TAROT_DECK]
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
        const picks = deck.slice(0, 3).map(c => ({ ...c, revMeaning: c.reversed, reversed: Math.random() < 0.5 }))
        setDrawn(picks); setRevealed([false, false, false]); setOpenIdx(-1); setShuffling(false)
        try { localStorage.setItem(todayKey, JSON.stringify(picks)) } catch {}
        // 写入历史：同日更新、否则置顶，最多留 30 条。
        // 注意：副作用（持久化 / 同步）放在 setState 之外，避免更新函数被 React 重复调用导致双写。
        const entry = {
          date: todayStr, ts: Date.now(), question,
          cards: picks.map(c => ({ name: c.name, en: c.en, reversed: c.reversed, suit: c.suit, arcana: c.arcana, num: c.num })),
          counsel: null,
        }
        const next = [entry, ...history.filter(h => h.date !== entry.date)].slice(0, 30)
        setHistory(next)
        persistHistory(next)
        pushHistory(entry)
        try { toast && toast.success('已记录今日抽牌 ✦') } catch {}
        setTimeout(() => dealCards(), 70)
      }
      // 洗牌收束：星盘减速回正 + 容器淡出，再发牌，衔接更顺（不突兀消失）
      if (reduceMotion() || !deckRef.current) { finish(); return }
      if (deckTweenRef.current) deckTweenRef.current.kill()
      gsap.to(deckRef.current, { rotation: '+=160', duration: 0.5, ease: 'power3.out' })
      const cont = deckRef.current.closest('.tarot-deck')
      if (cont) gsap.to(cont, { autoAlpha: 0, duration: 0.4, ease: 'power2.in', onComplete: finish })
      else finish()
    }, 760)
  }

  const flip = contextSafe((i) => {
    if (!drawn) return
    if (!revealed[i]) {
      setRevealed(p => { const n = [...p]; n[i] = true; return n })
      const el = cardRefs[i].current
      if (el && !reduceMotion()) {
        gsap.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' })
        spawnSweep(el)
        sparkleBurst(el)
      }
    } else {
      setOpenIdx(openIdx === i ? -1 : i)
    }
  })

  const guidance = !drawn ? '' : (() => {
    const rev = drawn.filter(c => c.reversed).length
    const now = drawn[1]
    const head = rev === 0 ? '三星皆顺位，命途澄明——'
      : rev === 3 ? '三星皆逆位，宜守宜内省——'
      : rev === 1 ? '一星轻逆，留意暗处的低语——'
      : '两星逆位，先安内而后向外——'
    const tail = now.reversed
      ? `「${now.name}」逆位：放慢脚步，回望那些被略过的微光。`
      : `「${now.name}」顺位：顺势而行，握住眼前的星火。`
    return head + tail
  })()

  // AI 咨询师：把问题 + 三张牌（含正逆位与释义）发到后端，渲染星语解读
  const fetchCounsel = (payload, signal) =>
    fetch(`${API_BASE}/tarot/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }).then((r) => {
      if (!r.ok) throw new Error('status')
      return r.json()
    })

  const askCounsel = async () => {
    if (!drawn || interpreting) return
    setInterpreting(true); setCounsel(null)
    const payload = {
      question,
      focus: 'general',
      cards: drawn.map((c, i) => ({
        position: TAROT_POSITIONS[i],
        name: c.name,
        en: c.en,
        orientation: c.reversed ? 'reversed' : 'upright',
        upright: c.upright,
        reversed: c.reversed ? c.revMeaning : c.upright,
        element: c.element,
        keywordsUp: c.keywordsUp || [],
        keywordsRev: c.keywordsRev || [],
        love: c.love, career: c.career, mood: c.mood, spiritual: c.spiritual,
      })),
    }
    // 单次请求：20s 客户端超时（AbortController），超时即视为模型繁忙
    const runOnce = async () => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20000)
      try {
        return await fetchCounsel(payload, ctrl.signal)
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      let d
      try {
        d = await runOnce()
      } catch (e1) {
        // 首次失败（本地模型繁忙 / 网络抖动）→ 重试一次
        d = await runOnce()
      }
      setCounsel({ text: d.text, source: d.source })
      // 把 AI 解读同步存回当日历史记录；同时把「抽牌后补填」的问题也写回，避免历史里问题丢失
      const today = todayStr
      const next = history.map(h => h.date === today ? { ...h, question: question || h.question, counsel: { text: d.text, source: d.source } } : h)
      setHistory(next)
      persistHistory(next)
      const updated = next.find(h => h.date === today)
      if (updated) pushHistory(updated)
    } catch (e) {
      // 两次皆失败：区分超时（繁忙）与连接错误，给出明确提示
      const busy = e && e.name === 'AbortError'
      toast.error(busy ? '本地模型正忙，请稍后再试 ✦' : '星语暂时沉默，请稍后再试')
    } finally {
      setInterpreting(false)
    }
  }

  // 分享：复制结果文案到剪贴板
  const copyShare = async () => {
    if (!drawn) return
    const date = todayKey.slice(-10)
    const text = [
      `【树洞塔罗 · ${date}】`,
      question ? `疑问：${question}` : '疑问：（未填写，由牌面自语）',
      '',
      drawn.map((c, i) => `${TAROT_POSITIONS[i]}·${c.name}${c.reversed ? '（逆位）' : '（正位）'}`).join('　'),
      '',
      counsel ? counsel.text : '（尚未请 AI 解读，点「✦ AI 解读」获取星语）',
      '',
      '—— 来自 树洞',
    ].join('\n')
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text)
      else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
      toast.success('已复制抽牌结果 ✦')
    } catch { toast.error('复制失败，请手动选择') }
  }

  // 分享：把牌面 + 正逆位 + 解读绘成一张图下载（牌面图加载失败则回退为文字占位）
  const saveShareImage = async () => {
    if (!drawn) return
    const date = todayKey.slice(-10)
    const W = 720, P = 32, gap = 20
    const cardW = Math.floor((W - P * 2 - gap * 2) / 3)
    const cardH = Math.floor(cardW * 1.5)
    const topY = 116
    const nameY = topY + cardH + 28
    const counselText = counsel ? counsel.text : '（尚未请 AI 解读，点「✦ AI 解读」获取星语）'
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.font = '16px sans-serif'
    const counselLines = measureLines(ctx, counselText, W - P * 2)
    const counselTop = nameY + 18
    const H = counselTop + counselLines * 26 + 36
    canvas.width = W; canvas.height = H
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#0c0e22'); bg.addColorStop(1, '#070816')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(227,196,120,.5)'; ctx.lineWidth = 2; ctx.strokeRect(9, 9, W - 18, H - 18)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#e3c478'; ctx.font = '600 30px serif'; ctx.fillText('树洞塔罗', P, 52)
    ctx.fillStyle = 'rgba(227,196,120,.75)'; ctx.font = '15px sans-serif'; ctx.fillText(date, P, 78)
    if (question) { ctx.fillStyle = '#c9c9e6'; ctx.font = '15px sans-serif'; wrapText(ctx, '疑问：' + question, P, 100, W - P * 2, 22) }
    let imgs = []
    try { imgs = await Promise.all(drawn.map(c => loadImg(faceSrc(c)))) } catch {}
    drawn.forEach((c, i) => {
      const x = P + i * (cardW + gap)
      const im = imgs[i]
      if (im) ctx.drawImage(im, x, topY, cardW, cardH)
      else { ctx.fillStyle = 'rgba(227,196,120,.08)'; ctx.fillRect(x, topY, cardW, cardH); ctx.strokeStyle = 'rgba(227,196,120,.4)'; ctx.strokeRect(x, topY, cardW, cardH) }
      ctx.fillStyle = '#e3c478'; ctx.font = '600 16px sans-serif'; ctx.fillText(c.name, x, nameY)
      ctx.fillStyle = c.reversed ? 'rgba(190,110,150,.95)' : 'rgba(227,196,120,.8)'; ctx.font = '13px sans-serif'
      ctx.fillText(c.reversed ? '逆位' : '正位', x, nameY + 18)
    })
    ctx.fillStyle = '#e8e6f0'; ctx.font = '16px sans-serif'; ctx.textAlign = 'left'
    wrapText(ctx, counselText, P, counselTop, W - P * 2, 26)
    canvas.toBlob((blob) => {
      if (!blob) { toast.error('生成图片失败'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `树洞塔罗_${date}.png`; a.click()
      URL.revokeObjectURL(url); toast.success('已保存分享图 ✦')
    }, 'image/png')
  }

  return (
    <div className="tarot-page tarot-mystic" ref={pageRef}>
      <div className="tarot-hero">
        {/* 开页即居中的大星盘：缓缓反向旋转，成为「塔罗即星盘」的第一观感 */}
        <HeroAstrolabe />
        {/* 四角星图（填充大屏留白，固定面板上默认隐藏，仅在嵌入式挂载时可见） */}
        <svg className="tarot-constellation tarot-constellation-tl" viewBox="0 0 120 120" aria-hidden>
          <g stroke={GOLD} strokeWidth="0.6" opacity="0.5" fill={GOLD}>
            <polyline points="10,20 40,50 30,90 70,80" fill="none" />
            <circle cx="10" cy="20" r="1.6" /><circle cx="40" cy="50" r="2.2" /><circle cx="30" cy="90" r="1.4" /><circle cx="70" cy="80" r="1.8" />
          </g>
        </svg>
        <svg className="tarot-constellation tarot-constellation-br" viewBox="0 0 120 120" aria-hidden>
          <g stroke={GOLD} strokeWidth="0.6" opacity="0.5" fill={GOLD}>
            <polyline points="110,100 80,70 92,30 50,40" fill="none" />
            <circle cx="110" cy="100" r="1.6" /><circle cx="80" cy="70" r="2.2" /><circle cx="92" cy="30" r="1.4" /><circle cx="50" cy="40" r="1.8" />
          </g>
        </svg>

        <div className="tarot-ornament">✦ &nbsp; ✧ &nbsp; ✦</div>
        <div className="tarot-title-wrap">
          <span className="tarot-title-star tarot-title-star-l1" aria-hidden>✦</span>
          <span className="tarot-title-star tarot-title-star-l2" aria-hidden>✧</span>
          <span className="tarot-title-star tarot-title-star-r1" aria-hidden>✦</span>
          <span className="tarot-title-star tarot-title-star-r2" aria-hidden>✧</span>
          <h2 className="tarot-gothic-title">tarot divination</h2>
        </div>
        <div className="tarot-rule" />
        {!drawn && (
          <p className="tarot-sub">静心凝神，先在心中默念、或写下此刻盘桓的疑问——为「过去 · 现在 · 未来」各引一张星牌。</p>
        )}
        {/* 问题始终可编辑：抽牌前写下、抽牌后想补问也能改，AI 解读与历史都会带上最新问题 */}
        <div className="tarot-ask-first">
          <input
            className="tarot-question"
            type="text"
            value={question}
            maxLength={200}
            placeholder="把此刻盘桓心头的疑问，轻轻写下…（可留空，由牌面自语）"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        {!drawn
          ? <button className="tarot-start" onClick={draw} disabled={shuffling}>
              {shuffling ? <span className="tarot-shuffle"><span className="dot" /> 星盘流转中…</span> : '开始抽牌'}
            </button>
          : <>
            <div className="tarot-spread-wrap">
              <svg className="tarot-arc" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden>
                <path d="M20 100 Q150 -20 280 100" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.4" />
                <circle cx="20" cy="100" r="2.5" fill={GOLD} opacity="0.6" />
                <circle cx="150" cy="14" r="2.5" fill={GOLD} opacity="0.6" />
                <circle cx="280" cy="100" r="2.5" fill={GOLD} opacity="0.6" />
              </svg>
              <div className="tarot-spread">
                {drawn.map((card, i) => {
                  const th = themeOf(card)
                  return (
                    <div className="tarot-col" key={i}>
                      <div className="tarot-pos">{TAROT_POSITIONS[i]}</div>
                      <div
                        className={`tarot-card ${revealed[i] ? 'flipped' : ''} ${card.reversed ? 'is-rev' : ''}`}
                        style={{ '--edge': th.color }}
                        onClick={() => flip(i)} ref={cardRefs[i]}
                      >
                        <div className="tarot-inner">
                          <div className="tarot-face tarot-back"><TarotBack /></div>
                          <div className="tarot-face tarot-front">
                            <img className="tarot-face-img" src={faceSrc(card)} alt={card.name} loading="lazy" />
                            <span className="tarot-corner">{th.label.split(' ')[0]}</span>
                            <div className="tarot-face-label">
                              <span className="tarot-face-name">{card.name}</span>
                              <span className={`tarot-ori ${card.reversed ? 'rev' : ''}`}>{card.reversed ? '逆位' : '正位'}</span>
                            </div>
                            {revealed[i] && card.reversed && (
                              <svg className="tarot-crack" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden>
                                <polyline points="50,75 42,55 49,40 38,22" />
                                <polyline points="50,75 60,60 56,42 67,27" />
                                <polyline points="50,75 31,80 19,69 8,83" />
                                <polyline points="50,75 69,82 83,73 93,87" />
                                <polyline points="50,75 50,100 44,119 53,141" />
                                <polyline points="50,75 56,99 63,117 58,139" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                      {revealed[i] && <button className="tarot-toggle" onClick={(e) => { e.stopPropagation(); setOpenIdx(openIdx === i ? -1 : i) }}>{openIdx === i ? '收起详情 ▴' : '展开详情 ▾'}</button>}
                    </div>
                  )
                })}
              </div>
            </div>
            {openIdx >= 0 && revealed[openIdx] && drawn[openIdx] && (() => {
              const c = drawn[openIdx]
              const th = themeOf(c)
              return <div className="tarot-detail" style={{ '--edge': th.color }}>
                <div className="tarot-detail-head">
                  <span className="tarot-detail-pos">{TAROT_POSITIONS[openIdx]}</span>
                  <b>{c.name}</b>
                  <span className="tarot-detail-en">{c.en}</span>
                  <span className={`tarot-ori ${c.reversed ? 'rev' : ''}`}>{c.reversed ? '逆位' : '正位'}</span>
                  <button className="tarot-detail-close" onClick={() => setOpenIdx(-1)} aria-label="收起">×</button>
                </div>
                <div className="tarot-detail-row"><b>关键词</b><span>{(c.reversed ? c.keywordsRev : c.keywordsUp).join(' · ')}</span></div>
                <div className="tarot-detail-row"><b>英文释义</b><span>{c.reversed ? c.meaningRev : c.meaningUp}</span></div>
                <div className="tarot-detail-row"><b>爱情</b><span>{c.love}</span></div>
                <div className="tarot-detail-row"><b>事业</b><span>{c.career}</span></div>
                <div className="tarot-detail-row"><b>情绪</b><span>{c.mood}</span></div>
                <div className="tarot-detail-row"><b>灵性</b><span>{c.spiritual}</span></div>
                <div className="tarot-detail-row"><b>星象</b><span>{[c.element, c.planet, c.zodiac].filter(Boolean).join(' · ')}</span></div>
                <div className="tarot-detail-row"><b>是非占</b><span>{c.reversed ? c.yesNoRev : c.yesNo}</span></div>
              </div>
            })()}
            <div className="tarot-summary">
              今日牌阵：{drawn.map((c, i) => `${TAROT_POSITIONS[i]}·${c.name}${c.reversed ? '(逆)' : ''}`).join(' · ')}
            </div>
            {guidance && <div className="tarot-guidance">{guidance}</div>}
            <div className="tarot-hint">点击卡牌翻面 · 再点「展开详情」查看英文释义与爱情 / 事业 / 情绪 / 灵性参考</div>

            {/* AI 咨询师：结合顶部问题 + 牌面，给出星语解读 */}
            <div className="tarot-counselor">
              <div className="tarot-counselor-q">
                <button className="tarot-ask" onClick={askCounsel} disabled={interpreting}>
                  {interpreting ? <span className="tarot-shuffle"><span className="dot" /> 星语汇聚中…</span> : '✦ AI 解读'}
                </button>
              </div>
              {interpreting && (
                <div className="tarot-counsel-skeleton" aria-hidden>
                  <span className="tarot-counsel-sk-line w1" />
                  <span className="tarot-counsel-sk-line w2" />
                  <span className="tarot-counsel-sk-line w3" />
                </div>
              )}
              {counsel && (() => {
                const isLlm = counsel.source === 'llm'
                const title = isLlm ? '星语 · AI 解读'
                  : counsel.source === 'builtin-fallback' ? '星语 · 基础解读'
                  : '星语 · 牌阵自语'
                const note = isLlm ? ''
                  : counsel.source === 'builtin-fallback'
                    ? '（本地模型繁忙，已回退到基础牌阵解读，可稍后再试 AI 解读）'
                    : '（未连接 AI，已为你提供基础牌阵解读）'
                return (
                  <div className={`tarot-counsel tarot-counsel-${counsel.source}`} ref={counselRef}>
                    <div className="tarot-counsel-head">
                      <span className="tarot-counsel-mark">✶</span>
                      <span className="tarot-counsel-title">{title}</span>
                    </div>
                    <p className="tarot-counsel-text">{counsel.text}</p>
                    {note && <p className="tarot-counsel-note">{note}</p>}
                  </div>
                )
              })()}
            </div>

            <button className="tarot-redraw" onClick={() => { localStorage.removeItem(todayKey); setDrawn(null); setRevealed([false, false, false]); setOpenIdx(-1); setCounsel(null); setQuestion(''); toast.success('已重新洗牌') }}>重新洗牌</button>

            {/* 分享：复制结果文案 / 保存为星图 */}
            <div className="tarot-share">
              <button className="tarot-share-btn" onClick={copyShare}>复制结果</button>
              <button className="tarot-share-btn" onClick={saveShareImage}>保存图片</button>
            </div>
          </>}

        <p className="tarot-foot">✦ 星图已亮，静待你心之所问 ✦</p>
        <button className="tarot-history-btn" onClick={() => setShowHistory(true)}>✦ 抽牌历史（{history.length}）</button>
      </div>

      {/* 洗牌星盘 */}
      {shuffling && (
        <div className="tarot-deck" aria-hidden>
          <svg ref={deckRef} className="tarot-deck-star" viewBox="0 0 100 100">
            <g fill="none" stroke={GOLD} strokeWidth="1.4">
              <circle cx="50" cy="50" r="40" /><circle cx="50" cy="50" r="28" />
              <path d="M50 6 L56 44 L94 50 L56 56 L50 94 L44 56 L6 50 L44 44 Z" fill={GOLD} fillOpacity="0.85" stroke="none" />
              <path d="M50 6 L56 44 L94 50 L56 56 L50 94 L44 56 L6 50 L44 44 Z" transform="rotate(45 50 50)" fill={GOLD} fillOpacity="0.4" stroke="none" />
            </g>
          </svg>
          <div className="tarot-deck-ring" />
        </div>
      )}

      {/* 抽牌历史面板：回看过往每日一抽，可展开某次的解读 */}
      {showHistory && (
        <div className="tarot-history-mask" onClick={() => setShowHistory(false)}>
          <div className="tarot-history" onClick={e => e.stopPropagation()}>
            <div className="tarot-history-head">
              <b>抽牌历史</b>
              <button className="tarot-history-x" onClick={() => setShowHistory(false)} aria-label="关闭">×</button>
            </div>
            <div className="tarot-history-list">
              {history.length === 0
                ? <p className="tarot-history-empty">还没有抽牌记录，每次「每日一抽」都会被静静收藏在这里。</p>
                : history.map(h => (
                  <div className="tarot-history-item" key={h.ts}>
                    <div className="tarot-history-meta">
                      <span className="tarot-history-date">{h.date}</span>
                      {h.question && <span className="tarot-history-q">「{h.question}」</span>}
                    </div>
                    <div className="tarot-history-cards">
                      {Array.isArray(h.cards) && h.cards.map((c, i) => (
                        <span className="tarot-history-chip" key={i}>
                          <i className={c.reversed ? 'rev' : ''}>{c.reversed ? '逆' : '正'}</i>
                          {c.name}
                        </span>
                      ))}
                    </div>
                    {h.counsel && (
                      <button className="tarot-history-toggle" onClick={() => setOpenTs(openTs === h.ts ? null : h.ts)}>
                        {openTs === h.ts ? '收起解读 ▴' : '查看解读 ▾'}
                      </button>
                    )}
                    {h.counsel && openTs === h.ts && <p className="tarot-history-counsel">{h.counsel.text}</p>}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TarotExperience
