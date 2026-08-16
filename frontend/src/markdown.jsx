// 轻量 Markdown -> React 元素 渲染器（零依赖）。
// 关键安全点：全程返回 React 元素，不使用 dangerouslySetInnerHTML，
// 因此用户输入的任意 HTML 标签都会被当作纯文本转义，天然免疫 XSS。
// 支持的语法：#/##/### 标题、> 引用、- 无序列表、1. 有序列表、
// **粗体**、*斜体*、`代码`、[文字](https://...) 链接（仅放行 http/https/mailto）。

function renderInline(text, keyBase) {
  // 先抽离链接，避免链接文本里的 * 被当成强调
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g
  const segs = []
  let last = 0
  let m
  let li = 0
  while ((m = linkRe.exec(text))) {
    if (m.index > last) segs.push({ type: 'text', text: text.slice(last, m.index) })
    segs.push({ type: 'link', text: m[1], href: m[2] })
    last = linkRe.lastIndex
    li++
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) })

  const out = []
  let ki = 0
  for (const seg of segs) {
    if (seg.type === 'link') {
      out.push(
        <a key={`${keyBase}-l${ki++}`} href={seg.href} target="_blank" rel="noopener noreferrer">
          {seg.text}
        </a>
      )
      continue
    }
    // 普通文本段：按 代码 -> 粗体 -> 斜体 顺序切分
    const tokens = []
    let buf = seg.text
    let t
    const codeRe = /`([^`]+)`/g
    const boldRe = /\*\*([^*]+)\*\*/g
    const italRe = /(^|[^*])\*([^*\n]+)\*(?!\*)/g
    // 标记所有区间，统一排序后拼装
    const spans = []
    while ((t = codeRe.exec(buf))) spans.push({ s: t.index, e: t.index + t[0].length, kind: 'code', val: t[1] })
    codeRe.lastIndex = 0
    while ((t = boldRe.exec(buf))) spans.push({ s: t.index, e: t.index + t[0].length, kind: 'bold', val: t[1] })
    boldRe.lastIndex = 0
    while ((t = italRe.exec(buf))) {
      const lead = t[1]
      spans.push({ s: t.index + lead.length, e: t.index + lead.length + (1 + t[2].length + 1), kind: 'ital', val: t[2], lead })
    }
    italRe.lastIndex = 0
    if (!spans.length) { out.push(<span key={`${keyBase}-t${ki++}`}>{buf}</span>); continue }
    spans.sort((a, b) => a.s - b.s)
    let cursor = 0
    for (const sp of spans) {
      if (sp.s < cursor) continue // 重叠区间跳过（粗体优先）
      if (sp.s > cursor) out.push(<span key={`${keyBase}-t${ki++}`}>{buf.slice(cursor, sp.s)}</span>)
      if (sp.kind === 'code') out.push(<code key={`${keyBase}-c${ki++}`} className="md-code">{sp.val}</code>)
      else if (sp.kind === 'bold') out.push(<strong key={`${keyBase}-b${ki++}`}>{sp.val}</strong>)
      else if (sp.kind === 'ital') {
        if (sp.lead) out.push(<span key={`${keyBase}-t${ki++}`}>{sp.lead}</span>)
        out.push(<em key={`${keyBase}-i${ki++}`}>{sp.val}</em>)
      }
      cursor = sp.e
    }
    if (cursor < buf.length) out.push(<span key={`${keyBase}-t${ki++}`}>{buf.slice(cursor)}</span>)
  }
  return out
}

export function renderMarkdown(text) {
  if (!text) return null
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  let bi = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }
    // 标题
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const lvl = h[1].length
      const Tag = lvl === 1 ? 'h3' : lvl === 2 ? 'h4' : 'h5'
      blocks.push(<Tag key={`b${bi++}`} className={`md-h md-h${lvl}`}>{renderInline(h[2], `b${bi}`)}</Tag>)
      i++; continue
    }
    // 引用（连续 > 行）
    if (/^>\s?/.test(line)) {
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++ }
      blocks.push(<blockquote key={`b${bi++}`} className="md-quote">{renderInline(quote.join(' '), `b${bi}`)}</blockquote>)
      continue
    }
    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++ }
      blocks.push(<ul key={`b${bi++}`} className="md-ul">{items.map((it, k) => <li key={k}>{renderInline(it, `b${bi}-${k}`)}</li>)}</ul>)
      continue
    }
    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++ }
      blocks.push(<ol key={`b${bi++}`} className="md-ol">{items.map((it, k) => <li key={k}>{renderInline(it, `b${bi}-${k}`)}</li>)}</ol>)
      continue
    }
    // 段落（连续非空、非块级行）
    const para = []
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,3})\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
           !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]); i++
    }
    blocks.push(<p key={`b${bi++}`} className="md-p">{renderInline(para.join(' '), `b${bi}`)}</p>)
  }
  return blocks
}
