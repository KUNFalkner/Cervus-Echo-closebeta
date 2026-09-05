import { useRef, useEffect, useState, useCallback } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

/**
 * CommunityStory —— 「社区故事」页（B 版：ThreeUI Sketchbook 手法 × 鹿鸣回音午夜蓝+沙金）
 *
 * 借鉴 meng-to-sketchbook.html 的三个核心手法（未拷代码，按 skill 规范重写）：
 *  1. 纸感底 + 编目索引排版（plate / figure / catalogue 编号体系）
 *  2. 可拖动放大镜（lens follow pointer，露出局部放大层）
 *  3. 分版块进场 stagger（GSAP scope 管理）
 * 配色全部走主题变量（午夜蓝底 + 沙金），字体沿用主题衬线。
 */
const PLATES = [
  {
    no: 'I', en: 'THE TREEHOLE', zh: '树洞',
    text: '匿名表达，自由交流。没有人知道你是谁，但每一句真话都会被接住。',
    meta: '落成于 2025 · 36 篇帖子',
  },
  {
    no: 'II', en: 'BURN AFTER READING', zh: '阅后即焚',
    text: '秘密值得被守护。消息以密文落库，读完即焚，30 天后连灰烬都不剩。',
    meta: '三种焚毁模式 · 端到端加密',
  },
  {
    no: 'III', en: 'SMALL CIRCLES', zh: '小圈子',
    text: '自建群聊，上限五十人。熟人的树洞，安静的小客厅，不设陌生人。',
    meta: '群主自治 · 成员邀请制',
  },
  {
    no: 'IV', en: 'THE CARDS', zh: '塔罗与星',
    text: '在星盘与纸牌之间，给心事一个仪式感的出口。抽一张牌，听它怎么说。',
    meta: '三牌阵 · 凯尔特十字',
  },
  {
    no: 'V', en: 'THE PACT', zh: '公约',
    text: '自由不等于无序。八条公约守护每个人的表达安全，创始人可被问责。',
    meta: '隐私优先 · 透明治理',
  },
]

export default function CommunityStory({ onBack }) {
  const scopeRef = useRef(null)
  const lensRef = useRef(null)
  const plateRefs = useRef([])
  const [lensOn, setLensOn] = useState(false)
  const [active, setActive] = useState(-1)

  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    gsap.from('.story-head > *', { opacity: 0, y: 22, duration: .7, ease: 'power3.out', stagger: .12 })
    gsap.from('.story-plate', { opacity: 0, y: 34, duration: .8, ease: 'power3.out', stagger: .14, delay: .25, clearProps: 'opacity,transform' })
  }, { scope: scopeRef })

  // 放大镜：跟随指针（requestAnimationFrame 节流），hover 纸面时出现
  const onMove = useCallback((e) => {
    if (!lensOn) return
    const lens = lensRef.current
    if (!lens) return
    const x = e.clientX, y = e.clientY
    lens.style.transform = `translate(${x - 90}px, ${y - 90}px)`
  }, [lensOn])

  const toggleLens = () => setLensOn(v => !v)

  return (
    <div className="story-page" ref={scopeRef} onMouseMove={onMove}>
      {/* 星尘纸纹底 */}
      <div className="story-wash" aria-hidden />

      {/* 顶栏 */}
      <header className="story-top">
        <button className="story-back" onClick={onBack}>← 返回社区</button>
        <span className="story-brand">鹿鸣回音 · 社区故事</span>
        <button className={`story-lens-btn ${lensOn ? 'on' : ''}`} onClick={toggleLens}
          title="放大镜（拖到纸面上看细节）">🔍 放大镜 {lensOn ? '开' : '关'}</button>
      </header>

      {/* 首屏 */}
      <section className="story-head">
        <p className="story-kicker">EST. 2025 · AN ANONYMOUS COMMON</p>
        <h1 className="story-title">树洞手记</h1>
        <p className="story-sub">一部关于倾听的社区画册——五块版画，五种被守护的声音。</p>
      </section>

      {/* 编目索引 */}
      <nav className="story-index" aria-label="版画目录">
        {PLATES.map((p, i) => (
          <button key={p.no}
            className={`story-idx-item ${active === i ? 'on' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => plateRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <span className="story-idx-no">{p.no}</span>
            <span className="story-idx-zh">{p.zh}</span>
            <span className="story-idx-en">{p.en}</span>
          </button>
        ))}
      </nav>

      {/* 五块版画 */}
      <main className="story-plates">
        {PLATES.map((p, i) => (
          <article key={p.no} ref={el => plateRefs.current[i] = el}
            className={`story-plate ${active === i ? 'on' : ''}`}>
            <div className="story-plate-no">{p.no}</div>
            <div className="story-plate-body">
              <p className="story-plate-en">{p.en}</p>
              <h2 className="story-plate-zh">{p.zh}</h2>
              <p className="story-plate-text">{p.text}</p>
              <p className="story-plate-meta">{p.meta}</p>
            </div>
          </article>
        ))}
      </main>

      <footer className="story-foot">
        <span>鹿鸣回音 · Cervus Echo — 这本手记会随社区一起生长</span>
      </footer>

      {/* 放大镜层 */}
      {lensOn && <div className="story-lens" ref={lensRef} aria-hidden>
        <div className="story-lens-inner" />
      </div>}
    </div>
  )
}
