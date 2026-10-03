/*
  What the Assistant says after each Pythia step, in the shape `chat/answer.js` uses:
  `{ lead, figures: [{label, value, note}], caveat }`.

  The rule carried over from grid-yukti: THE CLIENT INVENTS NOTHING. Every number below is a
  field of the response it describes, formatted and never derived; every caveat that has
  server wording is the server's sentence, verbatim. Where the payload has no field for a
  claim, the claim is not made. Nothing here ranks one placement above another — a ranking
  rule was tested against random selection and did not clear its gate.
*/

const pct = (f) => `${(Number(f) * 100).toFixed(1)} %`
const pu = (v, d = 4) => (v == null ? '—' : `${Number(v).toFixed(d)} pu`)
const n = (v) => (v == null ? '—' : String(v))
const sec = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} s`)
const mpu = (v) => (v == null ? '—' : `${Number(v).toFixed(3)} mpu`)

function mix(s) {
  return [
    { label: 'Feasible', value: n(s.feasible) },
    { label: 'Infeasible', value: n(s.infeasible) },
    { label: 'Inconclusive', value: n(s.inconclusive), note: `(${pct(s.frac_inconclusive)} of ${s.n})` },
  ]
}

export function built(feeder) {
  const t = feeder.topology || {}
  const e = feeder.electrical || {}
  return {
    lead: `Traced a **${n(t.n_bus)}-bus** feeder from the road network. `
      + `**${n(feeder.geometry?.n_eligible)}** buses can host a station. It is on the map — `
      + 'pick which placements to screen in the side panel, or place your own stations.',
    figures: [
      { label: 'Lowest bus voltage, no chargers', value: pu(e.base_vmin, 5) },
      { label: 'Voltage drop, no chargers', value: e.total_drop_pct == null ? '—' : `${e.total_drop_pct.toFixed(2)} %` },
      { label: 'Mean path to a bus', value: t.mean_path_km == null ? '—' : `${t.mean_path_km.toFixed(3)} km` },
      { label: 'Candidate placements', value: n((feeder.placements || []).length) },
      { label: 'Power flows spent building it', value: n(feeder.acpf_solves_spent) },
    ],
  }
}

export function opened(feeder) {
  const t = feeder.topology || {}
  return {
    lead: `Opened feeder \`${feeder.feeder_id}\`${feeder.name ? ` (${feeder.name})` : ''}: `
      + `**${n(t.n_bus)}** buses, **${n((feeder.placements || []).length)}** stored placements. `
      + 'Opening it cost nothing. Ask to screen it, or place stations first.',
    figures: [],
  }
}

export function screened(scr) {
  const s = scr.summary
  return {
    lead: `Screened **${(scr.screened_pids || []).length}** placement`
      + `${(scr.screened_pids || []).length === 1 ? '' : 's'} at a limit of **${pu(scr.vmin)}**. `
      + `**${pct(s.frac_inconclusive)}** of the bus × placement rows are inconclusive — `
      + 'their interval straddles the limit, and that number is what decides whether a real solve is worth spending.',
    figures: [
      ...mix(s),
      { label: 'Real solves promoted', value: n(scr.k), note: `of ${n(scr.recommended_k)} recommended` },
      { label: 'Wall time', value: sec(scr.timing?.wall_s) },
      { label: 'Power flows spent', value: n(scr.acpf_solves_spent) },
    ],
    caveat: scr.ranking_note || null,
  }
}

export function recounted(rec) {
  const s = rec.summary
  return {
    lead: `At **${pu(rec.vmin)}** the same stored numbers read:`,
    figures: [...mix(s), { label: 'Power flows spent', value: n(rec.acpf_solves_spent) }],
    caveat: rec.note || null,
  }
}

export function envelope(env) {
  return {
    lead: `The screen's own uncertainty at **${pu(env.vmin)}** (interval ± ${env.z} σ). `
      + 'This reads what the model says about itself — the full figures are on the Report tab.',
    figures: [
      { label: 'Median interval half-width', value: mpu(env.half_width_mpu?.median) },
      { label: 'Widest interval half-width', value: mpu(env.half_width_mpu?.max) },
      { label: 'Closest margin to the limit', value: mpu(env.margin_mpu?.min) },
      { label: 'Undecided rows', value: n(env.undecided_shortfall_mpu?.n) },
      { label: 'Power flows spent', value: n(env.acpf_solves_spent) },
    ],
    caveat: env.not_measured_error || null,
  }
}

export function candidates(cand) {
  const p = cand.projection || {}
  return {
    lead: `**${(cand.candidates || []).length}** placement${(cand.candidates || []).length === 1 ? '' : 's'} `
      + 'can still be solved. Pick one below — a real Monte-Carlo power flow measures it, and '
      + 'you then choose whether it becomes an anchor.',
    figures: [
      { label: 'Anchors so far', value: n(cand.k), note: `of ${n(cand.recommended_k)} recommended` },
      { label: 'What one solve costs here', value: p.known ? sec(p.per_anchor_s) : 'not known yet',
        note: p.known ? p.measured_on : null },
    ],
    caveat: p.known ? cand.ranking_note : (p.message || cand.ranking_note),
  }
}

export function solved(solve, anchor) {
  const me = solve?.measured_error || {}
  return {
    lead: `Solved placement **${n(anchor?.pid ?? solve?.pid)}** with a real Monte-Carlo power flow `
      + 'and promoted it to an anchor. Every remaining placement was re-screened with it in the '
      + 'context — the before/after is on the Report tab.',
    figures: [
      { label: 'Power flows this solve ran', value: n(solve?.acpf_solves_spent), note: `${n(solve?.n_mc)} draws` },
      { label: 'Solver time', value: sec(anchor?.solve_wall_s ?? solve?.solve_wall_s) },
      { label: 'Prediction error on it', value: mpu(me.mae_mpu) },
      { label: 'Anchors now', value: n(anchor?.k), note: `of ${n(anchor?.recommended_k)} recommended` },
    ],
    caveat: me.caveat || anchor?.s5_note || null,
  }
}

export function accuracy(lopo) {
  const acc = lopo.measured_accuracy || {}
  return {
    lead: acc.n
      ? `**${acc.n}** placement${acc.n === 1 ? ' has' : 's have'} a real solve behind them, each scored with itself held out of the context.`
      : (acc.note || 'No placement on this feeder has a real solve behind it yet.'),
    figures: acc.n ? [
      { label: 'Median error', value: mpu(acc.median_mpu) },
      { label: 'Range', value: `${mpu(acc.min_mpu)} – ${mpu(acc.max_mpu)}` },
      ...(lopo.median_mpu != null ? [{ label: 'Leave-one-anchor-out median', value: mpu(lopo.median_mpu), note: `k = ${lopo.k}` }] : []),
    ] : [],
    caveat: lopo.caveat || null,
  }
}

export function library(res) {
  const e = res.error || {}
  const a = res.agreement || {}
  return {
    lead: `**${res.hold_out_name}** on \`${res.feeder_id}\` at ${res.arm}: `
      + `${res.hold_out_claim ? `${res.hold_out_claim.replace(/\.?$/, '.')} ` : ''}`
      + 'Scored against the library’s own solved labels — no power flow was run.',
    figures: [
      ...mix(res.summary),
      { label: 'Agrees with the solve', value: pct(a.frac), note: `${n(a.rows)} of ${n(a.n)} rows` },
      { label: 'Called feasible, solve says no', value: n(a.false_feasible) },
      { label: 'Mean absolute error', value: mpu(e.mae_mpu) },
    ],
    caveat: a.note || null,
  }
}
