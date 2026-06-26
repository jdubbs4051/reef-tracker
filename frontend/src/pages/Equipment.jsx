import { useEffect, useState } from 'react'
import { Plus } from '../icons.jsx'
import { useTank } from '../TankContext.jsx'
import { api, EQUIPMENT_TYPES, EQUIPMENT_INTEGRATIONS } from '../api.js'
import DeviceCard from '../components/DeviceCard.jsx'

const BLANK = { type: 'Lighting', brand: '', model: '', nickname: '', installed_at: '', notes: '', host: '', integration: '', viz_enabled: true }

// A piece of gear is "named" by whatever's filled in — nickname wins, else brand+model.
function titleFor(eq) {
  if (eq.nickname) return eq.nickname
  const bm = [eq.brand, eq.model].filter(Boolean).join(' ')
  return bm || eq.type
}

// <input type="date"> wants YYYY-MM-DD in local time; the API speaks ISO/UTC.
function toDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fromDateInput(s) {
  return s ? new Date(`${s}T00:00:00`).toISOString() : null
}

export default function Equipment() {
  const { tank, loading, error } = useTank()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null) // null | {} (new) | item (existing)

  async function load() {
    if (tank) setList(await api.listEquipment(tank.id))
  }
  useEffect(() => {
    load()
  }, [tank])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  const active = list.filter((x) => x.active)
  // Integrated, active devices get a live-status gauge card up top (plan §4.5/§4.7).
  const live = active.filter((x) => x.integration)
  // Group by type, preserving the canonical type order.
  const groups = EQUIPMENT_TYPES.map((t) => [t, list.filter((x) => x.type === t)]).filter(([, items]) => items.length)

  return (
    <div className="content rtscroll">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
          {active.length} piece{active.length === 1 ? '' : 's'} of gear
        </span>
        <button className="btn-primary" onClick={() => setEditing({})}>
          <Plus size={16} s={2.2} /> Add
        </button>
      </div>

      {live.length ? (
        <div style={{ marginBottom: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Live status</div>
          <div className="dev-grid">
            {live.map((x) => (
              <DeviceCard key={x.id} eq={x} onEdit={setEditing} />
            ))}
          </div>
        </div>
      ) : null}

      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 2px' }}>
          No gear logged yet — add your light, return pump, skimmer, heater, ATO…
        </div>
      ) : (
        groups.map(([type, items]) => (
          <div key={type} style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{type}</div>
            <div className="gallery">
              {items.map((x) => (
                <button className="ls-card" key={x.id} onClick={() => setEditing(x)}>
                  <div className="ls-photo">
                    {x.photo_url ? <img src={x.photo_url} alt={titleFor(x)} /> : <span className="ph">no photo</span>}
                  </div>
                  <div className="ls-body">
                    <div className="ls-name">{titleFor(x)}</div>
                    {x.nickname && (x.brand || x.model) ? (
                      <div className="ls-sci" style={{ fontStyle: 'normal' }}>
                        {[x.brand, x.model].filter(Boolean).join(' ')}
                      </div>
                    ) : null}
                    {!x.active ? (
                      <div className="chips">
                        <span className="chip" style={{ color: 'var(--ink2)', background: 'var(--card2)' }}>retired</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {editing ? (
        <EditEquipment
          tank={tank}
          item={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function EditEquipment({ tank, item, onClose, onSaved }) {
  const isEdit = !!item
  const [form, setForm] = useState(
    item
      ? {
          type: item.type || 'Other',
          brand: item.brand || '',
          model: item.model || '',
          nickname: item.nickname || '',
          installed_at: toDateInput(item.installed_at),
          notes: item.notes || '',
          active: item.active,
          host: item.host || '',
          integration: item.integration || '',
          viz_enabled: item.viz_enabled !== false,
        }
      : { ...BLANK, active: true }
  )
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const valid = form.brand.trim() || form.model.trim() || form.nickname.trim()

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      const payload = {
        type: form.type,
        brand: form.brand.trim(),
        model: form.model.trim(),
        nickname: form.nickname.trim(),
        installed_at: fromDateInput(form.installed_at),
        notes: form.notes,
        active: form.active,
        integration: form.integration || null,
        host: form.integration ? form.host.trim() || null : null,
        viz_enabled: form.viz_enabled,
      }
      let id = item?.id
      if (isEdit) {
        await api.updateEquipment(id, payload)
      } else {
        const created = await api.createEquipment({ tank_id: tank.id, ...payload })
        id = created.id
      }
      if (file && id) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('tank_id', String(tank.id))
        fd.append('linked_type', 'equipment')
        fd.append('linked_id', String(id))
        await api.uploadPhoto(fd)
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${titleFor(item)}”? This removes the record and its photo.`)) return
    setSaving(true)
    try {
      await api.deleteEquipment(item.id)
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title">{isEdit ? 'Edit equipment' : 'Add equipment'}</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="form-field">
          <label className="form-label">Type</label>
          <select className="select-input" value={form.type} onChange={set('type')}>
            {EQUIPMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">Brand</label>
          <input className="text-input" autoFocus value={form.brand} onChange={set('brand')} placeholder="e.g. Red Sea" />
        </div>
        <div className="form-field">
          <label className="form-label">Model</label>
          <input className="text-input" value={form.model} onChange={set('model')} placeholder="e.g. ReefLED 90" />
        </div>
        <div className="form-field">
          <label className="form-label">Nickname <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>(optional)</span></label>
          <input className="text-input" value={form.nickname} onChange={set('nickname')} placeholder="e.g. the light over the frag rack" />
        </div>
        <div className="form-field">
          <label className="form-label">Installed <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>(optional)</span></label>
          <input className="text-input" type="date" value={form.installed_at} onChange={set('installed_at')} />
        </div>
        <div className="form-field">
          <label className="form-label">Notes</label>
          <textarea className="textarea-input" value={form.notes} onChange={set('notes')} placeholder="Settings, warranty, quirks…" />
        </div>
        <div className="form-field">
          <label className="form-label">
            Live integration <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>(Red Sea ReefBeat)</span>
          </label>
          <select className="select-input" value={form.integration} onChange={set('integration')}>
            {EQUIPMENT_INTEGRATIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {form.integration ? (
          <>
            <div className="form-field">
              <label className="form-label">Device address <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>(IP or hostname on your LAN)</span></label>
              <input className="text-input" value={form.host} onChange={set('host')} placeholder="e.g. 192.168.1.42" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', marginBottom: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.viz_enabled}
                onChange={(e) => setForm((f) => ({ ...f, viz_enabled: e.target.checked }))}
              />
              Show live status {form.host ? '' : '(add an address to start polling)'}
            </label>
          </>
        ) : null}

        <div className="form-field">
          <label className="form-label">Photo</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>

        {isEdit ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)', marginBottom: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: !e.target.checked }))}
            />
            Retired / no longer in use
          </label>
        ) : null}

        <button className="save-btn" style={{ marginTop: 2 }} disabled={saving || !valid} onClick={save}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to tank'}
        </button>

        {isEdit ? (
          <button className="link-btn" style={{ marginTop: 12 }} disabled={saving} onClick={remove}>
            Delete record
          </button>
        ) : null}
      </div>
    </div>
  )
}
