// Line chart with a shaded target-range band, matching the mockup's look.
// Auto-scales the y-axis to fit both the data and the target band, so it renders
// cleanly for any parameter (values inside or outside the band).
//
// Hovering reveals the value (and date, when provided) at the nearest point. The
// tooltip is an HTML overlay rather than SVG text so it stays readable at any size.
import { useRef, useState } from 'react'

const fmtVal = (n) => (n == null ? '—' : String(n))
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function TrendChart({ data, compact = false }) {
  const { values, dates, unit = '', targetMin, targetMax } = data
  const ref = useRef(null)
  const [hover, setHover] = useState(null)

  // Compact charts (the all-parameter grid) use a smaller viewBox so strokes and
  // points stay crisp when scaled into a card; the full chart keeps its look.
  const W = compact ? 320 : 620
  const H = compact ? 116 : 170
  const TOP = compact ? 12 : 20
  const BOT = compact ? 100 : 150
  const PAD_X = compact ? 12 : 20

  if (!values || values.length === 0) {
    return (
      <div style={{ fontSize: compact ? 11 : 12, color: 'var(--ink3)', padding: compact ? '20px 0' : '24px 0' }}>
        No readings yet.
      </div>
    )
  }

  // Domain spans the data and the target band, with a little headroom.
  const candidates = [...values]
  if (targetMin != null) candidates.push(targetMin)
  if (targetMax != null) candidates.push(targetMax)
  let lo = Math.min(...candidates)
  let hi = Math.max(...candidates)
  if (hi === lo) hi = lo + 1 // avoid divide-by-zero (e.g. ammonia all 0)
  const pad = (hi - lo) * 0.12
  lo -= pad
  hi += pad

  const yFor = (v) => TOP + ((hi - v) / (hi - lo)) * (BOT - TOP)
  const xFor = (i) => (values.length === 1 ? W - PAD_X : PAD_X + (i / (values.length - 1)) * (W - 2 * PAD_X))

  const points = values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  const hasBand = targetMin != null && targetMax != null
  const bandTop = hasBand ? yFor(targetMax) : null
  const bandBot = hasBand ? yFor(targetMin) : null

  function onMove(e) {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const xUser = ((e.clientX - rect.left) / rect.width) * W
    let idx = 0
    let best = Infinity
    for (let i = 0; i < values.length; i++) {
      const d = Math.abs(xFor(i) - xUser)
      if (d < best) {
        best = d
        idx = i
      }
    }
    const px = Math.max(30, Math.min(rect.width - 30, (xFor(idx) / W) * rect.width))
    const py = (yFor(values[idx]) / H) * rect.height
    setHover({ idx, px, py })
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {hasBand && bandBot - bandTop > 0.5 ? (
          <rect x="0" y={bandTop} width={W} height={bandBot - bandTop} fill="var(--tealS)" opacity="0.7" />
        ) : null}
        {hasBand ? (
          <>
            <line x1="0" y1={bandTop} x2={W} y2={bandTop} stroke="var(--teal)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            <line x1="0" y1={bandBot} x2={W} y2={bandBot} stroke="var(--teal)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            {!compact ? (
              <>
                <text x="4" y={bandTop - 4} fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink3)">
                  {targetMax}
                </text>
                <text x="4" y={bandBot + 12} fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink3)">
                  {targetMin}
                </text>
              </>
            ) : null}
          </>
        ) : null}
        <polyline points={points} fill="none" stroke="var(--blue)" strokeWidth={compact ? 2.2 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
        {hover ? (
          <line x1={xFor(hover.idx)} y1={TOP} x2={xFor(hover.idx)} y2={BOT} stroke="var(--ink3)" strokeWidth="1" opacity="0.45" />
        ) : null}
        <circle cx={xFor(last)} cy={yFor(values[last])} r={compact ? 3.6 : 5} fill="var(--blue)" stroke="var(--card)" strokeWidth={compact ? 2 : 2.5} />
        {hover && hover.idx !== last ? (
          <circle cx={xFor(hover.idx)} cy={yFor(values[hover.idx])} r={compact ? 3.6 : 5} fill="var(--blue)" stroke="var(--card)" strokeWidth={compact ? 2 : 2.5} />
        ) : null}
      </svg>
      {hover ? (
        <div className="chart-tip" style={{ left: hover.px, top: hover.py }}>
          <span className="tip-val">
            {fmtVal(values[hover.idx])}
            {unit ? ` ${unit}` : ''}
          </span>
          {dates && dates[hover.idx] ? <span className="tip-date">{fmtDate(dates[hover.idx])}</span> : null}
        </div>
      ) : null}
      {!compact ? (
        <div className="chart-axis">
          <span>{values.length} wks ago</span>
          <span>now</span>
        </div>
      ) : null}
    </div>
  )
}
