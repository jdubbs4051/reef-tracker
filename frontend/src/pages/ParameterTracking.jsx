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
  // The cell being edited. `id` is the existing reading (edit) or null (add a new one).
  const [editing, setEditing] = useState(null) // { cellKey, dayKey, pid, id, draft }
  const [saving, setSaving] = useState(false)

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

  async function deleteDay(k) {
    const ids = grid.idsByDay.get(k) || []
    if (!ids.length) return
    if (!window.confirm(`Delete all test results from ${shortDate(k)}? This can’t be undone.`)) return
    await api.deleteReadings(tank.id, ids)
    await loadHistory()
    logBump?.()
  }

  // Start editing a cell. `id`/`value` are null for an empty cell (add a new reading).
  function startEdit(k, pid, id, value) {
    setEditing({ cellKey: `${k}:${pid}`, dayKey: k, pid, id, draft: value == null ? '' : String(value) })
  }

  async function commitEdit() {
    if (!editing) return
    const { dayKey: k, pid, id, draft } = editing
    const next = parseFloat(draft)
    // Bail on empty/non-numeric input — nothing to save (also the cancel path for adds).
    if (draft.trim() === '' || Number.isNaN(next)) {
      setEditing(null)
      return
    }
    const current = id != null ? readings.find((r) => r.id === id) : null
    if (current && current.value === next) {
      setEditing(null) // unchanged — skip the write
      return
    }
    setSaving(true)
    try {
      if (id != null) {
        await api.updateReading(id, { value: next })
      } else {
        // New value for a day that had no reading for this parameter: reuse the day's
        // existing timestamp so it lands on the same row.
        await api.createReadings({
          tank_id: tank.id,
          measured_at: grid.dayAt.get(k),
          entries: [{ parameter_id: pid, value: next }],
        })
      }
      await loadHistory()
      logBump?.()
    } finally {
      setSaving(false)
      setEditing(null)
    }
  }

  // Pivot readings into a grid: rows = distinct local days (desc), cols = parameters.
  const grid = useMemo(() => {
    const byDay = new Map() // key -> { pid: value } — the value shown in the cell
    const cellId = new Map() // key -> { pid: reading id } — which reading that cell edits
    const idsByDay = new Map() // key -> [reading id] — every reading on that day, for delete
    const dayAt = new Map() // key -> a measured_at on that day, so adds land on the same row
    for (const r of readings) {
      const k = dayKey(r.measured_at)
      if (!byDay.has(k)) {
        byDay.set(k, {})
        cellId.set(k, {})
        dayAt.set(k, r.measured_at)
      }
      byDay.get(k)[r.parameter_id] = r.value // later (newer) rows win
      cellId.get(k)[r.parameter_id] = r.id // …and they own the cell's edit
      if (!idsByDay.has(k)) idsByDay.set(k, [])
      idsByDay.get(k).push(r.id)
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
    return { keys, byDay, cellId, idsByDay, dayAt, events }
  }, [readings, journal])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  return (
    <div className="content rtscroll">
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 14 }}>
        Out-of-range values stand out; <span style={{ color: 'var(--blue)', fontWeight: 700 }}>●</span> marks a day a journal event sits near — hover to read it. Click any cell to edit it, or an empty one to add a value.
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
                const ids = grid.cellId.get(k)
                const evs = grid.events.get(k)
                return (
                  <tr key={k}>
                    <th className="sticky-col">
                      <button
                        type="button"
                        className="hist-delete"
                        title="Delete this day’s results"
                        aria-label={`Delete results from ${shortDate(k)}`}
                        onClick={() => deleteDay(k)}
                      >
                        ×
                      </button>
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
                      const id = ids[p.id]
                      const status = statusFor(v, p)
                      const isEditing = editing && editing.cellKey === `${k}:${p.id}`
                      if (isEditing) {
                        return (
                          <td key={p.id} className="mono hist-edit-cell">
                            <input
                              className="hist-edit-input mono"
                              type="number"
                              step="any"
                              inputMode="decimal"
                              autoFocus
                              disabled={saving}
                              value={editing.draft}
                              onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                else if (e.key === 'Escape') setEditing(null)
                              }}
                            />
                          </td>
                        )
                      }
                      const empty = v == null
                      return (
                        <td
                          key={p.id}
                          className={`mono hist-editable${empty ? ' hist-empty' : ''}`}
                          style={{ color: STATUS_COLOR[status] }}
                          title={empty ? 'Click to add' : 'Click to edit'}
                          onClick={() => startEdit(k, p.id, id ?? null, v ?? null)}
                        >
                          {empty ? <span className="hist-add-dot" /> : fmt(v)}
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
