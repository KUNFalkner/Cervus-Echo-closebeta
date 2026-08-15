import React, { useMemo, useState } from 'react'

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay() // 0 = 周日

const pad2 = (n) => String(n).padStart(2, '0')

const HistoryEntryDetail = ({ entry, openTs, setOpenTs }) => {
  const isOpen = openTs === entry.ts
  return (
    <div className="tarot-history-item tarot-cal-detail" key={entry.ts}>
      <div className="tarot-history-meta">
        <span className="tarot-history-date">{entry.date}</span>
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
      {entry.counsel && (
        <button className="tarot-history-toggle" onClick={() => setOpenTs(isOpen ? null : entry.ts)}>
          {isOpen ? '收起解读 ▴' : '查看解读 ▾'}
        </button>
      )}
      {entry.counsel && isOpen && <p className="tarot-history-counsel">{entry.counsel.text}</p>}
    </div>
  )
}

export default function TarotHistoryCalendar({ history, onClose }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [openTs, setOpenTs] = useState(null)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const entriesByDate = useMemo(() => {
    const m = new Map()
    for (const h of history) { if (h.date) m.set(h.date, h) }
    return m
  }, [history])

  const selected = openTs ? history.find(h => h.ts === openTs) || null : null

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
          const entry = day ? entriesByDate.get(dateStr) : null
          const isToday = dateStr === todayStr
          return (
            <button
              key={idx}
              className={`tarot-cal-cell ${day ? '' : 'empty'} ${entry ? 'has-entry' : ''} ${isToday ? 'is-today' : ''}`}
              disabled={!entry}
              onClick={() => entry && setOpenTs(entry.ts)}
              aria-label={entry ? `${dateStr} 有抽牌记录` : dateStr}
            >
              {day && <span className="tarot-cal-day">{day}</span>}
              {entry && <span className="tarot-cal-dot" title={entry.cards.map(c => c.name).join(' · ')}>✦</span>}
            </button>
          )
        })}
      </div>
      {selected && (
        <div className="tarot-cal-detail-wrap">
          <HistoryEntryDetail entry={selected} openTs={openTs} setOpenTs={setOpenTs} />
        </div>
      )}
      {history.length === 0 && (
        <p className="tarot-history-empty">还没有抽牌记录，每次「每日一抽」都会被静静收藏在这里。</p>
      )}
    </div>
  )
}
