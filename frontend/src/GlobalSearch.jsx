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

// 全局搜索遮罩：输入防抖后并行拉「用户」与「帖子」，分区展示。
// 点击用户 → onOpenUser(id)；点击帖子 → onOpenPost(post)。ESC / 点遮罩关闭。
export default function GlobalSearch({ initial = '', onClose, onOpenUser, onOpenPost, Avatar }) {
  const [q, setQ] = useState(initial)
  const [debounced, setDebounced] = useState(initial.trim())
  const [users, setUsers] = useState([])
  const [posts, setPosts] = useState([])
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
    ]).then(([u, p]) => {
      if (!alive) return
      setUsers(Array.isArray(u) ? u : [])
      setPosts(Array.isArray(p) ? p : [])
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
        ) : (users.length === 0 && posts.length === 0) ? (
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
                      <span className="gs-user-name">{u.nickname}</span>
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
                      <span className="gs-post-title">{p.title || '(无标题)'}</span>
                      <span className="gs-post-meta">
                        {p.display_name && <span className="gs-post-author">{p.display_name}</span>}
                        {p.content && <span className="gs-post-preview">{p.content.slice(0, 50)}</span>}
                      </span>
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
