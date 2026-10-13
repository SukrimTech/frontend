/*
  The Load forecast page's charts, drawn as the design draws them (Load Forecast.dc.html): plain
  SVG on a fixed viewBox that scales with its container, ink lines, mint bands, one shared
  crosshair. Every mark is a value from the snapshot; nothing here computes a forecast.

  Time is milliseconds (UTC); labels are local to the country (`tz`).
*/

import { local, nice } from './time.js'

const pth = (pts) => (pts.length ? 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') : '')
const fin = (v) => typeof v === 'number' && Number.isFinite(v)

/** Grid times inside [t0, t1] that fall on a local hour divisible by `every`. */
function hourTicks(t0, t1, tz, every) {
  const out = []
  const start = Math.ceil(t0 / 1.8e6) * 1.8e6
  for (let t = start; t <= t1; t += 1.8e6) {
    const l = local(t, tz)
    if (l.m === 0 && l.h % every === 0) out.push({ t, ...l, major: l.h === 0 })
  }
  return out
}

function nearest(times, t) {
  let best = -1
  let d = Infinity
  for (let i = 0; i < times.length; i += 1) {
    const e = Math.abs(times[i] - t)
    if (e < d) { d = e; best = i }
  }
  return best < 0 ? null : times[best]
}

/* --- the main load chart ---------------------------------------------------------- */

const W = 1200
const H = 400
const L = 48
const R = 8
const T = 12
const B = 32

/**
 * hist   [{t, v}]                      published load (MW)
 * fc     [{t, v, p10, p25, p75, p90}]  the forecast (MW)
 * op     [{t, v}]                      the grid operator's forecast (MW), may be empty
 */
export function LoadChart({ tz, t0, t1, now, hist, fc, op, hover, onHover, peak }) {
  const all = [...hist.map((p) => p.v), ...fc.map((p) => p.p10), ...fc.map((p) => p.p90), ...op.map((p) => p.v)]
    .filter(fin).map((v) => v / 1000)
  if (!all.length) return <p className="lf-empty">No data yet.</p>
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  const st = nice((hi - lo) / 4 || 1)
  lo = Math.floor(lo / st) * st
  hi = Math.ceil(hi / st) * st
  if (hi === lo) hi = lo + st
  const PW = W - L - R
  const PH = H - T - B
  const X = (t) => L + ((t - t0) / (t1 - t0)) * PW
  const Y = (mw) => T + (1 - (mw / 1000 - lo) / (hi - lo)) * PH
  const yTicks = []
  for (let v = lo; v <= hi + 1e-9; v += st) yTicks.push(v)
  const xTicks = hourTicks(t0, t1, tz, 6)
  const band = (a, b) => pth([...fc.filter((p) => fin(p[a])).map((p) => [X(p.t), Y(p[a])]),
    ...fc.filter((p) => fin(p[b])).slice().reverse().map((p) => [X(p.t), Y(p[b])])]) + 'Z'
  const line = (pts) => pth(pts.filter((p) => fin(p.v)).map((p) => [X(p.t), Y(p.v)]))
  const lastHist = hist.at(-1)
  const fcLine = lastHist && fc.length && fc[0].t > lastHist.t ? [lastHist, ...fc] : fc
  const times = [...hist.map((p) => p.t), ...fc.map((p) => p.t)]

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + (((e.clientX - r.left) / r.width) * W - L) / PW * (t1 - t0)
    onHover(nearest(times, Math.max(t0, Math.min(t1, t))))
  }

  let tip = null
  if (hover != null) {
    const f = fc.find((p) => p.t === hover)
    const h = hist.find((p) => p.t === hover)
    const p = h || f
    if (p && fin(p.v)) {
      const hx = X(p.t)
      const hy = Y(p.v)
      tip = { hx, hy, p, isFc: !h, right: hx > W * 0.7 }
    }
  }
  const nl = local(now, tz)

  return (
    <div className="lf-chart">
      <div className="lf-chart-in">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => onHover(null)}
           role="img" aria-label="Load and forecast">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R + 0} y1={Y(v * 1000)} y2={Y(v * 1000)} className="g" />
            <text x={L - 8} y={Y(v * 1000) + 4} textAnchor="end">{st < 1 ? v.toFixed(1) : Math.round(v)}</text>
          </g>
        ))}
        {xTicks.filter((x) => x.major).map((x) => (
          <line key={x.t} x1={X(x.t)} x2={X(x.t)} y1={T} y2={H - B} className="d" />
        ))}
        {fc.length > 0 && <path d={band('p90', 'p10')} className="b80" />}
        {fc.length > 0 && <path d={band('p75', 'p25')} className="b50" />}
        {op.length > 0 && <path d={line(op)} className="op" />}
        <path d={line(hist)} className="act" />
        <path d={line(fcLine)} className="fc" />
        <line x1={X(now)} x2={X(now)} y1={4} y2={H - B} className="now" />
        <text x={X(now) + 6} y={8} className="nowl">NOW {nl.hm}</text>
        {peak && fin(peak.v) && <circle cx={X(peak.t)} cy={Y(peak.v)} r="5" className="pk" />}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
        {xTicks.map((x) => (
          <text key={x.t} x={X(x.t)} y={H - 10} textAnchor="middle" fontWeight={x.major ? 600 : 400}>
            {x.major ? x.day : x.hm}
          </text>
        ))}
        {tip && (
          <g>
            <line x1={tip.hx} x2={tip.hx} y1={T} y2={H - B} className="cross" />
            <circle cx={tip.hx} cy={tip.hy} r="5.5" className="hdot" />
          </g>
        )}
      </svg>
      {tip && (
        <div className="lf-tip" style={{ left: `${(tip.hx / W) * 100}%`, top: `${(tip.hy / H) * 100}%`,
          transform: tip.right ? 'translate(calc(-100% - 14px),-50%)' : 'translate(14px,-50%)' }}>
          <span>{local(tip.p.t, tz).day} {local(tip.p.t, tz).hm}</span>
          <b>{(tip.p.v / 1000).toFixed(2)} GW</b>
          <span>{tip.isFc && fin(tip.p.p10) ? `P10–P90 ${(tip.p.p10 / 1000).toFixed(2)}–${(tip.p.p90 / 1000).toFixed(2)}` : 'actual'}</span>
        </div>
      )}
      </div>
    </div>
  )
}

/* --- the small input charts --------------------------------------------------------- */

const MW_ = 300
const ML = 32
const MR = 4
const MT = 6
const MB = 20
const MH = 120

export function MiniChart({ tz, t0, t1, now, lines: raw, hover, onHover }) {
  // only the chart's window (Switzerland's window starts at the forecast)
  const lines = raw.map((l) => ({ ...l, points: l.points.filter((p) => p.t >= t0 && p.t <= t1) }))
  const all = lines.flatMap((l) => l.points.map((p) => p.v)).filter(fin)
  if (!all.length) return null
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  const st = nice((hi - lo) / 2 || Math.abs(hi) / 2 || 1)
  lo = Math.floor(lo / st) * st
  hi = Math.ceil(hi / st) * st
  if (hi === lo) hi = lo + st
  const MPW = MW_ - ML - MR
  const X = (t) => ML + ((t - t0) / (t1 - t0)) * MPW
  const Y = (v) => MT + (1 - (v - lo) / (hi - lo)) * (MH - MT - MB)
  const ys = []
  for (let v = lo; v <= hi + 1e-9; v += st) ys.push(v)
  const fmtY = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : st < 1 ? v.toFixed(st < 0.1 ? 2 : 1) : String(Math.round(v)))
  const days = hourTicks(t0, t1, tz, 24)
  const times = lines[0].points.map((p) => p.t)
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + (((e.clientX - r.left) / r.width) * MW_ - ML) / MPW * (t1 - t0)
    onHover(nearest(times, Math.max(t0, Math.min(t1, t))))
  }
  const hp = hover != null ? lines[0].points.find((p) => p.t === hover) : null
  return (
    <svg viewBox={`0 0 ${MW_} ${MH}`} onMouseMove={move} onMouseLeave={() => onHover(null)} className="lf-mini"
         role="img" aria-label="input">
      {ys.map((v) => (
        <g key={v}>
          <line x1={ML} x2={MW_ - MR} y1={Y(v)} y2={Y(v)} className="g" />
          <text x={ML - 5} y={Y(v) + 4} textAnchor="end">{fmtY(v)}</text>
        </g>
      ))}
      {days.map((d) => <line key={d.t} x1={X(d.t)} x2={X(d.t)} y1={MT} y2={MH - MB} className="d" />)}
      <rect x={X(now)} y={MT} width={Math.max(0, X(t1) - X(now))} height={MH - MT - MB} className="fcz" />
      {lines.map((l) => (
        <path key={l.key} d={pth(l.points.filter((p) => fin(p.v)).map((p) => [X(p.t), Y(p.v)]))}
              className={l.dash ? 'ml dash' : 'ml'} />
      ))}
      <line x1={ML} x2={MW_ - MR} y1={MH - MB} y2={MH - MB} className="axis" />
      {days.map((d) => <text key={d.t} x={X(d.t)} y={MH - 6} textAnchor="middle">{d.day}</text>)}
      {hp && fin(hp.v) && (
        <g>
          <line x1={X(hp.t)} x2={X(hp.t)} y1={MT} y2={MH - MB} className="cross" />
          <circle cx={X(hp.t)} cy={Y(hp.v)} r="3.5" className="hdot" />
        </g>
      )}
    </svg>
  )
}

/* --- the daily score chart ------------------------------------------------------------ */

export function DailyChart({ days, key1, key2, tz }) {
  const DW = 560
  const DH = 220
  const v1 = days.map((d) => d[key1])
  const v2 = days.map((d) => d[key2])
  const all = [...v1, ...v2].filter(fin)
  if (!all.length) return <p className="lf-empty">—</p>
  const dst = nice(Math.max(...all) / 4)
  const dhi = Math.ceil(Math.max(...all) / dst) * dst || dst
  const n = days.length
  const DX = (i) => (n === 1 ? 302 : 72 + (i / (n - 1)) * 460)
  const DY = (v) => 10 + (1 - v / dhi) * 180
  const yt = []
  for (let v = 0; v <= dhi + 1e-9; v += dst) yt.push(v)
  const ln = (vals) => pth(vals.map((v, i) => [DX(i), v]).filter(([, v]) => fin(v)).map(([x, v]) => [x, DY(v)]))
  const lab = (d) => local(Date.parse(`${d.day}T12:00:00Z`), tz).day
  return (
    <svg viewBox={`0 0 ${DW} ${DH}`} className="lf-daily" role="img" aria-label="Daily score">
      {yt.map((v) => (
        <g key={v}>
          <line x1="52" x2="552" y1={DY(v)} y2={DY(v)} className="g" />
          <text x="44" y={DY(v) + 4} textAnchor="end">{dst < 1 ? v.toFixed(1) : Math.round(v).toLocaleString('en-GB')}</text>
        </g>
      ))}
      <path d={ln(v2)} className="op" />
      <path d={ln(v1)} className="act" />
      {v1.map((v, i) => (fin(v) ? <circle key={i} cx={DX(i)} cy={DY(v)} r="3.5" className="dpt" /> : null))}
      <line x1="52" x2="552" y1="190" y2="190" className="axis" />
      {days.map((d, i) => <text key={d.day} x={DX(i)} y="210" textAnchor="middle">{lab(d)}</text>)}
    </svg>
  )
}

