import { useEffect, useRef, useState } from 'react'
import { Plus } from '../icons.jsx'
import { useTank } from '../TankContext.jsx'
import { api, LIVESTOCK_TYPES } from '../api.js'

const TYPE_TONE = {
  fish: { color: 'var(--blue)', background: 'var(--blueS)' },
  coral: { color: 'var(--teal)', background: 'var(--tealS)' },
  invert: { color: 'var(--amber)', background: 'var(--amberS)' },
  cuc: { color: 'var(--blue)', background: 'var(--blueS)' },
}
const STATUS_TONE = {
  alive: { color: 'var(--teal)', background: 'var(--tealS)' },
  lost: { color: 'var(--coral)', background: 'var(--coralS)' },
  removed: { color: 'var(--ink2)', background: 'var(--card2)' },
}
const FILTERS = [['all', 'All'], ['fish', 'Fish'], ['coral', 'Coral'], ['invert', 'Invert'], ['cuc', 'CUC']]
const BLANK = { common_name: '', scientific_name: '', type: 'fish', source: '', notes: '' }

function Chip({ tone, children }) {
  return <span className="chip" style={tone}>{children}</span>
}

export default function Livestock() {
  const { tank, loading, error } = useTank()
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState(null)

  async function load() {
    if (tank) setList(await api.listLivestock(tank.id))
  }
  useEffect(() => {
    load()
  }, [tank])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  const aliveCount = list.filter((x) => x.status === 'alive').length
  const shown = filter === 'all' ? list : list.filter((x) => x.type === filter)

  return (
    <div className="content rtscroll">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{aliveCount} alive</span>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} s={2.2} /> Add
        </button>
      </div>

      <div className="pill-row">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`pill-btn${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 2px' }}>
          Nothing here yet — add your first {filter === 'all' ? 'animal' : filter}.
        </div>
      ) : (
        <div className="gallery">
          {shown.map((x) => (
            <button className="ls-card" key={x.id} onClick={() => setDetail(x)}>
              <div className="ls-photo">
                {x.photo_url ? <img src={x.photo_url} alt={x.common_name} /> : <span className="ph">no photo</span>}
              </div>
              <div className="ls-body">
                <div className="ls-name">{x.common_name}</div>
                {x.scientific_name ? <div className="ls-sci">{x.scientific_name}</div> : null}
                <div className="chips">
                  <Chip tone={STATUS_TONE[x.status]}>{x.status}</Chip>
                  <Chip tone={TYPE_TONE[x.type] || TYPE_TONE.fish}>{x.type}</Chip>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <AddLivestock
          tank={tank}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false)
            await load()
          }}
        />
      ) : null}

      {detail ? (
        <LivestockDetail
          item={detail}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await load()
            setDetail(null)
          }}
        />
      ) : null}
    </div>
  )
}

function AddLivestock({ tank, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK)
  const [file, setFile] = useState(null)
  const [advice, setAdvice] = useState([])
  const [saving, setSaving] = useState(false)
  const debounce = useRef(null)

  // Pull stocking advice as the name/type change (debounced) — advisory, never blocking.
  useEffect(() => {
    if (!tank || !form.common_name.trim()) {
      setAdvice([])
      return
    }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        setAdvice(await api.stockingAdvice(tank.id, form.type, form.common_name))
      } catch {
        setAdvice([])
      }
    }, 400)
    return () => clearTimeout(debounce.current)
  }, [tank, form.common_name, form.type])

  async function save() {
    if (!form.common_name.trim()) return
    setSaving(true)
    try {
      const created = await api.createLivestock({ tank_id: tank.id, ...form, common_name: form.common_name.trim() })
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('tank_id', String(tank.id))
        fd.append('linked_type', 'livestock')
        fd.append('linked_id', String(created.id))
        await api.uploadPhoto(fd)
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title">Add livestock</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="form-field">
          <label className="form-label">Common name</label>
          <input className="text-input" autoFocus value={form.common_name} onChange={set('common_name')} placeholder="e.g. Ocellaris Clownfish" />
        </div>
        <div className="form-field">
          <label className="form-label">Scientific name</label>
          <input className="text-input" value={form.scientific_name} onChange={set('scientific_name')} placeholder="e.g. Amphiprion ocellaris" />
        </div>
        <div className="form-field">
          <label className="form-label">Type</label>
          <select className="select-input" value={form.type} onChange={set('type')}>
            {LIVESTOCK_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {advice.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {advice.map((a, i) => (
              <div key={i} className={`advice ${a.level}`}>{a.text}</div>
            ))}
          </div>
        ) : null}

        <div className="form-field">
          <label className="form-label">Source</label>
          <input className="text-input" value={form.source} onChange={set('source')} placeholder="e.g. local fish store" />
        </div>
        <div className="form-field">
          <label className="form-label">Notes</label>
          <textarea className="textarea-input" value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-field">
          <label className="form-label">Photo</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>

        <button className="save-btn" style={{ marginTop: 6 }} disabled={saving || !form.common_name.trim()} onClick={save}>
          {saving ? 'Saving…' : 'Add to tank'}
        </button>
      </div>
    </div>
  )
}

function LivestockDetail({ item, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)

  async function setStatus(status) {
    setBusy(true)
    try {
      await api.updateLivestock(item.id, { status })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!window.confirm(`Delete “${item.common_name}”? This removes the record and its photo.`)) return
    setBusy(true)
    try {
      await api.deleteLivestock(item.id)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const added = item.date_added ? new Date(item.date_added).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="modal-title">{item.common_name}</div>
            {item.scientific_name ? <div className="ls-sci" style={{ marginTop: 2 }}>{item.scientific_name}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        {item.photo_url ? (
          <img src={item.photo_url} alt={item.common_name} style={{ width: '100%', borderRadius: 12, marginBottom: 14, display: 'block' }} />
        ) : null}

        <div className="chips" style={{ marginBottom: 14 }}>
          <Chip tone={STATUS_TONE[item.status]}>{item.status}</Chip>
          <Chip tone={TYPE_TONE[item.type] || TYPE_TONE.fish}>{item.type}</Chip>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 14 }}>
          <div><strong style={{ color: 'var(--ink)' }}>Added:</strong> {added}</div>
          {item.source ? <div><strong style={{ color: 'var(--ink)' }}>Source:</strong> {item.source}</div> : null}
          {item.notes ? <div style={{ marginTop: 6 }}>{item.notes}</div> : null}
        </div>

        <label className="form-label">Status</label>
        <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
          {['alive', 'lost', 'removed'].map((s) => (
            <button
              key={s}
              className={`pill-btn${item.status === s ? ' active' : ''}`}
              disabled={busy}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <button className="link-btn" disabled={busy} onClick={remove}>Delete record</button>
      </div>
    </div>
  )
}
