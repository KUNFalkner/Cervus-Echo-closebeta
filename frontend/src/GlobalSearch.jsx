import { useState, useEffect, useRef, useMemo } from 'react'
import './search.css'

// 自包含请求层：生产同源 /api，JWT 从 localStorage 取（与 App.jsx 保持一致）
const API_BASE = '/api'
async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const tk = localStorage.getItem('token') || ''
  if (tk) headers['Authorization'] = 'Bearer ' + tk
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(API_BASE + path, { ...opts, headers })
}

// 安全高亮：按关键词切分，匹配片段用 <mark> 包裹；全程走 React 文本节点，
// 不使用 dangerouslySetInnerHTML（避免 XSS）。
function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function Highlight({ text, q }) {
  const t = text == null ? '' : String(text)
  if (!t || !q) return <>{t}</>
  const parts = t.split(new RegExp(`(${escapeReg(q)})`, 'ig'))
  return <>{parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="gs-hl">{part}</mark>
      : <span key={i}>{part}</span>
  )}</>
}

// 加载骨架：替代干等的「搜索中…」，用流光条暗示正在检索
function Skeleton({ rows = 4 }) {
  return (
    <div className="gs-skel" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="gs-skel-row" key={i} style={{ animationDelay: `${i * 90}ms` }}>
          <div className="gs-skel-line gs-skel-w1" />
          <div className="gs-skel-line gs-skel-w2" />
        </div>
      ))}
    </div>
  )
}

// 相似度条：把 0.3~0.9 的余弦分数映射到 8%~100% 宽度，让「多相关」一眼可见
function ScoreBar({ score }) {
  const pct = Math.max(8, Math.min(100, ((score - 0.3) / 0.6) * 100))
  return <span className="gs-score" title={`余弦相似度 ${score.toFixed(3)}`}>
    <b className="gs-score-num">{Math.round(pct)}%</b>
    <i className="gs-score-label">匹配</i>
  </span>
}

const MODES = [
  { key: 'keyword', label: '关键词', hint: '精确匹配标题、正文、评论' },
  { key: 'semantic', label: '智能', hint: '理解意思：搜「心情差」也能找到「emo了」' },
]

// 全局搜索遮罩：输入防抖后检索，分区展示。
// 两种模式：关键词（FTS 即时）与智能（向量语义，约 1.3s）。
// 点击用户 → onOpenUser(id)；点击帖子/评论 → onOpenPost(post)。ESC / 点遮罩关闭。
export default function GlobalSearch({ initial = '', onClose, onOpenUser, onOpenPost, Avatar }) {
  const [q, setQ] = useState(initial)
  const [debounced, setDebounced] = useState(initial.trim())
  const [mode, setMode] = useState('keyword')
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState([])
  const [hits, setHits] = useState([])        // 语义结果 [{post, score}]
  const [degraded, setDegraded] = useState(false) // 语义不可用时的降级提示
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // 输入防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // 打开即聚焦并全选初始词
  useEffect(() => {
    const el = inputRef.current
    if (el) { el.focus(); el.select() }
  }, [])

  // 检索：关键词三路并行；语义单路（较慢，但结果带相似度）
  useEffect(() => {
    setActiveIdx(-1)
    if (!debounced) {
      setUsers([]); setPosts([]); setComments([]); setHits([])
      setLoading(false); setError(null); setDegraded(false)
      return
    }
    let alive = true
    setLoading(true); setError(null)
    const enc = encodeURIComponent(debounced)

    if (mode === 'semantic') {
      apiFetch(`/posts/semantic?q=${enc}&limit=20`)
        .then(r => r.ok ? r.json() : { results: [], degraded: true })
        .then(d => {
          if (!alive) return
          setHits(Array.isArray(d?.results) ? d.results : [])
          setDegraded(!!d?.degraded)
          setLoading(false)
        })
        .catch(() => {
          if (!alive) return
          setError('智能搜索暂时不可用，可切回关键词搜索')
          setLoading(false)
        })
    } else {
      Promise.all([
        apiFetch(`/users/search?q=${enc}`).then(r => r.ok ? r.json() : []),
        apiFetch(`/posts/?search=${enc}&limit=20`).then(r => r.ok ? r.json() : []),
        apiFetch(`/posts/comments/search?q=${enc}&limit=20`).then(r => r.ok ? r.json() : []),
      ]).then(([u, p, c]) => {
        if (!alive) return
        setUsers(Array.isArray(u) ? u : [])
        setPosts(Array.isArray(p) ? p : [])
        setComments(Array.isArray(c) ? c : [])
        setLoading(false)
      }).catch(() => {
        if (!alive) return
        setError('搜索失败，请稍后重试')
        setLoading(false)
      })
    }
    return () => { alive = false }
  }, [debounced, mode])

  const openUser = (id) => { onOpenUser(id); onClose() }
  const openPost = (p) => { onOpenPost(p); onClose() }
  const openComment = async (c) => {
    try {
      const r = await apiFetch(`/posts/${c.post_id}`)
      if (r.ok) { onOpenPost(await r.json()); onClose(); return }
    } catch {}
    onClose()
  }

  // 扁平化结果序列，供 ↑↓ 键盘导航（顺序 = 屏幕上的视觉顺序）
  const flat = useMemo(() => {
    if (mode === 'semantic') {
      return hits.map(h => ({ kind: 'semantic', payload: h, action: () => openPost(h.post) }))
    }
    return [
      ...users.map(u => ({ kind: 'user', payload: u, action: () => openUser(u.id) })),
      ...posts.map(p => ({ kind: 'post', payload: p, action: () => openPost(p) })),
      ...comments.map(c => ({ kind: 'comment', payload: c, action: () => openComment(c) })),
    ]
  }, [mode, users, posts, comments, hits]) // eslint-disable-line react-hooks/exhaustive-deps

  // ↑↓ 选择、Enter 打开
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (!flat.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => (i + 1) % flat.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => (i <= 0 ? flat.length - 1 : i - 1))
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0 && flat[activeIdx]) { e.preventDefault(); flat[activeIdx].action() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flat, activeIdx, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  // 键盘移动时把选中项滚进视野
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIdx])

  const activeIdxOf = (kind, id, i) => {
    if (mode === 'semantic') return i
    const off = kind === 'user' ? 0 : kind === 'post' ? users.length : users.length + posts.length
    return off + i
  }
  const itemCls = (idx, base) => `${base} gs-anim${idx === activeIdx ? ' gs-active' : ''}`

  const total = mode === 'semantic' ? hits.length : users.length + posts.length + comments.length
  const empty = !loading && !error && total === 0
  const activeMode = MODES.find(m => m.key === mode)

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-panel glass-card" onClick={e => e.stopPropagation()}>
        {/* ── 搜索框 ── */}
        <div className="gs-head">
          <span className="gs-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="gs-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={mode === 'semantic' ? '描述你想找的内容，例如「最近压力好大」' : '搜索用户、帖子和评论…'}
            aria-label="搜索"
          />
          {q && (
            <button className="gs-clear" onClick={() => { setQ(''); setDebounced(''); inputRef.current?.focus() }} title="清空">✕</button>
          )}
        </div>

        {/* ── 模式切换（滑动指示块）── */}
        <div className="gs-tabs" role="tablist">
          <span className="gs-tabs-pill" style={{ transform: `translateX(${mode === 'semantic' ? '100%' : '0%'})` }} aria-hidden="true" />
          {MODES.map(m => (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              className={`gs-tab${mode === m.key ? ' is-on' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.key === 'semantic' && <span className="gs-tab-spark" aria-hidden="true">✦</span>}
              {m.label}
            </button>
          ))}
        </div>

        {/* ── 结果区 ── */}
        {!debounced ? (
          <div className="gs-empty">
            <div className="gs-empty-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
            </div>
            <p className="gs-empty-title">{activeMode?.label}搜索</p>
            <p className="gs-empty-desc">{activeMode?.hint}</p>
            <p className="gs-empty-kbd"><kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭</p>
          </div>
        ) : loading ? (
          <Skeleton rows={mode === 'semantic' ? 5 : 4} />
        ) : error ? (
          <div className="gs-empty"><p className="gs-empty-desc gs-error">{error}</p></div>
        ) : empty ? (
          <div className="gs-empty">
            <div className="gs-empty-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
            </div>
            <p className="gs-empty-title">没有找到「{debounced}」</p>
            <p className="gs-empty-desc">
              {mode === 'keyword' ? '试试左边的「智能」搜索，它能理解意思' : '换个说法描述一下试试'}
            </p>
          </div>
        ) : (
          <>
            {mode === 'keyword' ? (
              <div className="gs-count">共 <b>{total}</b> 条结果</div>
            ) : degraded ? (
              <div className="gs-count">
                <span className="gs-degraded">智能搜索未启用，已按关键词展示</span>
              </div>
            ) : null}
            <div className="gs-results" ref={listRef} key={`${debounced}-${mode}`}>
              {mode === 'semantic' ? (
                <section className="gs-section">
                  <h4 className="gs-section-title gs-title-ai">
                    <span className="gs-spark" aria-hidden="true">✦</span>
                    语义相近 <span className="gs-badge">{hits.length}</span>
                    <span className="gs-section-note">按「意思」排序，不必字面相同</span>
                  </h4>
                  <div className="gs-post-list">
                    {hits.map((h, i) => (
                      <button
                        key={h.post?.id ?? i}
                        data-idx={activeIdxOf('semantic', h.post?.id, i)}
                        className={itemCls(activeIdxOf('semantic', h.post?.id, i), 'gs-post-item is-semantic')}
                        style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                        onClick={() => openPost(h.post)}
                      >
                        <span className="gs-post-main">
                          <span className="gs-post-title">{h.post?.title || '(无标题)'}</span>
                          <span className="gs-post-meta">
                            {h.post?.display_name && <span className="gs-post-author">{h.post.display_name}</span>}
                            {h.post?.content && <span className="gs-post-preview">{String(h.post.content).slice(0, 50)}</span>}
                          </span>
                        </span>
                        <ScoreBar score={h.score || 0} />
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <>
                  {users.length > 0 && (
                    <section className="gs-section">
                      <h4 className="gs-section-title">用户 <span className="gs-badge">{users.length}</span></h4>
                      <div className="gs-user-list">
                        {users.map((u, i) => {
                          const idx = activeIdxOf('user', u.id, i)
                          return (
                            <button
                              key={u.id}
                              data-idx={idx}
                              className={itemCls(idx, 'gs-user-item')}
                              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                              onClick={() => openUser(u.id)}
                            >
                              <Avatar src={u.avatar} seed={u.nickname} className="gs-avatar" />
                              <span className="gs-user-name"><Highlight text={u.nickname} q={debounced} /></span>
                              {u.role === 'founder' && <span className="gs-role role-founder">创始人</span>}
                              {u.role === 'ambassador' && <span className="gs-role role-ambassador">大使</span>}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}
                  {posts.length > 0 && (
                    <section className="gs-section">
                      <h4 className="gs-section-title">帖子 <span className="gs-badge">{posts.length}</span></h4>
                      <div className="gs-post-list">
                        {posts.map((p, i) => {
                          const idx = activeIdxOf('post', p.id, i)
                          return (
                            <button
                              key={p.id}
                              data-idx={idx}
                              className={itemCls(idx, 'gs-post-item')}
                              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                              onClick={() => openPost(p)}
                            >
                              <span className="gs-post-title"><Highlight text={p.title || '(无标题)'} q={debounced} /></span>
                              <span className="gs-post-meta">
                                {p.display_name && <span className="gs-post-author">{p.display_name}</span>}
                                {p.content && <span className="gs-post-preview"><Highlight text={p.content.slice(0, 50)} q={debounced} /></span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}
                  {comments.length > 0 && (
                    <section className="gs-section">
                      <h4 className="gs-section-title">评论 <span className="gs-badge">{comments.length}</span></h4>
                      <div className="gs-comment-list">
                        {comments.map((c, i) => {
                          const idx = activeIdxOf('comment', c.id, i)
                          return (
                            <button
                              key={c.id}
                              data-idx={idx}
                              className={itemCls(idx, 'gs-comment-item')}
                              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                              onClick={() => openComment(c)}
                            >
                              <span className="gs-comment-text"><Highlight text={c.content} q={debounced} /></span>
                              <span className="gs-comment-meta">「{c.post_title}」{c.display_name ? ` · ${c.display_name}` : ''}</span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
