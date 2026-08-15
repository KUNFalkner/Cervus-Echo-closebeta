import React, { useMemo, useState } from 'react'

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay() // 0 = 周日

const pad2 = (n) => String(n).padStart(2, '0')

const HistoryEntryDetail = ({ entry }) => (
  <div className="tarot-history-item tarot-cal-detail">
    <div className="tarot-history-meta">
      <span className="tarot-history-date">{entry.date}</span>
      {entry.time && <span className="tarot-history-time">{entry.time}</span>}
      <span className="tarot-history-spread">{entry.spread === 'celtic' ? '凯尔特十字' : '三张'}</span>
      {entry.question && <span className="tarot-history-q">「{entry.question}」</span>}
    </div>
    <div className="tarot-history-cards">
      {Array.isArray(entry.cards) && entry.cards.map((c, i) => (
        <span className="tarot-history-chip" key={i}>
          <i className={c.reversed ? 'rev' : ''}>{c.reversed ? '逆' : '正'}</i>
          {c.name}
        </span>
      ))}
    </div>
  </div>
)

export default function TarotHistoryCalendar({ history, onClose }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // 按日期分组：同一天可能有多次抽牌（累加），故每个日期对应一个数组
  const entriesByDay = useMemo(() => {
    const m = new Map()
    for (const h of history) {
      if (!h.date) continue
      if (!m.has(h.date)) m.set(h.date, [])
      m.get(h.date).push(h)
    }
    return m
  }, [history])

  const [openDate, setOpenDate] = useState(null)
  const selected = openDate ? (entriesByDay.get(openDate) || []) : []

  const cells = []
  const pad = firstDayOfMonth(year, month)
  for (let i = 0; i < pad; i++) cells.push(null)
  const total = daysInMonth(year, month)
  for (let i = 1; i <= total; i++) cells.push(i)

  const monthLabel = `${year} 年 ${month + 1} 月`
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` })()

  return (
    <div className="tarot-history-calendar">
      <div className="tarot-cal-head">
        <button className="tarot-cal-nav" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="上个月">◀</button>
        <b className="tarot-cal-month">{monthLabel}</b>
        <button className="tarot-cal-nav" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="下个月">▶</button>
      </div>
      <div className="tarot-cal-grid">
        {['日','一','二','三','四','五','六'].map(d => <div key={d} className="tarot-cal-weekday">{d}</div>)}
        {cells.map((day, idx) => {
          const dateStr = day ? `${year}-${pad2(month + 1)}-${pad2(day)}` : ''
          const entries = day ? entriesByDay.get(dateStr) : null
          const has = !!entries && entries.length > 0
          const isToday = dateStr === todayStr
          return (
            <button
              key={idx}
              className={`tarot-cal-cell ${day ? '' : 'empty'} ${has ? 'has-entry' : ''} ${isToday ? 'is-today' : ''}`}
              disabled={!has}
              onClick={() => has && setOpenDate(dateStr === openDate ? null : dateStr)}
              aria-label={has ? `${dateStr} 有 ${entries.length} 条抽牌记录` : dateStr}
            >
              {day && <span className="tarot-cal-day">{day}</span>}
              {has && (
                <span className="tarot-cal-dot" title={(entries[0].cards || []).map(c => c.name).join(' · ')}>
                  ✦{entries.length > 1 ? <i className="tarot-cal-count">{entries.length}</i> : null}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <div className="tarot-cal-detail-wrap">
          <div className="tarot-cal-detail-day">{openDate} · 共 {selected.length} 次抽牌</div>
          {selected.map(e => <HistoryEntryDetail key={e.ts} entry={e} />)}
        </div>
      )}
      {history.length === 0 && (
        <p className="tarot-history-empty">还没有抽牌记录，每次抽牌都会被静静收藏在这里。</p>
      )}
    </div>
  )
}
