/*
  Apollo's figures: hand-written SVG, like Pythia's, sized to the pixels they occupy.

  The SVG is drawn at its container's measured width rather than scaled from a fixed viewBox, so
  a label is 10 px on a phone and on a 27-inch screen alike. Every mark is a point the snapshot
  carries; the chart draws, it never computes a quantity of its own (the only arithmetic is
  placing points and choosing round tick values).

  Marks follow one spec: 2 px lines, the uncertainty band as a wash of the forecast's own hue
  (two steps: P10–P90 lighter, P25–P75 darker), hairline solid gridlines, and the operator's
  forecast dashed — a dashed line reads as "someone's projection", which is exactly what it is.
  The hover layer is a crosshair that snaps to the nearest period and one tooltip that lists
  every series there, value first.
*/

import { useMemo, useState } from 'react'
import { isNum, localHour, localTime } from './format.js'
import { niceTicks, useWidth } from './geometry.js'

const PAD = { l: 46, r: 14, t: 14, b: 30 }

/** Hour ticks in the country's local time: every 3/6/12/24 h, whichever fits the width. */
function timeTicks(t0, t1, tz, width) {
  const spanH = (t1 - t0) / 3.6e6
  const maxTicks = Math.max(3, Math.floor(width / 78))
  const every = [3, 6, 12, 24, 48].find((h) => spanH / h <= maxTicks) || 48
  const out = []
  const start = Math.ceil(t0 / 3.6e6) * 3.6e6
  for (let t = start; t <= t1; t += 3.6e6) {
    const h = localHour(t, tz)
    if (every >= 24 ? h === 0 : h % every === 0) out.push({ t, midnight: h === 0 })
  }
  return out
}

function linePath(points, X, Y) {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!isNum(p.v)) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`
    pen = true
  }
  return d
}

function bandPath(points, X, Y) {
  // One closed shape per unbroken run of (lo, hi): upper edge forwards, lower edge back.
  const runs = []
  let run = []
  for (const p of points) {
    if (isNum(p.lo) && isNum(p.hi)) run.push(p)
    else if (run.length) { runs.push(run); run = [] }
  }
  if (run.length) runs.push(run)
  return runs.map((r) => {
    const up = r.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.hi).toFixed(1)}`).join('')
    const dn = [...r].reverse().map((p) => `L${X(p.t).toFixed(1)},${Y(p.lo).toFixed(1)}`).join('')
    return `${up}${dn}Z`
  }).join('')
}

/**
 * A time chart.
 *   lines   [{ key, label, cls, dash, points: [{ t (ms), v }] }]
 *   bands   [{ key, label, cls, points: [{ t, lo, hi }] }]
 *   markers [{ t, label }]
 * `fmt` formats a value for the tooltip and the axis (`axisFmt`).
 */
export function TimeChart({ tz, lines = [], bands = [], markers = [], height = 300, fmt, axisFmt,
  yLabel, ariaLabel, xDomain }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)

  const geo = useMemo(() => {
    const ts = new Set()
    let lo = Infinity
    let hi = -Infinity
    for (const l of lines) for (const p of l.points) {
      if (!isNum(p.v)) continue
      ts.add(p.t); lo = Math.min(lo, p.v); hi = Math.max(hi, p.v)
    }
    for (const b of bands) for (const p of b.points) {
      if (!isNum(p.lo) || !isNum(p.hi)) continue
      ts.add(p.t); lo = Math.min(lo, p.lo); hi = Math.max(hi, p.hi)
    }
    const times = [...ts].sort((a, b) => a - b)
    if (!times.length) return null
    const t0 = xDomain?.[0] ?? times[0]
    const t1 = xDomain?.[1] ?? times[times.length - 1]
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
    const yt = niceTicks(lo - pad, hi + pad, height < 200 ? 3 : 5)
    const ylo = Math.min(yt[0], lo - pad)
    const yhi = Math.max(yt[yt.length - 1], hi + pad)
    const X = (t) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (width - PAD.l - PAD.r)
    const Y = (v) => height - PAD.b - ((v - ylo) / (yhi - ylo)) * (height - PAD.t - PAD.b)
    return { times: times.filter((t) => t >= t0 && t <= t1), t0, t1, X, Y, yt: yt.filter((v) => v >= ylo && v <= yhi) }
  }, [lines, bands, width, height, xDomain])

  if (!geo) return <div ref={ref} className="ap-chart-wrap"><p className="ap-chart-empty">No data to draw.</p></div>
  const { times, t0, t1, X, Y, yt } = geo
  const xt = timeTicks(t0, t1, tz, width)

  const pick = (clientX) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || !times.length) return
    const t = t0 + ((clientX - box.left - PAD.l) / (width - PAD.l - PAD.r)) * (t1 - t0)
    let best = 0
    for (let i = 1; i < times.length; i += 1) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i
    setHover(best)
  }
  const onKey = (e) => {
    if (!times.length) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setHover((h) => Math.min(times.length - 1, Math.max(0, (h ?? (d > 0 ? -1 : times.length)) + d)))
    }
    if (e.key === 'Escape') setHover(null)
  }

  const ht = hover != null ? times[hover] : null
  // The nearest point within 16 min: series need not share one grid (RTE's forecast is
  // quarter-hourly, the load half-hourly, Switzerland hourly).
  const valueAt = (pts, t) => {
    let lo = 0
    let hi = pts.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pts[mid].t < t) lo = mid + 1
      else hi = mid
    }
    const near = [pts[lo - 1], pts[lo]].filter(Boolean)
      .reduce((b, p) => (!b || Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), null)
    return near && Math.abs(near.t - t) <= 16 * 60000 ? near : null
  }
  const tipRows = ht == null ? [] : [
    ...lines.map((l) => ({ key: l.key, cls: l.cls, dash: l.dash, label: l.label, p: valueAt(l.points, ht) }))
      .filter((r) => r.p && isNum(r.p.v))
      .map((r) => ({ ...r, value: fmt(r.p.v) })),
    ...bands.map((b) => ({ key: b.key, cls: b.cls, band: true, label: b.label, p: valueAt(b.points, ht) }))
      .filter((r) => r.p && isNum(r.p.lo))
      .map((r) => ({ ...r, value: `${fmt(r.p.lo)} – ${fmt(r.p.hi)}` })),
  ]
  const tipLeft = ht != null ? X(ht) : 0
  const flip = tipLeft > width * 0.6

  return (
    <div ref={ref} className="ap-chart-wrap" onPointerMove={(e) => pick(e.clientX)}
         onPointerLeave={() => setHover(null)}>
      <svg className="ap-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
           role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}>
        <g className="ap-axis">
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={width - PAD.r} y1={Y(v)} y2={Y(v)} className="grid" />
              <text x={PAD.l - 7} y={Y(v) + 3.5} textAnchor="end">{axisFmt ? axisFmt(v) : v}</text>
            </g>
          ))}
          {xt.map(({ t, midnight }) => (
            <g key={`x${t}`}>
              <line x1={X(t)} x2={X(t)} y1={PAD.t} y2={height - PAD.b} className={midnight ? 'day' : 'grid-x'} />
              <text x={X(t)} y={height - PAD.b + 16} textAnchor="middle">
                {midnight ? localTime(t, tz, { zone: false }).slice(0, 3) : localTime(t, tz, { day: false, zone: false })}
              </text>
            </g>
          ))}
          <line x1={PAD.l} x2={width - PAD.r} y1={height - PAD.b} y2={height - PAD.b} className="rule" />
          {yLabel && <text x={PAD.l - 7} y={PAD.t - 3} textAnchor="end" className="unit">{yLabel}</text>}
        </g>
        {bands.map((b) => <path key={b.key} d={bandPath(b.points, X, Y)} className={`ap-band ${b.cls}`} />)}
        {markers.map((m) => (
          <g key={`m${m.t}`} className="ap-marker">
            <line x1={X(m.t)} x2={X(m.t)} y1={PAD.t} y2={height - PAD.b} />
            <text x={X(m.t) + 4} y={PAD.t + 9}>{m.label}</text>
          </g>
        ))}
        {lines.map((l) => (
          <path key={l.key} d={linePath(l.points, X, Y)} className={`ap-line ${l.cls}${l.dash ? ' dash' : ''}`} />
        ))}
        {ht != null && (
          <g className="ap-cross">
            <line x1={X(ht)} x2={X(ht)} y1={PAD.t} y2={height - PAD.b} />
            {tipRows.filter((r) => !r.band).map((r) => (
              <circle key={r.key} cx={X(ht)} cy={Y(r.p.v)} r="4" className={`ap-dot ${r.cls}`} />
            ))}
          </g>
        )}
      </svg>
      {ht != null && tipRows.length > 0 && (
        <div className="ap-tip" style={{ left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined }}>
          <div className="ap-tip-time">{localTime(ht, tz)}</div>
          {tipRows.map((r) => (
            <div key={r.key} className="ap-tip-row">
              <i className={`ap-key ${r.cls}${r.band ? ' band' : ''}${r.dash ? ' dash' : ''}`} />
              <b>{r.value}</b>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** A legend that mirrors the marks: a line for a line, a swatch for a band. */
export function Legend({ items }) {
  return (
    <ul className="ap-legend">
      {items.map((it) => (
        <li key={it.key}>
          <i className={`ap-key ${it.cls}${it.band ? ' band' : ''}${it.dash ? ' dash' : ''}`} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

/** A tiny trend: what was published (muted) and what Apollo forecasts (the forecast hue). */
export function Sparkline({ past = [], future = [], width = 320, height = 34 }) {
  const all = [...past, ...future].filter((p) => isNum(p.v))
  if (all.length < 2) return <svg className="ap-spark" height={height} aria-hidden="true" />
  const t0 = all[0].t
  const t1 = all[all.length - 1].t
  const lo = Math.min(...all.map((p) => p.v))
  const hi = Math.max(...all.map((p) => p.v))
  const X = (t) => 2 + ((t - t0) / Math.max(1, t1 - t0)) * (width - 4)
  const Y = (v) => height - 3 - ((v - lo) / Math.max(1, hi - lo)) * (height - 6)
  const last = past.filter((p) => isNum(p.v)).at(-1)
  return (
    // Stretched to the card's width: the strokes keep their width (non-scaling-stroke), and the
    // "now" mark is a vertical tick rather than a dot, which a stretch would turn into an oval.
    <svg className="ap-spark" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={linePath(past, X, Y)} className="ap-line actual thin" vectorEffect="non-scaling-stroke" />
      <path d={linePath(future, X, Y)} className="ap-line fc thin" vectorEffect="non-scaling-stroke" />
      {last && <line x1={X(last.t)} x2={X(last.t)} y1={2} y2={height - 2} className="ap-spark-now" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
