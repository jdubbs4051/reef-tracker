import { useEffect, useState } from 'react'
import TrendChart from '../components/TrendChart.jsx'
import { useTank } from '../TankContext.jsx'
import { api, fmt, rangeText, statusFor } from '../api.js'

const STATUS_COLOR = { ok: 'var(--teal)', high: 'var(--coral)', low: 'var(--amber)', none: 'var(--ink3)' }

export default function Parameters() {
  const { tank, parameters, loading, error } = useTank()
  const [allSeries, setAllSeries] = useState([]) // ParameterSeries[] for every active param
  const [latest, setLatest] = useState({})

  useEffect(() => {
    if (!tank) return
    let cancelled = false
    api.latestReadings(tank.id).then((rows) => {
      if (!cancelled) setLatest(Object.fromEntries(rows.map((r) => [r.parameter_id, r.value])))
    })
    // One batched call gives every parameter its own series for the chart grid.
    api.seriesAll(tank.id).then((rows) => {
      if (!cancelled) setAllSeries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [tank])

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  return (
    <div className="content rtscroll">
      <div className="chart-grid">
        {parameters.map((p) => {
          const s = allSeries.find((x) => x.parameter_id === p.id)
          const v = latest[p.id]
          const status = statusFor(v, p)
          const steady = s && s.trend_label.startsWith('Steady')
          return (
            <div key={p.id} className="chart-card">
              <div className="chart-card-head">
                <div>
                  <div className="chart-card-name">
                    {p.name}
                    <span className="dot" style={{ background: STATUS_COLOR[status], marginLeft: 7 }} />
                  </div>
                  <div className="chart-card-target">
                    Target {rangeText(p) || '—'} {p.unit}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="chart-card-value mono">
                    {fmt(v)}
                    {p.unit ? <span className="chart-card-unit">{p.unit}</span> : null}
                  </div>
                  {s ? (
                    <span
                      className="pill"
                      style={
                        steady
                          ? { color: 'var(--teal)', background: 'var(--tealS)' }
                          : { color: 'var(--blue)', background: 'var(--blueS)' }
                      }
                    >
                      {s.trend_label}
                    </span>
                  ) : null}
                </div>
              </div>
              {s ? (
                <TrendChart
                  compact
                  data={{
                    values: s.points.map((pt) => pt.value),
                    dates: s.points.map((pt) => pt.measured_at),
                    unit: p.unit,
                    targetMin: s.target_min,
                    targetMax: s.target_max,
                  }}
                />
              ) : (
                <div style={{ height: 116, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ink3)' }}>
                  Loading…
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
