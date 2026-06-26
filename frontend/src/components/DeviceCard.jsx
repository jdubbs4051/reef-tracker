import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

// Live-status card for a Red Sea ReefBeat device (EQUIPMENT_INTEGRATION_PLAN §4.5).
// Reads the backend status cache; the backend poller keeps it fresh, we just refetch.

const REFRESH_MS = 30000

// Per-device color accent (plan §4.5): amber = light, blue = ATO, teal = wave,
// purple = doser.
const ACCENT = {
  reefbeat_led: { color: 'var(--amber)', soft: 'var(--amberS)' },
  reefbeat_ato: { color: 'var(--blue)', soft: 'var(--blueS)' },
  reefbeat_wave: { color: 'var(--teal)', soft: 'var(--tealS)' },
  reefbeat_dose: { color: 'var(--purple)', soft: 'var(--purpleS)' },
}

const LOW_CONTAINER_DAYS = 7 // remaining-days threshold for a low-container warning

// ReefWave direction codes → plain words (wave *type* codes stay as-is, honestly).
const WAVE_DIR = { alt: 'alternating', fw: 'forward', rw: 'reverse' }

function titleFor(eq) {
  if (eq.nickname) return eq.nickname
  const bm = [eq.brand, eq.model].filter(Boolean).join(' ')
  return bm || eq.type
}

// "last seen 12m ago" — coarse, plain-language relative time.
function ago(iso) {
  if (!iso) return 'never'
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const pct = (v) => (v == null ? null : Math.max(0, Math.min(100, Math.round(v))))
const fmt = (v, unit = '') => (v == null ? '—' : `${Math.round(v)}${unit}`)

// Circular gauge ring. `value` 0–100, or null for an indeterminate/state ring.
function Gauge({ value, accent, label, sub, muted, size = 104 }) {
  const r = 42
  const c = 2 * Math.PI * r
  const filled = value == null ? 1 : value / 100
  const stroke = muted ? 'var(--ink3)' : accent.color
  const track = muted ? 'var(--line)' : accent.soft
  const sw = size < 80 ? 11 : 9
  return (
    <div className="dev-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={sw} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - filled)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="dev-gauge-center">
        <div className={size < 80 ? 'dev-gauge-val sm' : 'dev-gauge-val'} style={{ color: muted ? 'var(--ink3)' : 'var(--ink)' }}>{label}</div>
        {sub ? <div className="dev-gauge-sub">{sub}</div> : null}
      </div>
    </div>
  )
}

function StatRow({ k, v }) {
  return (
    <div className="dev-stat">
      <span className="dev-stat-k">{k}</span>
      <span className="dev-stat-v">{v}</span>
    </div>
  )
}

const headPct = (h) => (h.daily_ml ? Math.min(100, Math.round(((h.dosed_ml || 0) / h.daily_ml) * 100)) : null)
const lowContainer = (heads) => heads.some((h) => h.remaining_days != null && h.remaining_days < LOW_CONTAINER_DAYS)

// One doser head: a small ring of today's dose delivered + supplement + ml + days left.
function DoseHead({ h, accent, muted }) {
  const p = headPct(h)
  const low = h.remaining_days != null && h.remaining_days < LOW_CONTAINER_DAYS
  return (
    <div className="dose-head">
      <Gauge value={p} accent={accent} label={p == null ? '—' : `${p}%`} muted={muted} size={58} />
      <div className="dose-head-name" title={h.supplement || `Head ${h.n}`}>{h.supplement || `Head ${h.n}`}</div>
      <div className="dose-head-ml">{fmt(h.dosed_ml)} / {fmt(h.daily_ml)} ml</div>
      {h.remaining_days != null ? (
        <div className="dose-head-days" style={low ? { color: 'var(--coral)' } : undefined}>
          {Math.round(h.remaining_days)}d left
        </div>
      ) : null}
    </div>
  )
}

// Normalize a device's status into { value, label, sub, stats[], pill } for rendering.
// (The doser uses a multi-head body in the full card; this summary feeds the compact
// mini-card and its pill.)
function viewFor(eq, s) {
  const online = s.online
  if (eq.integration === 'reefbeat_dose') {
    const heads = s.heads || []
    const done = heads.filter((h) => h.daily_ml && (h.dosed_ml || 0) >= h.daily_ml).length
    const overall = heads.length
      ? Math.round((heads.reduce((a, h) => a + (h.daily_ml ? Math.min(1, (h.dosed_ml || 0) / h.daily_ml) : 0), 0) / heads.length) * 100)
      : null
    return {
      value: overall,
      label: heads.length ? `${done}/${heads.length}` : '—',
      sub: 'heads dosed',
      stats: heads.map((h) => [h.supplement || `Head ${h.n}`, `${fmt(h.dosed_ml)} / ${fmt(h.daily_ml)} ml`]),
      pill: online ? (lowContainer(heads) ? 'low container' : 'on schedule') : 'offline',
    }
  }
  if (eq.integration === 'reefbeat_led') {
    const intensity = pct(s.intensity ?? Math.max(s.white ?? 0, s.blue ?? 0))
    return {
      value: intensity,
      label: intensity == null ? '—' : `${intensity}%`,
      sub: 'intensity',
      stats: [
        ['LED temp', fmt(s.temperature, '°C')],
        ['Fan', fmt(s.fan, '%')],
        ['White / Blue', `${fmt(s.white)} / ${fmt(s.blue)}`],
        ['Moon', fmt(s.moon, '%')],
      ],
      pill: online ? (s.status === 'on' ? 'lights on' : 'lights off') : 'offline',
    }
  }
  if (eq.integration === 'reefbeat_wave') {
    const pump = pct(s.pump_pct)
    return {
      value: pump,
      label: pump == null ? '—' : `${pump}%`,
      sub: 'pump',
      stats: [
        ['Pattern', s.wave_type ? String(s.wave_type).toUpperCase() : '—'],
        ['Direction', s.direction ? (WAVE_DIR[s.direction] || s.direction) : '—'],
        ['Reverse', fmt(s.reverse_pct, '%')],
        ['Source', s.data_source || 'local'],
      ],
      pill: online ? 'limited · no cloud' : 'offline',
    }
  }
  // reefbeat_ato
  const ok = (s.water_level ?? '').toString().toLowerCase() === 'ok'
  return {
    value: s.water_level == null ? null : ok ? 100 : 18, // state ring, not a true %
    label: s.volume_left == null ? (ok ? 'OK' : 'LOW') : `${Math.round(s.volume_left)}`,
    sub: s.volume_left == null ? 'reservoir' : 'ml left',
    stats: [
      ['Reservoir', s.water_level ? String(s.water_level) : '—'],
      ['Auto-fill', s.pump_state ? String(s.pump_state) : '—'],
      ['Fills today', fmt(s.today_fills)],
      ['Used today', fmt(s.today_volume_usage, ' ml')],
    ],
    pill: online ? (ok ? 'level OK' : 'reservoir low') : 'offline',
  }
}

export default function DeviceCard({ eq, onEdit, compact = false, onClick }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef(null)
  const accent = ACCENT[eq.integration] || { color: 'var(--teal)', soft: 'var(--tealS)' }

  useEffect(() => {
    let alive = true
    async function tick() {
      try {
        const s = await api.equipmentStatus(eq.id)
        if (alive) setStatus(s)
      } catch {
        if (alive) setStatus({ online: false })
      } finally {
        if (alive) setLoading(false)
      }
    }
    tick()
    timer.current = setInterval(tick, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer.current)
    }
  }, [eq.id])

  const title = titleFor(eq)
  const model = [eq.brand, eq.model].filter(Boolean).join(' ')

  // --- Non-gauge states ---
  if (status && status.viz_enabled === false) {
    return (
      <div className="dev-card dev-card-slim">
        <div className="dev-head">
          <div>
            <div className="dev-title">{title}</div>
            <div className="dev-model">{model}</div>
          </div>
          <button className="dev-edit" onClick={() => onEdit(eq)}>Edit</button>
        </div>
        <div className="dev-slim-note">live status off</div>
      </div>
    )
  }

  const online = !!status?.online
  const v = !loading && status && (status.online !== undefined) ? viewFor(eq, status) : null
  const needsHost = status?.needs_host
  const unsupported = status?.supported === false

  // Compact mini-card for the dashboard "Equipment status" strip (plan §4.7B):
  // one small gauge + headline, denser than the full Equipment-page card.
  if (compact) {
    return (
      <button className={`dev-mini${online ? '' : ' dev-card-off'}`} onClick={onClick} style={{ '--accent': accent.color }}>
        <div className="dev-mini-head">
          <span className="dev-mini-title">{title}</span>
          <span className={`dev-dot ${online ? 'on' : 'off'}`} title={online ? 'online' : 'offline'} />
        </div>
        {v ? (
          <Gauge value={v.value} accent={accent} label={v.label} sub={v.sub} muted={!online} size={68} />
        ) : (
          <div className="dev-mini-note">{loading ? 'checking…' : needsHost ? 'no address' : unsupported ? 'n/a' : '—'}</div>
        )}
        <span className={`dev-pill ${online ? 'on' : 'off'}`}>{v ? v.pill : 'offline'}</span>
      </button>
    )
  }

  return (
    <div className={`dev-card${online ? '' : ' dev-card-off'}`} style={{ '--accent': accent.color }}>
      <div className="dev-accent" style={{ background: accent.color }} />
      <div className="dev-head">
        <div>
          <div className="dev-title">{title}</div>
          <div className="dev-model">{model}</div>
        </div>
        <div className="dev-head-right">
          <span className={`dev-dot ${online ? 'on' : 'off'}`} title={online ? 'online' : 'offline'} />
          <button className="dev-edit" onClick={() => onEdit(eq)}>Edit</button>
        </div>
      </div>

      {loading ? (
        <div className="dev-slim-note">checking…</div>
      ) : needsHost ? (
        <div className="dev-slim-note">add a device address to start polling</div>
      ) : unsupported ? (
        <div className="dev-slim-note">live status for this device isn’t supported yet</div>
      ) : eq.integration === 'reefbeat_dose' && status?.heads ? (
        <>
          <div className="dose-heads">
            {status.heads.map((h) => (
              <DoseHead key={h.n} h={h} accent={accent} muted={!online} />
            ))}
          </div>
          <div className="dev-foot">
            <span className={`dev-pill ${online ? 'on' : 'off'}`}>{v ? v.pill : 'offline'}</span>
            {!online ? <span className="dev-seen">last seen {ago(status.last_seen)}</span> : null}
          </div>
        </>
      ) : v ? (
        <>
          <Gauge value={v.value} accent={accent} label={v.label} sub={v.sub} muted={!online} />
          <div className="dev-stats">
            {v.stats.map(([k, val]) => (
              <StatRow key={k} k={k} v={val} />
            ))}
          </div>
          <div className="dev-foot">
            <span className={`dev-pill ${online ? 'on' : 'off'}`}>{v.pill}</span>
            {!online ? <span className="dev-seen">last seen {ago(status.last_seen)}</span> : null}
          </div>
        </>
      ) : (
        <div className="dev-slim-note">no status</div>
      )}
    </div>
  )
}
