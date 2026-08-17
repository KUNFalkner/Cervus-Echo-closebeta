import { useState, useEffect, useRef } from 'react'

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

// 全局搜索遮罩：输入防抖后并行拉「用户 / 帖子 / 评论」，分区展示。
// 点击用户 → onOpenUser(id)；点击帖子/评论 → onOpenPost(post)。ESC / 点遮罩关闭。
export default function GlobalSearch({ initial = '', onClose, onOpenUser, onOpenPost, Avatar }) {
  const [q, setQ] = useState(initial)
  const [debounced, setDebounced] = useState(initial.trim())
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

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

  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 并行搜索用户 + 帖子
  useEffect(() => {
    if (!debounced) { setUsers([]); setPosts([]); setLoading(false); setError(null); return }
    let alive = true
    setLoading(true); setError(null)
    const enc = encodeURIComponent(debounced)
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
    return () => { alive = false }
  }, [debounced])

  const openUser = (id) => { onOpenUser(id); onClose() }
  const openPost = (p) => { onOpenPost(p); onClose() }
  const openComment = async (c) => {
    try {
      const r = await apiFetch(`/posts/${c.post_id}`)
      if (r.ok) { onOpenPost(await r.json()); onClose(); return }
    } catch {}
    onClose()
  }

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-panel glass-card" onClick={e => e.stopPropagation()}>
        <div className="gs-head">
          <input
            ref={inputRef}
            className="glass-input gs-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索用户和帖子..."
          />
          <button className="gs-close" onClick={onClose} title="关闭">✕</button>
        </div>

        {!debounced ? (
          <div className="gs-hint">输入关键词，同时搜索用户与帖子</div>
        ) : loading ? (
          <div className="gs-loading">搜索中…</div>
        ) : error ? (
          <div className="gs-hint gs-error">{error}</div>
        ) : (users.length === 0 && posts.length === 0 && comments.length === 0) ? (
          <div className="gs-hint">没有找到与「{debounced}」相关的内容</div>
        ) : (
          <div className="gs-results">
            {users.length > 0 && (
              <section className="gs-section">
                <h4 className="gs-section-title">用户 · {users.length}</h4>
                <div className="gs-user-list">
                  {users.map(u => (
                    <button key={u.id} className="gs-user-item" onClick={() => openUser(u.id)}>
                      <Avatar src={u.avatar} seed={u.nickname} className="gs-avatar" />
                      <span className="gs-user-name"><Highlight text={u.nickname} q={debounced} /></span>
                      {u.role === 'founder' && <span className="gs-role role-founder">创始人</span>}
                      {u.role === 'ambassador' && <span className="gs-role role-ambassador">大使</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {posts.length > 0 && (
              <section className="gs-section">
                <h4 className="gs-section-title">帖子 · {posts.length}</h4>
                <div className="gs-post-list">
                  {posts.map(p => (
                    <button key={p.id} className="gs-post-item" onClick={() => openPost(p)}>
                      <span className="gs-post-title"><Highlight text={p.title || '(无标题)'} q={debounced} /></span>
                      <span className="gs-post-meta">
                        {p.display_name && <span className="gs-post-author">{p.display_name}</span>}
                        {p.content && <span className="gs-post-preview"><Highlight text={p.content.slice(0, 50)} q={debounced} /></span>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {comments.length > 0 && (
              <section className="gs-section">
                <h4 className="gs-section-title">评论 · {comments.length}</h4>
                <div className="gs-comment-list">
                  {comments.map(c => (
                    <button key={c.id} className="gs-comment-item" onClick={() => openComment(c)}>
                      <span className="gs-comment-text"><Highlight text={c.content} q={debounced} /></span>
                      <span className="gs-comment-meta">「{c.post_title}」{c.display_name ? ` · ${c.display_name}` : ''}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
