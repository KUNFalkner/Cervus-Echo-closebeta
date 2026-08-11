import React, { useCallback, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { TAROT_DECK, TAROT_POSITIONS, ELEMENT_THEME } from './tarotData'
import { useToast } from './ToastContext'
import TarotBack from './TarotBack'

// 牌面图：纯函数映射，无需查表（与 scripts/convert_tarot.py 输出名一致）
const faceSrc = (c) => `/tarot/${c.suit}-${String(c.num).padStart(2, '0')}.webp`

// 塔罗占卜核心体验：可独立挂载，也可被 TarotOverlay 包裹为全屏沉浸模式。
// 「过去 · 现在 · 未来」三张时间牌阵，每日一抽（localStorage 持久化）。
const TarotExperience = () => {
  const toast = useToast()
  const todayKey = 'treehole_tarot_' + new Date().toISOString().slice(0, 10)
  const [drawn, setDrawn] = useState(() => {
    try { return JSON.parse(localStorage.getItem(todayKey) || 'null') } catch { return null }
  })
  const [revealed, setRevealed] = useState(() => drawn ? [true, true, true] : [false, false, false])
  const [openIdx, setOpenIdx] = useState(-1)
  const [shuffling, setShuffling] = useState(false)
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null)
  const cardRefs = [r0, r1, r2]
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const themeOf = (card) => ELEMENT_THEME[card.arcana === 'major' ? 'major' : card.suit]
  const stars = useMemo(() => Array.from({ length: 46 }, () => ({
    top: Math.random() * 100, left: Math.random() * 100,
    size: Math.random() * 2 + 1, dur: 2 + Math.random() * 3, delay: Math.random() * 3
  })), [])

  const draw = () => {
    if (shuffling) return
    setShuffling(true)
    setTimeout(() => {
      const deck = [...TAROT_DECK]
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
      const picks = deck.slice(0, 3).map(c => ({ ...c, reversed: Math.random() < 0.5 }))
      setDrawn(picks); setRevealed([false, false, false]); setOpenIdx(-1); setShuffling(false)
      try { localStorage.setItem(todayKey, JSON.stringify(picks)) } catch {}
      setTimeout(() => {
        if (reduce()) return
        cardRefs.forEach((r, i) => {
          if (!r.current) return
          gsap.from(r.current, { opacity: 0, scale: .4, y: -170, rotation: -12, duration: .6, delay: i * .14, ease: 'back.out(1.6)', clearProps: 'opacity,transform' })
          const edge = (getComputedStyle(r.current).getPropertyValue('--edge') || '#fff').trim()
          spawnTrail(r.current, edge)
        })
      }, 30)
    }, 560)
  }

  const spawnBurst = (el, color) => {
    if (!el || reduce()) return
    const n = 14
    for (let k = 0; k < n; k++) {
      const p = document.createElement('span')
      p.className = 'tarot-spark'
      if (color) { p.style.background = color; p.style.boxShadow = '0 0 8px ' + color }
      el.appendChild(p)
      const ang = (Math.PI * 2 * k) / n + Math.random() * .5
      const dist = 36 + Math.random() * 54
      gsap.fromTo(p, { x: 0, y: 0, scale: .3, opacity: 1 },
        { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, scale: 0, opacity: 0, duration: .7 + Math.random() * .4, ease: 'power2.out', onComplete: () => p.remove() })
    }
  }

  const spawnTrail = (el, color) => {
    if (!el || reduce()) return
    for (let k = 0; k < 10; k++) {
      const p = document.createElement('span')
      p.className = 'tarot-trail'
      if (color) { p.style.background = color; p.style.boxShadow = '0 0 8px ' + color }
      p.style.left = (18 + Math.random() * 64) + '%'
      p.style.top = (58 + Math.random() * 32) + '%'
      el.appendChild(p)
      gsap.fromTo(p, { y: 0, opacity: 0, scale: .6 },
        { y: -38 - Math.random() * 46, opacity: 1, duration: .5, delay: Math.random() * .55, ease: 'power1.out',
          onComplete: () => gsap.to(p, { opacity: 0, duration: .5, onComplete: () => p.remove() }) })
    }
  }

  const flip = (i) => {
    if (!drawn) return
    if (!revealed[i]) {
      setRevealed(p => { const n = [...p]; n[i] = true; return n })
      if (cardRefs[i].current) {
        if (!reduce()) gsap.fromTo(cardRefs[i].current, { scale: .9 }, { scale: 1, duration: .45, ease: 'back.out(2)' })
        const edge = (getComputedStyle(cardRefs[i].current).getPropertyValue('--edge') || '#fff').trim()
        spawnBurst(cardRefs[i].current, edge)
      }
    } else {
      setOpenIdx(openIdx === i ? -1 : i)
    }
  }

  const guidance = !drawn ? '' : (() => {
    const rev = drawn.filter(c => c.reversed).length
    const now = drawn[1]
    const head = rev === 0 ? '三牌皆正位，气运通透——' : rev === 3 ? '三牌皆逆位，宜守不宜攻——' : rev === 1 ? '一牌轻逆，留意暗流——' : '两牌逆位，先安内再向外——'
    const tail = now.reversed
      ? `当下「${now.name}」逆位，缓步而行、回头看看被忽略的线索。`
      : `当下「${now.name}」正位，顺势而为、把握眼前机缘。`
    return head + tail
  })()

  return (
    <div className="tarot-page">
      <div className="tarot-stars" aria-hidden>
        {stars.map((s, k) => <i key={k} style={{ top: s.top + '%', left: s.left + '%', width: s.size + 'px', height: s.size + 'px', animationDuration: s.dur + 's', animationDelay: s.delay + 's' }} />)}
      </div>
      <div className="glass-card tarot-hero">
        <h2>🔮 塔罗占卜</h2>
        <p className="tarot-sub">静下心，想着你此刻的疑问——为「过去 · 现在 · 未来」各抽一张牌。</p>
        {!drawn
          ? <button className="glass-button btn-primary tarot-start" onClick={draw} disabled={shuffling}>
              {shuffling ? <span className="tarot-shuffle"><span className="dot" /> 洗牌中…</span> : '开始抽牌'}
            </button>
          : <>
            <div className="tarot-spread">
              {drawn.map((card, i) => {
                const th = themeOf(card)
                return (
                  <div className="tarot-col" key={i}>
                    <div className="tarot-pos">{TAROT_POSITIONS[i]}</div>
                    <div
                      className={`tarot-card ${revealed[i] ? 'flipped' : ''} ${card.reversed ? 'is-rev' : ''}`}
                      style={{ '--glow': th.glow, '--edge': th.color }}
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
            {openIdx >= 0 && revealed[openIdx] && drawn[openIdx] && (() => {
              const c = drawn[openIdx]
              const th = themeOf(c)
              return <div className="tarot-detail" style={{ '--edge': th.color }}>
                <div className="tarot-detail-head">
                  <span className="tarot-detail-pos">{TAROT_POSITIONS[openIdx]}</span>
                  <b>{c.icon} {c.name}</b>
                  <span className="tarot-detail-en">{c.en}</span>
                  <span className={`tarot-ori ${c.reversed ? 'rev' : ''}`}>{c.reversed ? '逆位' : '正位'}</span>
                  <button className="tarot-detail-close" onClick={() => setOpenIdx(-1)} aria-label="收起">×</button>
                </div>
                <div className="tarot-detail-row"><b>关键词</b><span>{(c.reversed ? c.keywordsRev : c.keywordsUp).join(' · ')}</span></div>
                <div className="tarot-detail-row"><b>英文释义</b><span>{c.reversed ? c.meaningRev : c.meaningUp}</span></div>
                <div className="tarot-detail-row"><b>💗 爱情</b><span>{c.love}</span></div>
                <div className="tarot-detail-row"><b>💼 事业</b><span>{c.career}</span></div>
                <div className="tarot-detail-row"><b>🌤 情绪</b><span>{c.mood}</span></div>
                <div className="tarot-detail-row"><b>✨ 灵性</b><span>{c.spiritual}</span></div>
                <div className="tarot-detail-row"><b>星象</b><span>{[c.element, c.planet, c.zodiac].filter(Boolean).join(' · ')}</span></div>
                <div className="tarot-detail-row"><b>是非占</b><span>{c.reversed ? c.yesNoRev : c.yesNo}</span></div>
              </div>
            })()}
            <div className="tarot-summary">
              今日牌阵：{drawn.map((c, i) => `${TAROT_POSITIONS[i]}·${c.name}${c.reversed ? '(逆)' : ''}`).join('　')}
            </div>
            {guidance && <div className="tarot-guidance">✦ {guidance}</div>}
            <div className="tarot-hint">点击卡牌翻面 · 再点「展开详情」查看英文释义与爱情 / 事业 / 情绪 / 灵性参考</div>
            <button className="glass-button tarot-redraw" onClick={() => { localStorage.removeItem(todayKey); setDrawn(null); setRevealed([false, false, false]); setOpenIdx(-1); toast.success('已重新洗牌') }}>重新洗牌</button>
          </>}
      </div>
    </div>
  )
}

export default TarotExperience
