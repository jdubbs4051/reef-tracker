// Month calendar that highlights days a task is due (CHANGE_REQUESTS.md #4).
// Custom-built to keep the no-heavy-deps style. Days carrying a task get a dot;
// hover lists the tasks. Overdue/today get their own tint so the eye lands there.
import { useMemo, useState } from 'react'
import { useTank } from '../TankContext.jsx'
import { ChevUp, ChevDown } from '../icons.jsx'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Local-day key so a task's due date lands on the day the user would see it.
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TaskCalendar() {
  const { tasks } = useTank()
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })

  // Group scheduled tasks by the local day they're due.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (!t.next_due_at) continue
      const k = dayKey(new Date(t.next_due_at))
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(t)
    }
    return map
  }, [tasks])

  const todayKey = dayKey(now)
  const first = new Date(view.year, view.month, 1)
  const startPad = first.getDay() // leading blanks before day 1
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function shift(delta) {
    setView((v) => {
      const m = v.month + delta
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
    })
  }

  return (
    <div className="card">
      <div className="cal-head">
        <div className="card-title" style={{ marginBottom: 0 }}>
          {MONTHS[view.month]} {view.year}
        </div>
        <div className="cal-nav">
          <button className="cal-arrow" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevUp size={15} />
          </button>
          <button className="cal-arrow" onClick={() => shift(1)} aria-label="Next month">
            <ChevDown size={15} />
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={`h${i}`} className="cal-weekday">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={`b${i}`} className="cal-cell empty" />
          const k = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const due = byDay.get(k)
          const isToday = k === todayKey
          const overdue = due && k < todayKey
          const cls = ['cal-cell']
          if (isToday) cls.push('today')
          if (due) cls.push(overdue ? 'overdue' : 'due')
          const title = due
            ? due.map((t) => `${t.name}${t.recurrence_rule ? ` · ${t.recurrence_rule}` : ''}`).join('\n')
            : undefined
          return (
            <div key={k} className={cls.join(' ')} title={title}>
              <span className="cal-num">{d}</span>
              {due ? <span className="cal-dot" /> : null}
            </div>
          )
        })}
      </div>

      <div className="cal-legend">
        <span><span className="cal-key today" /> Today</span>
        <span><span className="cal-key due" /> Task due</span>
        <span><span className="cal-key overdue" /> Overdue</span>
      </div>
    </div>
  )
}
