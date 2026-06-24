import { useEffect, useState } from 'react'
import { useTank } from '../TankContext.jsx'
import { api } from '../api.js'

function Chip({ on }) {
  return (
    <span
      className="status-chip"
      style={on ? { color: 'var(--teal)', background: 'var(--tealS)' } : { color: 'var(--ink2)', background: 'var(--card2)' }}
    >
      {on ? 'Configured' : 'Not set'}
    </span>
  )
}

// Parse a text field to a number or null (empty = no target / unbounded).
const num = (s) => (s === '' || s == null ? null : Number(s))
const str = (n) => (n == null ? '' : String(n))

export default function Settings() {
  const { tank, parameters, loading, error, refresh } = useTank()
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [notif, setNotif] = useState(null)
  const [ntfy, setNtfy] = useState({ ntfy_topic: '', ntfy_url: '' })
  const [ntfyMsg, setNtfyMsg] = useState(null)

  useEffect(() => {
    api.notificationsStatus().then(setNotif).catch(() => setNotif(null))
    api
      .getNotificationSettings()
      .then((s) => setNtfy({ ntfy_topic: s.ntfy_topic || '', ntfy_url: s.ntfy_url || '' }))
      .catch(() => {})
  }, [])

  async function saveNtfy() {
    setBusy(true)
    setNtfyMsg(null)
    try {
      const s = await api.saveNotificationSettings(ntfy)
      setNtfy({ ntfy_topic: s.ntfy_topic || '', ntfy_url: s.ntfy_url || '' })
      setNotif(await api.notificationsStatus())
      setNtfyMsg({ ok: true, text: 'Saved.' })
    } catch (e) {
      setNtfyMsg({ ok: false, text: `Save failed: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  // Persist the current fields, then fire a real test push so the button always
  // tests exactly what's in the boxes.
  async function testNtfy() {
    setBusy(true)
    setNtfyMsg(null)
    try {
      await api.saveNotificationSettings(ntfy)
      setNotif(await api.notificationsStatus())
      const r = await api.testNotification()
      setNtfyMsg({ ok: r.ok, text: r.detail })
    } catch (e) {
      setNtfyMsg({ ok: false, text: `Test failed: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  // Local editable copy; resync whenever the shared parameter list changes.
  useEffect(() => {
    setRows(parameters.map((p) => ({ ...p })))
  }, [parameters])

  const edit = (id, key, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)))

  const dirty = (row) => {
    const orig = parameters.find((p) => p.id === row.id)
    return orig && JSON.stringify({ n: orig.name, u: orig.unit, mn: orig.target_min, mx: orig.target_max }) !==
      JSON.stringify({ n: row.name, u: row.unit, mn: num(str(row.target_min)), mx: num(str(row.target_max)) })
  }

  async function saveRow(row) {
    setBusy(true)
    try {
      await api.updateParameter(row.id, {
        name: row.name,
        unit: row.unit,
        target_min: num(str(row.target_min)),
        target_max: num(str(row.target_max)),
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function removeRow(row) {
    setBusy(true)
    try {
      await api.deactivateParameter(row.id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function addRow() {
    if (!tank) return
    setBusy(true)
    try {
      await api.createParameter({
        tank_id: tank.id,
        name: 'New parameter',
        unit: '',
        target_min: null,
        target_max: null,
        display_order: rows.length,
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  return (
    <div className="content rtscroll">
      <div className="log-wrap">
        {tank ? (
          <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 13 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{tank.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
                {tank.volume_gal} gal · {tank.notes}
              </div>
            </div>
          </div>
        ) : null}

        <div className="eyebrow" style={{ margin: '4px 2px 10px' }}>Parameters &amp; target ranges</div>
        <div className="card">
          {rows.map((row) => (
            <div className="setting-row" key={row.id}>
              <input className="mini-input name" value={row.name} onChange={(e) => edit(row.id, 'name', e.target.value)} />
              <input className="mini-input unit" placeholder="unit" value={row.unit} onChange={(e) => edit(row.id, 'unit', e.target.value)} />
              <input className="mini-input" type="number" placeholder="min" value={str(row.target_min)} onChange={(e) => edit(row.id, 'target_min', e.target.value)} />
              <span style={{ color: 'var(--ink3)' }}>–</span>
              <input className="mini-input" type="number" placeholder="max" value={str(row.target_max)} onChange={(e) => edit(row.id, 'target_max', e.target.value)} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {dirty(row) ? (
                  <button className="link-btn" style={{ color: 'var(--teal)' }} disabled={busy} onClick={() => saveRow(row)}>
                    Save
                  </button>
                ) : null}
                <button className="link-btn" disabled={busy} onClick={() => removeRow(row)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button className="ghost-btn" disabled={busy} onClick={addRow}>
            + Add parameter
          </button>
        </div>

        <div className="eyebrow" style={{ margin: '20px 2px 10px' }}>Notifications</div>
        <div className="card" style={{ padding: 0 }}>
          <div className="notif-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Email</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>SMTP · set SMTP_HOST / SMTP_TO</div>
            </div>
            <Chip on={!!notif?.email} />
          </div>
          <div className="notif-row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Push (ntfy)</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                  Subscribe to this topic in the ntfy phone app to get push reminders
                </div>
              </div>
              <Chip on={!!notif?.ntfy} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="mini-input"
                style={{ flex: '2 1 220px' }}
                placeholder="topic name (e.g. reef-tank-7fa982cf3493e27e)"
                value={ntfy.ntfy_topic}
                onChange={(e) => setNtfy({ ...ntfy, ntfy_topic: e.target.value })}
              />
              <input
                className="mini-input"
                style={{ flex: '1 1 150px' }}
                placeholder="https://ntfy.sh"
                value={ntfy.ntfy_url}
                onChange={(e) => setNtfy({ ...ntfy, ntfy_url: e.target.value })}
              />
              <button className="link-btn" style={{ color: 'var(--teal)' }} disabled={busy} onClick={saveNtfy}>
                Save
              </button>
              <button className="ghost-btn" disabled={busy} onClick={testNtfy}>
                Send test
              </button>
            </div>
            {ntfyMsg ? (
              <div style={{ fontSize: 11.5, marginTop: 8, color: ntfyMsg.ok ? 'var(--teal)' : 'var(--coral)' }}>
                {ntfyMsg.text}
              </div>
            ) : null}
          </div>
          <div className="notif-row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Calendar (iCal)</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Subscribe Google/Apple Calendar to this feed</div>
              </div>
              <span className="status-chip" style={{ color: 'var(--blue)', background: 'var(--blueS)' }}>Always on</span>
            </div>
            <div className="code-url">{notif?.calendar_url || '/calendar.ics'}</div>
          </div>
        </div>

        <div className="eyebrow" style={{ margin: '20px 2px 10px' }}>Maintenance tasks</div>
        <div className="card" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
          Manage cadence and mark tasks done on the <strong style={{ color: 'var(--ink)' }}>Tasks</strong> screen.
        </div>
      </div>
    </div>
  )
}
