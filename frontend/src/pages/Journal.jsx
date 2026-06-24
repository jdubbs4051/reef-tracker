import { useEffect, useState } from 'react'
import { Plus } from '../icons.jsx'
import { useTank } from '../TankContext.jsx'
import { api } from '../api.js'

const NODE_COLORS = ['var(--teal)', 'var(--blue)', 'var(--amber)', 'var(--ink3)']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoFromDate(dateStr) {
  const now = new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString()
}
function dateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

export default function Journal() {
  const { tank, loading, error } = useTank()
  const [entries, setEntries] = useState([])
  const [adding, setAdding] = useState(false)

  async function load() {
    if (tank) setEntries(await api.listJournal(tank.id))
  }
  useEffect(() => {
    load()
  }, [tank])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  return (
    <div className="content rtscroll">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, maxWidth: 640 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{entries.length} entries</span>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} s={2.2} /> New entry
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No entries yet — jot down what's happening in the tank.</div>
      ) : (
        <div className="timeline">
          <div className="timeline-line" />
          {entries.map((e, i) => (
            <div className="j-entry" key={e.id}>
              <span className="j-node" style={{ background: NODE_COLORS[i % NODE_COLORS.length] }} />
              <div className="j-date">{dateLabel(e.entry_at)}</div>
              <div className="j-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div className="j-title">{e.title}</div>
                  <button
                    className="icon-btn"
                    style={{ fontSize: 16 }}
                    onClick={async () => {
                      if (window.confirm('Delete this entry?')) {
                        await api.deleteJournal(e.id)
                        await load()
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                {e.body ? <div className="j-body">{e.body}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <AddEntry
          tank={tank}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function AddEntry({ tank, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.createJournal({ tank_id: tank.id, title: title.trim(), body, entry_at: isoFromDate(date) })
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title">New journal entry</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="form-field">
          <label className="form-label">Date</label>
          <input className="text-input" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">Title</label>
          <input className="text-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Added a cleaner shrimp" />
        </div>
        <div className="form-field">
          <label className="form-label">Notes</label>
          <textarea className="textarea-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, what you observed…" />
        </div>
        <button className="save-btn" style={{ marginTop: 6 }} disabled={saving || !title.trim()} onClick={save}>
          {saving ? 'Saving…' : 'Add entry'}
        </button>
      </div>
    </div>
  )
}
