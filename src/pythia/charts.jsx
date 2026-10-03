/*
  Pythia's figures — grid-yukti's hand-written SVG charts, unchanged in what they draw.

  Every mark is one row the server returned, placed by its own fields. The histograms COUNT
  rows into bins and the per-placement bars AVERAGE a placement's own absolute errors: those
  two are drawing arithmetic over the returned rows, the same as grid-yukti's, and no figure
  invents a quantity the payload does not carry.
*/

export const PAD = { l: 54, r: 14, t: 14, b: 38 }

export function ticks(lo, hi, n = 4) {
  const out = []
  for (let i = 0; i <= n; i += 1) out.push(lo + ((hi - lo) * i) / n)
  return out
}

export function Axes({ w, h, xlo, xhi, ylo, yhi, xlabel, ylabel, fmt = (v) => v.toFixed(3), xfmt = null }) {
  const X = (v) => PAD.l + ((v - xlo) / (xhi - xlo)) * (w - PAD.l - PAD.r)
  const Y = (v) => h - PAD.b - ((v - ylo) / (yhi - ylo)) * (h - PAD.t - PAD.b)
  const fx = xfmt || fmt
  return (
    <g className="py-axis">
      {ticks(ylo, yhi).map((v, i) => (
        <g key={`y${i}`}>
          <line x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} className="grid" />
          <text x={PAD.l - 8} y={Y(v) + 3.5} textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
      {ticks(xlo, xhi).map((v, i) => (
        <text key={`x${i}`} x={X(v)} y={h - PAD.b + 15} textAnchor="middle">{fx(v)}</text>
      ))}
      <line x1={PAD.l} x2={w - PAD.r} y1={h - PAD.b} y2={h - PAD.b} className="rule" />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={h - PAD.b} className="rule" />
      <text x={(w + PAD.l) / 2} y={h - 4} textAnchor="middle" className="lab">{xlabel}</text>
      <text x={12} y={(h - PAD.b + PAD.t) / 2} className="lab" textAnchor="middle"
            transform={`rotate(-90 12 ${(h - PAD.b + PAD.t) / 2})`}>{ylabel}</text>
    </g>
  )
}

export function Figure({ title, note, children }) {
  return (
    <figure className="py-figure">
      <figcaption><b>{title}</b>{note && <span>{note}</span>}</figcaption>
      {children}
    </figure>
  )
}

/** Predicted against solved, with the limit on both axes — the quadrants ARE the confusion. */
export function ParityPlot({ rows, vmin, w = 470, h = 360 }) {
  if (!rows?.length) return null
  const t = rows.map((r) => r.q05_true)
  const p = rows.map((r) => r.q05_hat)
  const lo = Math.min(...t, ...p)
  const hi = Math.max(...t, ...p)
  const pad = (hi - lo) * 0.06 || 1e-4
  const [a, b] = [lo - pad, hi + pad]
  const X = (v) => PAD.l + ((v - a) / (b - a)) * (w - PAD.l - PAD.r)
  const Y = (v) => h - PAD.b - ((v - a) / (b - a)) * (h - PAD.t - PAD.b)
  return (
    <svg className="py-chart" viewBox={`0 0 ${w} ${h}`}>
      <Axes w={w} h={h} xlo={a} xhi={b} ylo={a} yhi={b}
            xlabel="solved q₀₅ (pu)" ylabel="predicted q̂₀₅ (pu)" />
      {vmin > a && vmin < b && (
        <g className="py-vmin">
          <line x1={X(vmin)} x2={X(vmin)} y1={PAD.t} y2={h - PAD.b} />
          <line x1={PAD.l} x2={w - PAD.r} y1={Y(vmin)} y2={Y(vmin)} />
        </g>
      )}
      <line className="py-diag" x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} />
      {rows.map((r, i) => (
        <circle key={i} cx={X(r.q05_true)} cy={Y(r.q05_hat)} r="2.4" className={`py-pt ${r.verdict}`} />
      ))}
    </svg>
  )
}

export function ErrorHistogram({ rows, w = 470, h = 200, bins = 24 }) {
  if (!rows?.length) return null
  const e = rows.map((r) => r.abs_err_mpu)
  const hi = Math.max(...e) || 1
  const counts = new Array(bins).fill(0)
  e.forEach((v) => { counts[Math.min(bins - 1, Math.floor((v / hi) * bins))] += 1 })
  return <Bars counts={counts} lo={0} hi={hi} w={w} h={h} xlabel="absolute error (mpu)" ylabel="rows" />
}

/** A histogram the SERVER already counted (`/envelope`'s `*_hist_mpu`). Drawn, not binned. */
export function ServerHistogram({ hist, xlabel, w = 470, h = 190 }) {
  if (!hist?.counts?.length) return null
  const lo = hist.edges[0]
  const hi = hist.edges[hist.edges.length - 1]
  return <Bars counts={hist.counts} lo={lo} hi={hi} w={w} h={h} xlabel={xlabel} ylabel="rows" />
}

function Bars({ counts, lo, hi, w, h, xlabel, ylabel }) {
  const top = Math.max(...counts) || 1
  const bw = (w - PAD.l - PAD.r) / counts.length
  const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1))
  return (
    <svg className="py-chart" viewBox={`0 0 ${w} ${h}`}>
      <Axes w={w} h={h} xlo={lo} xhi={hi} ylo={0} yhi={top} xlabel={xlabel} ylabel={ylabel}
            fmt={(v) => v.toFixed(0)} xfmt={fmt} />
      {counts.map((c, i) => (
        <rect key={i} className="py-bar" x={PAD.l + i * bw + 0.6} width={Math.max(1, bw - 1.2)}
              y={h - PAD.b - (c / top) * (h - PAD.t - PAD.b)}
              height={(c / top) * (h - PAD.t - PAD.b)} />
      ))}
    </svg>
  )
}

export function PerPlacementBars({ rows, w = 470, h = 220 }) {
  if (!rows?.length) return null
  const by = new Map()
  rows.forEach((r) => {
    if (!by.has(r.pid)) by.set(r.pid, [])
    by.get(r.pid).push(r.abs_err_mpu)
  })
  const pids = [...by.keys()].sort((x, y) => x - y)
  const mean = pids.map((k) => by.get(k).reduce((s, v) => s + v, 0) / by.get(k).length)
  const top = Math.max(...mean) || 1
  const bw = (w - PAD.l - PAD.r) / pids.length
  return (
    <svg className="py-chart" viewBox={`0 0 ${w} ${h}`}>
      <Axes w={w} h={h} xlo={0} xhi={pids.length} ylo={0} yhi={top}
            xlabel="placement" ylabel="mean error (mpu)"
            fmt={(v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))} />
      {mean.map((v, i) => (
        <rect key={i} className="py-bar" x={PAD.l + i * bw + 0.8} width={Math.max(1, bw - 1.6)}
              y={h - PAD.b - (v / top) * (h - PAD.t - PAD.b)}
              height={(v / top) * (h - PAD.t - PAD.b)}>
          <title>{`placement ${pids[i]}`}</title>
        </rect>
      ))}
    </svg>
  )
}

const VERDICTS = ['feasible', 'inconclusive', 'infeasible']

/** Predicted verdict against the library's own solved verdict, counted from the rows. */
export function ConfusionGrid({ rows }) {
  if (!rows?.length) return null
  const cell = (a, b) => rows.filter((r) => r.verdict === a && r.verdict_true === b).length
  return (
    <div className="wb-table-scroll">
      <table className="py-confusion">
        <thead><tr><th>predicted \ solved</th>{VERDICTS.map((v) => <th key={v}>{v}</th>)}</tr></thead>
        <tbody>
          {VERDICTS.map((a) => (
            <tr key={a}>
              <td><b>{a}</b></td>
              {VERDICTS.map((b) => {
                const c = cell(a, b)
                const bad = a === 'feasible' && b === 'infeasible'
                return (
                  <td key={b} className={`${a === b ? 'diag' : ''}${bad && c ? ' bad' : ''}`}
                      style={{ opacity: c ? 1 : 0.4 }}>{c}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The verdict mix as one strip, from a summary the server counted. */
export function VerdictStrip({ summary }) {
  if (!summary?.n) return null
  return (
    <div className="py-strip" title="verdict mix">
      {VERDICTS.map((v) => <i key={v} className={v} style={{ width: `${(100 * summary[v]) / summary.n}%` }} />)}
    </div>
  )
}
