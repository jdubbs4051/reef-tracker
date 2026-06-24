import { useEffect, useMemo, useState } from 'react'
import { useTank } from '../TankContext.jsx'
import { api, fmt } from '../api.js'

// Local calendar date (yyyy-mm-dd) for the date picker default.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Combine the picked date with the current clock time, return UTC ISO for the API.
function measuredISO(dateStr) {
  const now = new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
}

// The "Add Test Results" form, in a modal. Opened from the TopBar or the
// Parameter Tracking page; calls onSaved() so callers can refresh their views.
export default function AddResultsModal({ onClose, onSaved }) {
  const { tank, parameters, refresh } = useTank()
  const [date, setDate] = useState(todayStr())
  const [values, setValues] = useState({}) // parameter_id -> string
  const [last, setLast] = useState({}) // parameter_id -> previous value
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (!tank) return
    api.latestReadings(tank.id).then((rows) => {
      setLast(Object.fromEntries(rows.map((r) => [r.parameter_id, r.value])))
    })
  }, [tank])

  const entries = useMemo(
    () =>
      Object.entries(values)
        .filter(([, v]) => v !== '' && v != null && !Number.isNaN(Number(v)))
        .map(([pid, v]) => ({ parameter_id: Number(pid), value: Number(v) })),
    [values]
  )

  async function save() {
    if (!tank || entries.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.createReadings({ tank_id: tank.id, measured_at: measuredISO(date), entries })
      await refresh()
      onSaved?.(entries.length)
    } catch (e) {
      setSaveError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title">Add test results</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <label className="field" style={{ marginBottom: 14 }}>
          <div className="field-label">Date tested</div>
          <input className="date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayStr()} />
        </label>

        <div className="log-rows">
          {parameters.map((p) => (
            <div className="log-row" key={p.id}>
              <div style={{ flex: 1 }}>
                <div className="name">{p.name}</div>
                <div className="hint">
                  {p.unit || '—'}
                  {last[p.id] != null ? ` · last ${fmt(last[p.id])}` : ''}
                </div>
              </div>
              <input
                className="log-input"
                type="number"
                inputMode="decimal"
                placeholder=""
                value={values[p.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {saveError ? (
          <div className="toast" style={{ background: 'var(--coralS)', color: 'var(--coral)', borderColor: 'var(--coral)' }}>{saveError}</div>
        ) : null}

        <button className="save-btn" onClick={save} disabled={saving || entries.length === 0}>
          {saving ? 'Saving…' : entries.length === 0 ? 'Enter a value to save' : `Save ${entries.length} result${entries.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
