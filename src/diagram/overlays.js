/*
  Turning an agent's result into something paintable.

  Each agent already returns the numbers; this maps them onto the ramps the
  design defines, and nothing here computes an electrical quantity — it looks
  values up and hands them to a colour scale.

  What an overlay may *not* do is invent a value. A bus the agent said nothing
  about is left in its plain treatment rather than given a default, because a
  diagram where every bus is coloured implies every bus was studied.
*/

export function overlayFrom(agent, data, findings = []) {
  if (!data) return null

  if (agent === 'ariadne' && data.solve?.voltages?.length) {
    const bus = {}
    for (const row of data.solve.voltages) bus[row.bus] = row.v_pu
    // Which buses are outside their limits is the agent's call, made against
    // its own configured limits and reported as R1. Reading the flag rather
    // than comparing to 0.95 here means the diagram cannot disagree with the
    // report if the limits are ever changed.
    const outside = findings
      .filter((f) => f.code === 'R1' && String(f.element).startsWith('bus.'))
      .map((f) => String(f.element).slice(4).replace(/\.v_pu$/, ''))
    return { id: 'flow', busRamp: 'volt', branchRamp: 'load', bus, branch: {}, outside }
  }

  if (agent === 'argus' && data.study?.rows?.length) {
    const bus = {}
    for (const row of data.study.rows) {
      if (row.three_phase !== undefined) bus[row.bus] = row.three_phase
    }
    return { id: 'fault', busRamp: 'fault', bus, branch: {}, path: [] }
  }

  if (agent === 'ananke' && data.network?.branches?.length) {
    const branch = {}
    const binding = []
    for (const b of data.network.branches) {
      if (b.loading_pct !== null && b.loading_pct !== undefined) branch[b.name] = b.loading_pct
      if (b.binding) binding.push(b.name)
    }
    const bus = {}
    // Nodal prices only when they actually differ: a flat price map painted
    // across a ramp reads as variation that is not there.
    const spread = (data.network.price_max ?? 0) - (data.network.price_min ?? 0)
    return {
      id: 'network', busRamp: spread > 1e-3 ? 'price' : null,
      branchRamp: 'load', bus, branch, binding,
    }
  }

  if (agent === 'themis' && data.dispatch?.units?.length) {
    const shunt = {}
    const peak = Math.max(...data.dispatch.units.map((u) => Math.max(...u.mw)), 1)
    for (const unit of data.dispatch.units) shunt[unit.name] = unit.mw[0] / peak
    return { id: 'dispatch', shunt, branch: {}, bus: {} }
  }

  return null
}

export const OVERLAY_FOR_AGENT = {
  ariadne: 'flow', argus: 'fault', ananke: 'network', themis: 'dispatch',
}
