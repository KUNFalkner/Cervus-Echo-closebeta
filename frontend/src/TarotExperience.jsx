import React, { useRef, useState, useEffect } from 'react'
import gsap from 'gsap'
import { animate, createScope } from 'animejs'
import { TAROT_DECK, TAROT_POSITIONS, ELEMENT_THEME } from './tarotData'
import { useToast } from './ToastContext'
import TarotBack from './TarotBack'

// 牌面图：纯函数映射，与 scripts/convert_tarot.py 输出名一致
const faceSrc = (c) => `/tarot/${c.suit}-${String(c.num).padStart(2, '0')}.webp`

const GOLD = '#e3c478'
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 塔罗占卜核心体验：可独立挂载，也可被 TarotOverlay 包裹为全屏模式。
// 「过去 · 现在 · 未来」三张时间牌阵，每日一抽（localStorage 持久化）。
const TarotExperience = () => {
  const toast = useToast()
  const pageRef = useRef(null)
  const scopeRef = useRef(null)
  const deckRef = useRef(null)
  const todayKey = 'treehole_tarot_' + new Date().toISOString().slice(0, 10)
  const [drawn, setDrawn] = useState(() => {
    try { return JSON.parse(localStorage.getItem(todayKey) || 'null') } catch { return null }
  })
  const [revealed, setRevealed] = useState(() => drawn ? [true, true, true] : [false, false, false])
  const [openIdx, setOpenIdx] = useState(-1)
  const [shuffling, setShuffling] = useState(false)
  const freshRef = useRef(false)
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null)
  const cardRefs = [r0, r1, r2]

  const themeOf = (card) => ELEMENT_THEME[card.arcana === 'major' ? 'major' : card.suit]

  // 环境动画（anime.js）：中央法阵缓慢旋转 + 洗牌星盘旋转
  useEffect(() => {
    const root = pageRef.current
    if (!root) return
    scopeRef.current = createScope({ root })
    const anims = []
    if (!reduceMotion()) {
      const sigil = root.querySelector('.tarot-sigil')
      if (sigil) anims.push(animate(sigil, { rotate: 360, duration: 120000, loop: true, ease: 'linear' }))
      root.querySelectorAll('.tarot-constellation').forEach((c, idx) =>
        anims.push(animate(c, { rotate: idx % 2 ? -360 : 360, duration: 160000, loop: true, ease: 'linear' })))
    }
    return () => { anims.forEach(a => a.cancel && a.cancel()); scopeRef.current && scopeRef.current.revert() }
  }, [])

  // 洗牌星盘旋转（GSAP）
  useEffect(() => {
    if (shuffling && deckRef.current && !reduceMotion()) {
      const t = gsap.to(deckRef.current, { rotation: 360, duration: 1.1, repeat: -1, ease: 'none', transformOrigin: '50% 50%' })
      return () => t.kill()
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
  const dealCards = () => {
    if (reduceMotion()) return
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.62
    const tl = gsap.timeline({ defaults: { ease: 'expo.out', force3D: true } })
    cardRefs.forEach((r, i) => {
      const el = r.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x0 = cx - (rect.left + rect.width / 2)
      const y0 = cy - (rect.top + rect.height / 2)
      // 每张牌初始旋转不同，飞行中自然摆正
      const rotStart = gsap.utils.random(-50, 50)
      gsap.set(el, { x: x0, y: y0, scale: 0.25, rotation: rotStart, autoAlpha: 0, transformOrigin: '50% 50%' })
      // 微随机化：起始延迟 ±0.08s，时长 ±0.12s，让节奏像"手洗牌"而非机器
      const at = i * 0.22 + gsap.utils.random(-0.06, 0.06)
      const dur = 1.0 + gsap.utils.random(-0.12, 0.12)
      // 主飞入：expo.out 平滑减速 + 微摆动
      tl.to(el, { x: 0, y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: dur }, at)
      // 飞行中途加轻微摇摆（模拟空气阻力/手部抖动的有机感）
      tl.to(el, { rotation: gsap.utils.random(-3, 3), duration: 0.15, ease: 'sine.inOut', yoyo: true, repeat: 1 }, at + dur * 0.35)
      // 彗星尾迹（轻量，不与卡牌抢主线程）
      tl.add(() => spawnComet(el, x0, y0), at)
    })
  }

  const draw = () => {
    if (shuffling) return
    setShuffling(true)
    freshRef.current = true
    setTimeout(() => {
      const deck = [...TAROT_DECK]
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
      const picks = deck.slice(0, 3).map(c => ({ ...c, reversed: Math.random() < 0.5 }))
      setDrawn(picks); setRevealed([false, false, false]); setOpenIdx(-1); setShuffling(false)
      try { localStorage.setItem(todayKey, JSON.stringify(picks)) } catch {}
      setTimeout(() => dealCards(), 70)
    }, 760)
  }

  const flip = (i) => {
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
  }

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

  return (
    <div className="tarot-page tarot-mystic" ref={pageRef}>
      <div className="tarot-hero">
        {/* 背景法阵 + 四角星图（填充大屏留白） */}
        <svg className="tarot-sigil" viewBox="0 0 200 200" aria-hidden>
          <g fill="none" stroke={GOLD} strokeWidth="0.8" opacity="0.9">
            <circle cx="100" cy="100" r="92" /><circle cx="100" cy="100" r="74" /><circle cx="100" cy="100" r="52" />
            <path d="M100 8 L108 92 L192 100 L108 108 L100 192 L92 108 L8 100 L92 92 Z" />
            <path d="M100 8 L108 92 L192 100 L108 108 L100 192 L92 108 L8 100 L92 92 Z" transform="rotate(45 100 100)" />
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i / 12) * Math.PI * 2
              return <line key={i} x1={100 + Math.cos(a) * 52} y1={100 + Math.sin(a) * 52} x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92} />
            })}
          </g>
        </svg>
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
        <h2>塔罗占卜</h2>
        <div className="tarot-rule" />
        <p className="tarot-sub">静心凝神，想着此刻盘桓于心的疑问——为「过去 · 现在 · 未来」各引一张星牌。</p>

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
              今日牌阵：{drawn.map((c, i) => `${TAROT_POSITIONS[i]}·${c.name}${c.reversed ? '(逆)' : ''}`).join('　')}
            </div>
            {guidance && <div className="tarot-guidance">{guidance}</div>}
            <div className="tarot-hint">点击卡牌翻面 · 再点「展开详情」查看英文释义与爱情 / 事业 / 情绪 / 灵性参考</div>
            <button className="tarot-redraw" onClick={() => { localStorage.removeItem(todayKey); setDrawn(null); setRevealed([false, false, false]); setOpenIdx(-1); toast.success('已重新洗牌') }}>重新洗牌</button>
          </>}

        <p className="tarot-foot">✦ 星图已亮，静待你心之所问 ✦</p>
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
    </div>
  )
}

export default TarotExperience
