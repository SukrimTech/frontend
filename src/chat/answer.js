/*
  Turning a result into an answer a person can read.

  A study returns a report and a block of numbers. The report is thorough and
  the numbers are exact, and neither of them answers the question the way a
  colleague would if you asked them across a desk. That is what this file is
  for: a few sentences that say what happened, with the figures that matter
  beside them.

  **Nothing here is written by a language model.** Invariant I1 says the model
  never computes an electrical quantity, and a model that is handed a result
  and asked to describe it is computing by another name -- it can transpose a
  digit, round a kA to the wrong place, or call a marginal unit a binding one,
  and the sentence will read just as fluently either way. So every number below
  is read out of `data` by field name and formatted, never re-derived and never
  restated from memory. A number that is not in `data` does not appear.

  The wording is fixed and the values are substituted. That is a real cost --
  these answers do not vary with how the question was phrased, and they will
  not follow up on something unexpected -- and it buys the one property worth
  more than fluency here: if the chat says 2,311.85 kA, that is what the solver
  returned.

  Two other rules follow from the same place. Nothing here re-derives an
  electrical judgement: whether a voltage is a violation is decided by the
  agent and arrives as a finding, so this never applies a limit of its own.
  And a result the agent would not stand behind is never narrated as though it
  were an answer -- `caveat` leads, and the figures follow it.
*/

/* ------------------------------------------------------------------ */
/* formatting                                                          */

/** A number with thousands separators, at a fixed number of decimals. */
function num(value, dp = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString(undefined,
    { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** Significant where it is small, readable where it is large. */
function loose(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const v = Math.abs(Number(value))
  if (v >= 1000) return num(value, 0)
  if (v >= 10) return num(value, 1)
  // Small but not zero must not print as "0.00". A congestion rent of
  // 0.00058 is the residue of an unconstrained solve, and rendering it as
  // zero states something stronger than the solver did.
  if (v > 0 && v < 0.005) return `<${num(0.01, 2)}`
  return num(value, 2)
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/*
  An optimiser writes 7.1e-15 where it means zero.

  Unserved energy and congestion rent both come back as the residue of a
  floating-point subtraction, and "7.105427357601002e-15 MWh of demand was not
  met" is a false alarm about a solve that met every megawatt. The threshold is
  deliberately crude: anything below a microunit on a system measured in
  hundreds of MW is arithmetic, not engineering.
*/
const ZERO = 1e-6
const isZero = (v) => v === null || v === undefined || Math.abs(v) < ZERO

/* ------------------------------------------------------------------ */
/* the answer                                                          */

/**
 * @returns {{lead: string, figures: Array, caveat: string|null}|null}
 */
export function composeAnswer(agent, result) {
  if (!result?.data) return null
  const make = COMPOSERS[agent]
  if (!make) return null
  try {
    return make(result.data, result)
  } catch {
    // A shape that is not what this expected is not worth a broken panel; the
    // report and the findings are still there and still correct.
    return null
  }
}

const COMPOSERS = {
  /* --- power flow ------------------------------------------------- */
  ariadne(data, r) {
    const s = data.solve ?? {}
    const m = data.model ?? {}
    const v = s.voltages ?? []
    const lowest = v.length ? v.reduce((a, b) => (b.v_pu < a.v_pu ? b : a)) : null
    const highest = v.length ? v.reduce((a, b) => (b.v_pu > a.v_pu ? b : a)) : null

    const lead = s.converged
      ? `The power flow solved. Voltages run from **${num(s.v_min_pu, 4)} pu** `
        + `${lowest ? `at \`${lowest.bus}\`` : ''} up to **${num(s.v_max_pu, 4)} pu**`
        + `${highest ? ` at \`${highest.bus}\`` : ''}, and the network loses `
        + `**${loose(s.losses_kw)} kW** across ${plural(m.lines ?? 0, 'line')}.`
      : `The power flow **did not converge**, so the numbers below describe `
        + `where the solver stopped, not a state the network can be in.`

    return {
      lead,
      caveat: s.converged ? null
        : 'A non-converged solve is not a result. Nothing here should be used '
          + 'to size anything or to judge a voltage.',
      figures: [
        { label: 'Lowest voltage', value: `${num(s.v_min_pu, 4)} pu`,
          note: lowest ? `at ${lowest.bus}` : null },
        { label: 'Highest voltage', value: `${num(s.v_max_pu, 4)} pu`,
          note: highest ? `at ${highest.bus}` : null },
        { label: 'Losses', value: `${loose(s.losses_kw)} kW` },
        { label: 'Solved with', value: s.backend ?? '—',
          note: `${m.buses ?? 0} buses` },
      ],
    }
  },

  /* --- fault levels ------------------------------------------------ */
  argus(data) {
    const st = data.study ?? {}
    const rows = st.rows ?? []
    const worst = rows.find((x) => x.bus === st.worst_bus)
    const rated = rows.filter((x) => x.three_phase != null)
    const smallest = rated.length
      ? rated.reduce((a, b) => (b.three_phase < a.three_phase ? b : a)) : null

    // "maximum" and "minimum" are the two IEC 60909 studies, and which one ran
    // changes what the number is for -- breaking duty against withstand.
    const kind = st.minimum ? 'minimum' : 'maximum'

    return {
      lead: `The largest three-phase fault is **${num(st.worst_ka)} kA** at `
        + `\`${st.worst_bus}\`, across ${plural(st.buses ?? rows.length, 'bus', 'buses')}. `
        + `These are **${kind}** currents to IEC 60909`
        + `${kind === 'maximum'
            ? ' — the ones switchgear has to break and equipment has to withstand.'
            : ' — the ones protection has to be able to see.'}`,
      caveat: null,
      figures: [
        { label: 'Worst three-phase', value: `${num(st.worst_ka)} kA`,
          note: `at ${st.worst_bus}` },
        worst && { label: 'Peak', value: `${num(worst.peak_ka)} kA`,
          note: `X/R ${num(worst.xr, 1)}` },
        smallest && { label: 'Smallest three-phase',
          value: `${num(smallest.three_phase)} kA`, note: `at ${smallest.bus}` },
        { label: 'Study', value: kind, note: `${st.buses ?? rows.length} buses` },
      ].filter(Boolean),
    }
  },

  /* --- cheapest dispatch ------------------------------------------- */
  themis(data) {
    const d = data.dispatch ?? {}
    const why = data.why ?? {}
    const states = why.states ?? []
    const running = (d.units ?? []).filter((u) => Math.abs(u.mw) > ZERO)
    const marginal = states.filter((s) => s.verdict === 'marginal')
    const short = !isZero(d.unserved_mwh)

    const setter = marginal.length === 0 ? null
      : marginal.length === 1 ? `\`${marginal[0].name}\``
      : marginal.length === 2
        ? `${marginal.map((s) => `\`${s.name}\``).join(' and ')}, both at the same cost`
        // Several machines free to move at one incremental cost is a
        // degenerate optimum: the split between them is arbitrary, and
        // naming one of them as the price-setter would be reading a
        // tie-break as a fact about the system.
        : `${marginal.length} units sitting at the same incremental cost, so `
          + `the split between them is arbitrary`

    return {
      lead: `Meeting **${loose(d.energy_mwh)} MWh** costs **${loose(d.total_cost)}**, `
        + `an average of **${num(d.average_price)} /MWh**. `
        + `${plural(running.length, 'unit')} of ${(d.units ?? []).length} `
        + `${running.length === 1 ? 'is' : 'are'} running`
        + `${setter ? `, and the price is set by ${setter}` : ''}. `
        + `This ignores the network entirely — it is what the machines alone can do.`,
      caveat: short
        ? `**${loose(d.unserved_mwh)} MWh of demand was not met.** The fleet `
          + `cannot cover the load, so the cost above is for less energy than was asked for.`
        : null,
      figures: [
        { label: 'Total cost', value: loose(d.total_cost) },
        { label: 'Average price', value: `${num(d.average_price)} /MWh` },
        { label: 'Energy', value: `${loose(d.energy_mwh)} MWh` },
        { label: 'Running', value: `${running.length} of ${(d.units ?? []).length}` },
      ],
    }
  },

  /* --- network limits and prices ------------------------------------ */
  ananke(data) {
    const n = data.network ?? {}
    const why = data.why ?? {}
    const branches = n.branches ?? []
    const binding = branches.filter((b) => b.binding)
    const spread = (n.price_max ?? 0) - (n.price_min ?? 0)
    const flat = spread < 0.005

    // Rent and cost are different questions. Rent is what the constraint
    // collects, which is a dual; cost is what congestion adds against an
    // unconstrained counterfactual, which is only present if it was computed.
    const cost = why.congestion_cost

    const lead = binding.length === 0
      ? `The cheapest dispatch the network can carry costs **${loose(n.total_cost)}**, `
        + `and **the network is not in the way** — none of the ${branches.length} `
        + `branches binds, and every bus prices at the same `
        + `**${num(n.price_min)} /MWh**. That is what an unconstrained system `
        + `looks like: one price everywhere, because nothing is full.`
      : `The cheapest dispatch the network can carry costs **${loose(n.total_cost)}**, `
        + `and **${plural(binding.length, 'branch', 'branches')}** ${binding.length === 1 ? 'is' : 'are'} `
        + `full: ${binding.slice(0, 3).map((b) => `\`${b.name}\``).join(', ')}`
        + `${binding.length > 3 ? ` and ${binding.length - 3} more` : ''}. `
        + `That splits the price across the system, from **${num(n.price_min)}** to `
        + `**${num(n.price_max)} /MWh** — ${num(spread)} /MWh between the cheapest `
        + `bus and the dearest.`

    return {
      lead,
      caveat: isZero(n.unserved_mwh) ? null
        : `**${loose(n.unserved_mwh)} MWh could not be delivered** even at the `
          + `price shown — the network cannot reach the load.`,
      figures: [
        { label: 'Total cost', value: loose(n.total_cost) },
        { label: 'Binding branches', value: String(binding.length),
          note: `of ${branches.length}` },
        { label: 'Price', value: flat ? `${num(n.price_min)} /MWh`
            : `${num(n.price_min)}–${num(n.price_max)} /MWh`,
          note: flat ? 'the same everywhere' : 'varies by bus' },
        cost != null
          ? { label: 'Congestion cost', value: loose(cost),
              note: 'against an unconstrained network' }
          : { label: 'Congestion rent', value: loose(n.congestion_rent),
              note: 'collected by the binding limits' },
      ],
    }
  },

  /* --- the diagram --------------------------------------------------- */
  iris(data) {
    const d = data.diagram ?? {}
    const layout = d.layout ?? {}
    const stated = layout.inferred_nodes === 0

    return {
      lead: `Drew **${plural((d.nodes ?? []).length, 'bus', 'buses')}** and `
        + `**${plural((d.edges ?? []).length, 'branch', 'branches')}**, with `
        + `${plural((d.shunts ?? []).length, 'device')} hanging off them. `
        + (stated
            ? `Every position came from the model itself, so distances on the `
              + `drawing are real.`
            : `${layout.inferred_nodes} of ${(d.nodes ?? []).length} positions `
              + `had to be inferred from the topology, so the picture is correct `
              + `about what connects to what and says nothing about distance.`),
      caveat: null,
      figures: [
        { label: 'Buses', value: String((d.nodes ?? []).length) },
        { label: 'Branches', value: String((d.edges ?? []).length) },
        { label: 'Devices', value: String((d.shunts ?? []).length) },
        { label: 'Layout', value: layout.method ?? '—',
          note: stated ? 'from the model' : `${layout.inferred_nodes} inferred` },
      ],
    }
  },
}

/* ------------------------------------------------------------------ */
/* follow-ups                                                          */

/*
  The obvious next question, answered from the result already in hand.

  None of these re-run anything. They are the same numbers sorted a different
  way, which is exactly what a person asks for next -- "which ones are worst"
  -- and it would be absurd to make them wait for a second solve to find out.
*/
export function followUps(agent, result) {
  const data = result?.data
  if (!data) return []
  const list = FOLLOW[agent]?.(data) ?? []

  /*
    A follow-up lands as its own message, some way below the answer that
    carried the warning. Sorting unreliable numbers into a tidy table is a
    good way to make them look reliable, so the caveat travels with them
    rather than being left behind in the scrollback.
  */
  const caveat = result.ok ? null
    : 'These come from a run the study would not stand behind — see the '
      + 'warning on the result above.'

  return list.filter((f) => f.rows?.length).map((f) => ({ ...f, caveat }))
}

const top = (rows, key, n = 6, dir = 'desc') =>
  [...rows].filter((r) => r[key] != null)
    .sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]))
    .slice(0, n)

const FOLLOW = {
  ariadne: (d) => {
    const v = d.solve?.voltages ?? []
    return [{
      key: 'low-buses',
      label: 'Which buses are lowest?',
      lead: `The ${Math.min(6, v.length)} lowest buses by voltage.`,
      head: ['bus', 'voltage (pu)'],
      rows: top(v, 'v_pu', 6, 'asc').map((x) => [x.bus, num(x.v_pu, 4)]),
    }]
  },

  argus: (d) => {
    const rows = d.study?.rows ?? []
    return [{
      key: 'high-fault',
      label: 'Where is the fault current highest?',
      lead: 'Buses ranked by three-phase fault current.',
      head: ['bus', 'kV', 'three-phase (kA)', 'peak (kA)', 'X/R'],
      rows: top(rows, 'three_phase').map((x) =>
        [x.bus, num(x.kv, 2), num(x.three_phase), num(x.peak_ka), num(x.xr, 1)]),
    }, {
      key: 'low-fault',
      label: 'Where is it weakest?',
      lead: 'The weakest buses — where protection has the least to see.',
      head: ['bus', 'kV', 'three-phase (kA)', 'X/R'],
      rows: top(rows, 'three_phase', 6, 'asc').map((x) =>
        [x.bus, num(x.kv, 2), num(x.three_phase), num(x.xr, 1)]),
    }]
  },

  themis: (d) => {
    const units = d.dispatch?.units ?? []
    const states = Object.fromEntries((d.why?.states ?? []).map((s) => [s.name, s]))
    return [{
      key: 'units',
      label: 'Which units are running?',
      lead: 'Every unit with output, and why it is where it is.',
      head: ['unit', 'MW', 'cost', 'why'],
      rows: top(units.filter((u) => Math.abs(u.mw) > ZERO), 'mw', 8).map((u) =>
        [u.name, num(u.mw, 1), loose(u.total_cost),
         states[u.name]?.detail ?? states[u.name]?.verdict ?? '—']),
    }, {
      key: 'idle',
      label: 'What is not running, and why?',
      lead: 'Units left at zero.',
      head: ['unit', 'incremental cost', 'why'],
      rows: (d.why?.states ?? [])
        .filter((s) => Math.abs(s.mw ?? 0) <= ZERO)
        .slice(0, 8)
        .map((s) => [s.name, num(s.incremental), s.detail ?? s.verdict ?? '—']),
    }]
  },

  ananke: (d) => {
    const branches = d.network?.branches ?? []
    return [{
      key: 'loaded',
      label: 'Which lines are most loaded?',
      lead: 'Branches ranked by how much of their limit they are using.',
      head: ['branch', 'MW', 'limit', 'loading', 'binding'],
      rows: top(branches, 'loading_pct').map((b) =>
        [b.name, num(b.mw, 1), b.limit == null ? '—' : num(b.limit, 1),
         `${num(b.loading_pct, 1)} %`, b.binding ? 'yes' : '—']),
    }]
  },

  iris: (d) => {
    const nodes = d.diagram?.nodes ?? []
    return [{
      key: 'biggest',
      label: 'Where is the load concentrated?',
      lead: 'Buses carrying the most connected load.',
      head: ['bus', 'kV', 'load (kW)', 'generation (kW)'],
      rows: top(nodes.filter((n) => (n.load_kw ?? 0) > 0), 'load_kw').map((n) =>
        [n.name, n.kv == null ? '—' : num(n.kv, 2), num(n.load_kw, 1),
         num(n.generation_kw ?? 0, 1)]),
    }]
  },
}
