import { useEffect, useMemo, useState } from 'react'
import { useTank } from '../TankContext.jsx'
import { api, fmt, statusFor } from '../api.js'

const STATUS_COLOR = { ok: 'var(--ink)', high: 'var(--coral)', low: 'var(--amber)', none: 'var(--ink3)' }

// Local-day key (yyyy-mm-dd) so readings/journal group by the day the user saw them.
function dayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function shortDate(key) {
  return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Journal events rarely land exactly on a reading day, so attach each entry to the
// nearest reading day within a window — that's where its effect shows in the trend.
const MATCH_WINDOW_DAYS = 5

export default function ParameterTracking({ logBump }) {
  const { tank, parameters, loading, error } = useTank()
  const [readings, setReadings] = useState([])
  const [journal, setJournal] = useState([])

  async function loadHistory() {
    if (!tank) return
    const [rows, entries] = await Promise.all([api.listReadings(tank.id), api.listJournal(tank.id)])
    setReadings(rows)
    setJournal(entries)
  }

  // Reload on tank change and whenever a new reading is saved (logBump bumps).
  useEffect(() => {
    loadHistory()
  }, [tank, logBump])

  // Pivot readings into a grid: rows = distinct local days (desc), cols = parameters.
  const grid = useMemo(() => {
    const byDay = new Map() // key -> { values: {pid: value} }
    for (const r of readings) {
      const k = dayKey(r.measured_at)
      if (!byDay.has(k)) byDay.set(k, {})
      byDay.get(k)[r.parameter_id] = r.value // later (newer) rows win
    }
    const keys = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1)) // desc

    // Attach each journal entry to its nearest reading day within the window.
    const events = new Map() // key -> [entry]
    for (const e of journal) {
      const ed = keyToDate(dayKey(e.entry_at)).getTime()
      let best = null
      let bestDiff = Infinity
      for (const k of keys) {
        const diff = Math.abs(keyToDate(k).getTime() - ed) / 86400000
        if (diff < bestDiff) {
          bestDiff = diff
          best = k
        }
      }
      if (best != null && bestDiff <= MATCH_WINDOW_DAYS) {
        if (!events.has(best)) events.set(best, [])
        events.get(best).push(e)
      }
    }
    return { keys, byDay, events }
  }, [readings, journal])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  return (
    <div className="content rtscroll">
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 14 }}>
        Out-of-range values stand out; <span style={{ color: 'var(--blue)', fontWeight: 700 }}>●</span> marks a day a journal event sits near — hover to read it.
      </div>

      {grid.keys.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 2px' }}>
          No test results logged yet — tap “Add Test Results” to start your history.
        </div>
      ) : (
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th className="sticky-col">Date</th>
                {parameters.map((p) => (
                  <th key={p.id}>
                    {p.name}
                    {p.unit ? <span className="hist-unit"> {p.unit}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.keys.map((k) => {
                const row = grid.byDay.get(k)
                const evs = grid.events.get(k)
                return (
                  <tr key={k}>
                    <th className="sticky-col">
                      {evs ? (
                        <span
                          className="event-dot"
                          title={evs.map((e) => (e.body ? `${e.title} — ${e.body}` : e.title)).join('\n')}
                        >
                          ●
                        </span>
                      ) : null}
                      {shortDate(k)}
                    </th>
                    {parameters.map((p) => {
                      const v = row[p.id]
                      const status = statusFor(v, p)
                      return (
                        <td key={p.id} className="mono" style={{ color: STATUS_COLOR[status] }}>
                          {v == null ? <span style={{ color: 'var(--ink3)' }}>·</span> : fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
