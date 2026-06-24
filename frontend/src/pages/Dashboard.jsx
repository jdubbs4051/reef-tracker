import { useCallback, useEffect, useState } from 'react'
import { Pulse, Clock, Drop, Info, Plus, ChevUp, ChevDown, X, Wide } from '../icons.jsx'
import { Icon } from '../iconMap.jsx'
import TrendChart from '../components/TrendChart.jsx'
import TaskCalendar from '../components/TaskCalendar.jsx'
import { useTank } from '../TankContext.jsx'
import { api, fmt, rangeText, statusFor, dueInfo, agoLabel, CATEGORY_ICON } from '../api.js'

const STATUS_COLOR = { ok: 'var(--teal)', high: 'var(--coral)', low: 'var(--amber)', none: 'var(--ink3)' }

// Curated readings shown on the dashboard (short labels), matching the mockup.
const DASH = [
  ['Temperature', 'Temp'],
  ['Salinity', 'Salinity'],
  ['Alkalinity', 'Alk'],
  ['Nitrate', 'Nitrate'],
  ['Calcium', 'Calcium'],
  ['pH', 'pH'],
]

// Customizable widget types offered in the "Add widget" picker. The top-3 KPI
// row is fixed and not part of this list.
const WIDGET_META = {
  'latest-readings': 'Latest readings',
  'whats-due': "What's due",
  chart: 'Parameter chart',
  calendar: 'Task calendar',
  insight: 'Insight preview',
  activity: 'Recent activity',
}

// Widgets that read better across the full two-column width by default. Anything
// not listed starts one column wide; the user can toggle either way in edit mode.
const WIDE_BY_DEFAULT = new Set(['latest-readings', 'calendar', 'activity'])
const spanOf = (w) => w.options?.span ?? (WIDE_BY_DEFAULT.has(w.type) ? 2 : 1)

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)

function Reading({ label, param, value }) {
  const status = statusFor(value, param)
  const color = STATUS_COLOR[status]
  const offRange = status === 'high' || status === 'low'
  return (
    <div className="reading">
      <div className="reading-head">
        <span className="reading-name">{label}</span>
        <span className="dot" style={{ background: color }} />
      </div>
      <div className="reading-value mono">
        {fmt(value)}
        {param.unit ? <span className="unit">{param.unit}</span> : null}
      </div>
      <div className="reading-range" style={offRange ? { color } : undefined}>
        {rangeText(param)}
        {offRange ? ` · ${status}` : ''}
      </div>
    </div>
  )
}

const DUE_PALETTE = [
  { wrap: 'var(--blueS)', fg: 'var(--blue)' },
  { wrap: 'var(--tealS)', fg: 'var(--teal)' },
  { wrap: 'var(--card2)', fg: 'var(--ink2)' },
]

function DueItem({ task, info, idx }) {
  const tone = info.urgent ? { wrap: 'var(--coralS)', fg: 'var(--coral)' } : DUE_PALETTE[idx % DUE_PALETTE.length]
  return (
    <div className="due-item">
      <div className="due-icon" style={{ background: tone.wrap, color: tone.fg }}>
        <Icon name={CATEGORY_ICON[task.category] || 'list'} size={16} s={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="due-name">{task.name}</div>
      </div>
      <span
        className="tag"
        style={
          info.urgent
            ? { color: 'var(--coral)', background: 'var(--coralS)' }
            : { color: 'var(--ink2)', background: 'var(--card2)', fontWeight: 700 }
        }
      >
        {info.label}
      </span>
    </div>
  )
}

// How far a value sits outside its band, relative to band width. Zero-width bands
// (e.g. ammonia target 0–0) are treated as most severe when breached.
function severity({ param, value, status }) {
  const span = (param.target_max ?? 0) - (param.target_min ?? 0)
  if (status === 'high') {
    const over = value - (param.target_max ?? value)
    return span > 0 ? over / span : 999
  }
  if (status === 'low') {
    const under = (param.target_min ?? value) - value
    return span > 0 ? under / span : 999
  }
  return 0
}

// Rule-based, advisory-only reading of the tank — the LFS voice, no dosing math.
function buildInsight(parameters, latest) {
  const issues = parameters
    .filter((p) => latest[p.id] != null)
    .map((p) => ({ param: p, value: latest[p.id], status: statusFor(latest[p.id], p) }))
    .filter((x) => x.status === 'high' || x.status === 'low')
    .sort((a, b) => severity(b) - severity(a))

  if (issues.length === 0) {
    return {
      heading: 'Looking steady',
      tone: 'var(--teal)',
      body: "Everything's sitting in range. Nothing to chase — keep your routine steady and let the tank do its thing.",
    }
  }
  const { param, value, status } = issues[0]
  const u = param.unit ? ` ${param.unit}` : ''
  const dir = status === 'high' ? 'a touch high' : 'running low'
  const others = issues.length - 1
  const more = others > 0 ? ` (${others} other${others > 1 ? 's' : ''} to glance at too)` : ''
  return {
    heading: 'Worth a look',
    tone: 'var(--blue)',
    body: `${param.name}'s ${dir} at ${fmt(value)}${u} — target ${rangeText(param)}${u}. Nothing to panic over${more}; watch it across your next couple of readings before changing anything.`,
  }
}

// --- Individual widget bodies (each renders its own card) ---

function ReadingsWidget({ readings, latest }) {
  return (
    <div className="card">
      <div className="card-title">Latest readings</div>
      <div className="readings">
        {readings.map((r) => (
          <Reading key={r.label} label={r.label} param={r.param} value={latest[r.param.id]} />
        ))}
      </div>
    </div>
  )
}

function ChartWidget({ widget, series, parameters, editing, onParam }) {
  const pid = widget.options?.parameter_id
  const s = series.find((x) => x.parameter_id === pid)
  const p = parameters.find((x) => x.id === pid)
  const steady = s && s.trend_label.startsWith('Steady')
  return (
    <div className="card">
      <div className="chart-head">
        <div style={{ minWidth: 0 }}>
          {editing ? (
            <select
              className="widget-select"
              value={pid ?? ''}
              onChange={(e) => onParam(Number(e.target.value))}
            >
              {parameters.map((pp) => (
                <option key={pp.id} value={pp.id}>
                  {pp.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{p ? p.name : 'Parameter'}</div>
          )}
          {s ? (
            <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 3 }}>
              {s.points.length}-week trend
              {s.target_min != null && s.target_max != null
                ? ` · target band ${fmt(s.target_min)}–${fmt(s.target_max)} ${s.unit}`
                : ''}
            </div>
          ) : null}
        </div>
        {s ? (
          <span
            className="pill"
            style={steady ? { color: 'var(--teal)', background: 'var(--tealS)' } : { color: 'var(--blue)', background: 'var(--blueS)' }}
          >
            {s.trend_label}
          </span>
        ) : null}
      </div>
      {s ? (
        <TrendChart
          compact
          data={{
            values: s.points.map((pt) => pt.value),
            dates: s.points.map((pt) => pt.measured_at),
            unit: s.unit,
            targetMin: s.target_min,
            targetMax: s.target_max,
          }}
        />
      ) : (
        <div style={{ height: 116, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ink3)' }}>
          No readings yet for this parameter.
        </div>
      )}
    </div>
  )
}

function DueWidget({ topDue }) {
  return (
    <div className="card">
      <div className="card-title">What's due</div>
      <div className="due-list">
        {topDue.length ? (
          topDue.map((d, i) => <DueItem key={d.task.id} task={d.task} info={d.info} idx={i} />)
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Nothing due — nicely on top of it.</div>
        )}
      </div>
    </div>
  )
}

function InsightWidget({ insight }) {
  return (
    <div className="insight">
      <div className="insight-head" style={{ color: insight.tone, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Info size={15} s={2} />
          <span>{insight.heading}</span>
        </span>
        <span className="status-chip" style={{ color: 'var(--ink2)', background: 'var(--card2)' }}>Preview</span>
      </div>
      <div className="insight-body">{insight.body}</div>
      <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 8 }}>
        Early rules-based preview — smarter trend advisories arrive in a later update.
      </div>
    </div>
  )
}

function ActivityWidget({ activity }) {
  return (
    <div className="card">
      <div className="card-title">Recent activity</div>
      <div className="activity">
        {activity.length ? (
          activity.map((a, i) => (
            <div className="activity-item" key={i}>
              <span className="dot" style={{ background: `var(--${a.color})` }} />
              <div>
                <div className="activity-name">{a.title}</div>
                <div className="activity-date">{agoLabel(a.at)}</div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No activity yet — log a reading to get started.</div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { tank, parameters, tasks, loading, error } = useTank()
  const [latest, setLatest] = useState({}) // parameter_id -> value
  const [lastLogged, setLastLogged] = useState(null)
  const [allSeries, setAllSeries] = useState([]) // ParameterSeries[] for chart widgets
  const [activity, setActivity] = useState([])
  const [widgets, setWidgets] = useState(null) // null = layout not loaded yet
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const byName = (name) => parameters.find((p) => p.name === name)

  useEffect(() => {
    if (!tank) return
    let cancelled = false
    ;(async () => {
      const [rows, acts, series, layout] = await Promise.all([
        api.latestReadings(tank.id),
        api.activity(tank.id),
        api.seriesAll(tank.id),
        api.getDashboardLayout(tank.id),
      ])
      if (cancelled) return
      setLatest(Object.fromEntries(rows.map((r) => [r.parameter_id, r.value])))
      const newest = rows.reduce((acc, r) => (acc && acc > r.measured_at ? acc : r.measured_at), null)
      setLastLogged(newest)
      setActivity(acts)
      setAllSeries(series)
      setWidgets(layout.widgets)
    })()
    return () => {
      cancelled = true
    }
  }, [tank])

  // Apply a layout change locally and persist it. Fail loudly per house style.
  const persist = useCallback(
    async (next) => {
      setWidgets(next)
      if (!tank) return
      try {
        setSaveError(null)
        await api.saveDashboardLayout(tank.id, next)
      } catch (e) {
        setSaveError(e.message)
      }
    },
    [tank]
  )

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= widgets.length) return
    const next = [...widgets]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }
  const remove = (i) => persist(widgets.filter((_, k) => k !== i))
  const toggleSpan = (i) => {
    const next = spanOf(widgets[i]) === 2 ? 1 : 2
    persist(widgets.map((w, k) => (k === i ? { ...w, options: { ...w.options, span: next } } : w)))
  }
  const setChartParam = (i, pid) =>
    persist(widgets.map((w, k) => (k === i ? { ...w, options: { ...w.options, parameter_id: pid } } : w)))
  const addWidget = (type) => {
    const options = type === 'chart' ? { parameter_id: parameters[0]?.id } : {}
    persist([...(widgets || []), { id: newId(), type, options }])
  }

  if (loading || widgets === null) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  const dueList = tasks.map((t) => ({ task: t, info: dueInfo(t.next_due_at) }))
  const dueToday = dueList.filter((d) => d.info.urgent).length
  const topDue = dueList.slice(0, 3)
  const readings = DASH.map(([name, label]) => ({ label, param: byName(name) })).filter((r) => r.param)

  // Tank status from how many parameters are out of range.
  const outOfRange = parameters.filter((p) => latest[p.id] != null && statusFor(latest[p.id], p) !== 'ok').length
  const tankStatus =
    outOfRange === 0
      ? { word: 'Stable', wrap: 'var(--tealS)', fg: 'var(--teal)' }
      : { word: `${outOfRange} to watch`, wrap: outOfRange > 2 ? 'var(--coralS)' : 'var(--amberS)', fg: outOfRange > 2 ? 'var(--coral)' : 'var(--amber)' }

  const insight = buildInsight(parameters, latest)

  function renderBody(w, i) {
    switch (w.type) {
      case 'latest-readings':
        return <ReadingsWidget readings={readings} latest={latest} />
      case 'chart':
        return (
          <ChartWidget
            widget={w}
            series={allSeries}
            parameters={parameters}
            editing={editing}
            onParam={(pid) => setChartParam(i, pid)}
          />
        )
      case 'whats-due':
        return <DueWidget topDue={topDue} />
      case 'calendar':
        return <TaskCalendar />
      case 'insight':
        return <InsightWidget insight={insight} />
      case 'activity':
        return <ActivityWidget activity={activity} />
      default:
        return (
          <div className="card" style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
            Unknown widget “{w.type}”.
          </div>
        )
    }
  }

  return (
    <div className="content rtscroll">
      <div className="kpi-row">
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: tankStatus.wrap, color: tankStatus.fg }}>
            <Pulse size={22} />
          </div>
          <div>
            <div className="kpi-label">Tank status</div>
            <div className="kpi-value">{tankStatus.word}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: 'var(--coralS)', color: 'var(--coral)' }}>
            <Clock size={22} />
          </div>
          <div>
            <div className="kpi-label">Due today</div>
            <div className="kpi-value">{dueToday} {dueToday === 1 ? 'task' : 'tasks'}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: 'var(--blueS)', color: 'var(--blue)' }}>
            <Drop size={22} s={1.8} />
          </div>
          <div>
            <div className="kpi-label">Last logged</div>
            <div className="kpi-value">{lastLogged ? agoLabel(lastLogged) : '—'}</div>
          </div>
        </div>
      </div>

      <div className="dash-toolbar">
        {saveError ? <span className="dash-save-error">Couldn’t save layout: {saveError}</span> : null}
        <button className={`pill-btn${editing ? ' active' : ''}`} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Customize'}
        </button>
      </div>

      <div className="widget-grid">
        {widgets.map((w, i) => {
          const wide = spanOf(w) === 2
          return (
            <div key={w.id} className={`widget${editing ? ' editing' : ''}${wide ? ' wide' : ''}`}>
              {editing ? (
                <div className="widget-tools">
                  <button
                    className={wide ? 'active' : ''}
                    onClick={() => toggleSpan(i)}
                    aria-label={wide ? 'Make one column wide' : 'Make two columns wide'}
                    title={wide ? 'Narrow (1 column)' : 'Widen (2 columns)'}
                  >
                    <Wide size={14} />
                  </button>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ChevUp size={14} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === widgets.length - 1} aria-label="Move down">
                    <ChevDown size={14} />
                  </button>
                  <button className="danger" onClick={() => remove(i)} aria-label="Remove widget">
                    <X size={14} />
                  </button>
                </div>
              ) : null}
              {renderBody(w, i)}
            </div>
          )
        })}

        {editing ? (
          <div className="widget-add">
            <div className="widget-add-title">
              <Plus size={15} /> Add a widget
            </div>
            <div className="widget-add-list">
              {Object.entries(WIDGET_META).map(([type, label]) => (
                <button key={type} className="pill-btn" onClick={() => addWidget(type)} disabled={type === 'chart' && parameters.length === 0}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
