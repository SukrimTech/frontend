import {
  ConfusionGrid, ErrorHistogram, Figure, ParityPlot, PerPlacementBars, ServerHistogram, VerdictStrip,
} from './charts.jsx'

/*
  What Pythia puts on the Workbench's Report tab, beside the agent's own markdown report
  (`GET /v1/runs/{id}/report`, written by `agents/Pythia/tools/report.py`).

  These are grid-yukti's report screens — the confidence envelope, measured accuracy, the
  before/after of a solve, and a library study — re-laid as documents. Every figure is a field
  of the payload it came from, and every caveat that has server wording is that wording.
*/

const num = (v, d) => (v == null ? '—' : Number(v).toFixed(d))
const pct = (f) => (f == null ? '—' : `${(Number(f) * 100).toFixed(1)} %`)

function Mix({ s }) {
  if (!s) return null
  return (
    <div className="py-mix">
      <VerdictStrip summary={s} />
      <div className="wb-row">
        <span className="py-pill feasible">feasible {s.feasible}</span>
        <span className="py-pill inconclusive">inconclusive {s.inconclusive}</span>
        <span className="py-pill infeasible">infeasible {s.infeasible}</span>
        <span className="wb-meta">of {s.n}</span>
      </div>
    </div>
  )
}

function Table({ head, rows }) {
  return (
    <div className="wb-table-scroll">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** "How confident is this screen?" — the model's own uncertainty. Free; not measured error. */
export function EnvelopeReport({ env }) {
  return (
    <div className="py-doc">
      <blockquote>{env.not_measured_error}</blockquote>
      <Mix s={env.summary} />
      <dl className="wb-figures">
        <div><dt>Interval half-width, median</dt><dd><b>{num(env.half_width_mpu?.median, 3)}</b> mpu</dd></div>
        <div><dt>Interval half-width, widest</dt><dd><b>{num(env.half_width_mpu?.max, 3)}</b> mpu</dd></div>
        <div><dt>Closest margin to the limit</dt><dd><b>{num(env.margin_mpu?.min, 3)}</b> mpu</dd></div>
        <div><dt>Undecided rows</dt><dd><b>{env.undecided_shortfall_mpu?.n ?? 0}</b></dd></div>
        <div><dt>How much narrower they would need to be, median</dt><dd><b>{num(env.undecided_shortfall_mpu?.median, 3)}</b> mpu</dd></div>
        <div><dt>Power flows spent</dt><dd><b>{env.acpf_solves_spent}</b></dd></div>
      </dl>
      <Figure title="Interval half-width" note="z × σ per row, counted by the server">
        <ServerHistogram hist={env.half_width_hist_mpu} xlabel="half-width (mpu)" />
      </Figure>
      <Figure title="Margin to the limit" note="q̂₀₅ − Vmin per row; left of zero is below the limit">
        <ServerHistogram hist={env.margin_hist_mpu} xlabel="margin (mpu)" />
      </Figure>
      <h3>Placement by placement</h3>
      <Table head={['placement', 'feasible', 'inconclusive', 'infeasible', 'σ median mpu', 'half-width mpu', 'worst margin mpu']}
             rows={(env.per_placement || []).map((p) => [p.pid, p.summary.feasible, p.summary.inconclusive,
               p.summary.infeasible, num(p.sigma_median_mpu, 3), num(p.half_width_median_mpu, 3), num(p.worst_margin_mpu, 3)])} />
      <p className="wb-small">{env.interval_rule}</p>
      <p className="wb-small">{env.cost_note}</p>
    </div>
  )
}

/** Measured accuracy: per placement against its own solve, and leave-one-anchor-out. */
export function AccuracyReport({ lopo, runsHist }) {
  const acc = lopo.measured_accuracy || {}
  const per = lopo.per_anchor || []
  const runs = (runsHist?.runs || []).filter((r) => r.n_solves > 0)
  return (
    <div className="py-doc">
      <h3>Per placement, against its own solve</h3>
      {acc.per_placement?.length ? (
        <Table head={['placement', 'role', 'MAE mpu', 'median mpu', 'worst bus mpu', 'buses', 'anchors in context']}
               rows={acc.per_placement.map((r) => [r.pid, r.role, num(r.mae_mpu, 3), num(r.medae_mpu, 3),
                 num(r.max_ae_mpu, 3), r.n_query, r.anchors_in_context])} />
      ) : null}
      <p className="wb-small">{acc.note}</p>
      <h3>Leave-one-anchor-out{lopo.k != null ? ` · k = ${lopo.k}` : ''}</h3>
      {per.length ? (
        <>
          <Table head={['anchor', 'MAE mpu', 'median mpu', 'anchors in context', 'rows in context']}
                 rows={per.map((p) => [p.pid, num(p.mae_mpu, 4), num(p.medae_mpu, 4), p.anchors_in_context, p.anchor_rows_in_context])} />
          <p className="wb-small">Median {num(lopo.median_mpu, 4)} mpu, spread {num(lopo.min_mpu, 4)}–{num(lopo.max_mpu, 4)} mpu.</p>
          <blockquote>{lopo.caveat}</blockquote>
          <p className="wb-small">{lopo.sample_caveat} {lopo.regime_note}</p>
        </>
      ) : <p className="wb-small">{lopo.message}</p>}
      {runs.length > 0 && (
        <>
          <h3>Every run on this feeder with a solve</h3>
          <Table head={['run', 'limit pu', 'solved', 'anchors', 'power flows', 'LOPO median mpu']}
                 rows={runs.map((r) => [r.run_id, num(r.vmin, 4), r.n_solves, r.k, r.acpf_solves_spent,
                   r.lopo?.median_mpu != null ? num(r.lopo.median_mpu, 3) : '—'])} />
          <p className="wb-small">{runsHist.note}</p>
        </>
      )}
    </div>
  )
}

/** Before and after one solve, on the same placements. */
export function AfterReport({ before, after, anchor, solve, feeder }) {
  const bp = before?.screened_pids || []
  const ap = after?.screened_pids || []
  const same = ap.length > 0 && ap.length === bp.length && ap.every((p) => bp.includes(p))
  const mine = new Set((feeder?.placements || []).filter((p) => p.origin === 'user').map((p) => p.pid))
  const bb = before?.summary_by_placement || {}
  const aa = after?.summary_by_placement || {}
  return (
    <div className="py-doc">
      <dl className="wb-figures">
        <div><dt>Solved placement</dt><dd><b>{anchor?.pid}</b> {anchor?.row_role}</dd></div>
        <div><dt>Its buses</dt><dd>{(solve?.siting?.buses || []).join(', ') || '—'}</dd></div>
        <div><dt>Power flows it ran</dt><dd><b>{solve?.acpf_solves_spent ?? '—'}</b> ({solve?.n_mc ?? '—'} draws)</dd></div>
        <div><dt>Prediction error on it</dt><dd><b>{num(solve?.measured_error?.mae_mpu, 3)}</b> mpu</dd></div>
        <div><dt>Anchors now</dt><dd><b>{anchor?.k}</b> of {anchor?.recommended_k} recommended</dd></div>
        <div><dt>This promotion cost</dt><dd><b>{anchor?.acpf_solves_this_call ?? 0}</b> power flows</dd></div>
      </dl>
      {solve?.measured_error?.caveat && <blockquote>{solve.measured_error.caveat}</blockquote>}
      <p className="wb-small">{bp.includes(anchor?.pid)
        ? 'The solved placement was one of those being screened, so it has left the candidate pool — its voltages are measured now. Everything below is over the placements that remain.'
        : 'The solved placement was not one of those being screened: what changed is the model re-predicting other placements with this solve in its retrieval context.'}</p>
      <h3>Before</h3><Mix s={before?.summary} />
      <h3>After</h3><Mix s={after?.summary} />
      <p className="wb-small">{same ? `Same ${ap.length} placement${ap.length === 1 ? '' : 's'} screened before and after.`
        : 'The placements screened before and after are not the same set — read the table, not the totals.'}</p>
      <Table head={['placement', 'undecided before', 'undecided after', 'feasible after', 'infeasible after', 'rows']}
             rows={ap.filter((p) => bb[String(p)]).map((p) => [
               `${p}${mine.has(p) ? ' (yours)' : ''}`, bb[String(p)].inconclusive, aa[String(p)].inconclusive,
               aa[String(p)].feasible, aa[String(p)].infeasible, aa[String(p)].n])} />
      {anchor?.s5_note && <p className="wb-small">{anchor.s5_note}</p>}
    </div>
  )
}

/** A leave-one-out study on a library feeder, scored against labels the library already holds. */
export function LibraryReport({ res }) {
  const e = res.error || {}
  const a = res.agreement || {}
  return (
    <div className="py-doc">
      <p><b>{res.hold_out_name}</b> — {res.hold_out_claim}</p>
      <dl className="wb-figures">
        <div><dt>Mean absolute error</dt><dd><b>{num(e.mae_mpu, 3)}</b> mpu</dd></div>
        <div><dt>Median / 90th percentile</dt><dd><b>{num(e.medae_mpu, 3)}</b> / {num(e.p90ae_mpu, 3)} mpu</dd></div>
        <div><dt>Worst row</dt><dd><b>{num(e.max_ae_mpu, 3)}</b> mpu</dd></div>
        <div><dt>Bias</dt><dd><b>{num(e.bias_mpu, 3)}</b> mpu</dd></div>
        <div><dt>Agrees with the solve</dt><dd><b>{pct(a.frac)}</b> ({a.rows} of {a.n})</dd></div>
        <div><dt>Called feasible, solve says no</dt><dd><b>{a.false_feasible}</b></dd></div>
        <div><dt>Held out of the pool</dt><dd><b>{res.pool?.n_held_out}</b> of {res.pool?.n_rows} rows</dd></div>
      </dl>
      <h3>Predicted</h3><Mix s={res.summary} />
      <h3>Solved (the library's own labels, same rule)</h3><Mix s={res.summary_true} />
      <Figure title="Predicted against solved" note="the limit on both axes — the quadrants are the confusion matrix">
        <ParityPlot rows={res.rows} vmin={res.vmin} />
      </Figure>
      <Figure title="Verdict against the solve" note="feasible called where the solve says infeasible is the error that matters most">
        <ConfusionGrid rows={res.rows} />
      </Figure>
      <Figure title="Absolute error"><ErrorHistogram rows={res.rows} /></Figure>
      <Figure title="Mean error per placement"><PerPlacementBars rows={res.rows} /></Figure>
      <blockquote>{a.note}</blockquote>
      <p className="wb-small">{res.cost_note}</p>
    </div>
  )
}
