import { useRef, useEffect, useState, useCallback } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

/**
 * CommunityStory v2 —— 「树洞手记」（Sketchbook 手感 × 午夜蓝+沙金）
 *
 * 相比 v1（用户反馈：像 PPT）的核心区别——
 *  1. 纸页实体化：五块版画是**叠放的纸页**（错位旋转 + 纸张阴影 + 折痕线），
 *     hover 时纸页翘边（rotate3d 微抬），点击翻页（rotateY 翻面看背面注脚）
 *  2. 缩放控件：右下角 +/- 真实缩放整叠纸（transform scale，范围 0.7~1.3）
 *  3. 顶栏印章式排版（EST. 2025 圆形印章 + 双语刊头），不再是居中大标题
 * 放大镜按用户要求移除。
 */
const PLATES = [
  { no: 'I', en: 'THE TREEHOLE', zh: '树洞', text: '匿名表达，自由交流。没有人知道你是谁，但每一句真话都会被接住。', note: '落成于 2025 · 匿名树洞' },
  { no: 'II', en: 'BURN AFTER READING', zh: '阅后即焚', text: '秘密值得被守护。消息以密文落库，读完即焚，三十天后连灰烬都不剩。', note: '三种焚毁模式 · 密文存储' },
  { no: 'III', en: 'SMALL CIRCLES', zh: '小圈子', text: '自建群聊，上限五十人。熟人的树洞，安静的小客厅，不设陌生人。', note: '群主自治 · 邀请制' },
  { no: 'IV', en: 'THE CARDS', zh: '塔罗与星', text: '在星盘与纸牌之间，给心事一个仪式感的出口。抽一张牌，听它怎么说。', note: '三牌阵 · 凯尔特十字' },
  { no: 'V', en: 'THE PACT', zh: '公约', text: '自由不等于无序。八条公约守护每个人的表达安全，创始人可被问责。', note: '隐私优先 · 透明治理' },
]

export default function CommunityStory({ onBack }) {
  const scopeRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [flipped, setFlipped] = useState([])  // 每页翻面状态

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.from('.cs-head > *', { opacity: 0, y: 20, duration: .7, ease: 'power3.out', stagger: .1 })
    gsap.from('.cs-page', { opacity: 0, y: 40, rotateX: -8, duration: .85, ease: 'power3.out', stagger: .12, delay: .2, clearProps: 'opacity,transform' })
  }, { scope: scopeRef })

  const toggleFlip = (i) => setFlipped(p => { const n = [...p]; n[i] = !n[i]; return n })

  return (
    <div className="cs-page-root" ref={scopeRef}>
      <div className="cs-wash" aria-hidden />

      <header className="cs-top">
        <button className="cs-back" onClick={onBack}>← 返回</button>
        <div className="cs-stamp" aria-hidden>EST<span>2025</span></div>
        <div className="cs-masthead">
          <p className="cs-kicker">THE NOTEBOOK OF CERVUS ECHO</p>
          <h1 className="cs-title">树洞手记</h1>
        </div>
        <div className="cs-zoom">
          <button onClick={() => setZoom(z => Math.max(.7, +(z - .1).toFixed(2)))} aria-label="缩小">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.3, +(z + .1).toFixed(2)))} aria-label="放大">＋</button>
        </div>
      </header>

      <p className="cs-sub">一册关于倾听的手记 —— 翻开每一页，看看声音如何被守护。</p>

      <main className="cs-book" style={{ transform: `scale(${zoom})` }}>
        {PLATES.map((p, i) => {
          const isFlipped = !!flipped[i]
          return (
            <article key={p.no}
              className={`cs-page ${isFlipped ? 'flipped' : ''}`}
              onClick={() => toggleFlip(i)}
              style={{ '--tilt': `${(i % 2 === 0 ? -1 : 1) * (0.5 + i * 0.35)}deg`, '--stack': i }}>
              <div className="cs-page-inner">
                <div className="cs-face cs-front">
                  <div className="cs-crease" aria-hidden />
                  <span className="cs-no">{p.no}</span>
                  <p className="cs-en">{p.en}</p>
                  <h2 className="cs-zh">{p.zh}</h2>
                  <p className="cs-text">{p.text}</p>
                  <span className="cs-flip-hint">点击翻面 ⤷</span>
                </div>
                <div className="cs-face cs-back">
                  <div className="cs-crease" aria-hidden />
                  <p className="cs-note-label">手记注脚</p>
                  <p className="cs-note">{p.note}</p>
                  <span className="cs-no cs-no-back">{p.no}</span>
                  <span className="cs-flip-hint">⤶ 翻回正面</span>
                </div>
              </div>
            </article>
          )
        })}
      </main>

      <footer className="cs-foot">鹿鸣回音 · Cervus Echo — 这本手记会随社区一起生长</footer>
    </div>
  )
}
