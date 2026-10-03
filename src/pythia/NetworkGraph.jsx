import { useMemo } from 'react'

/*
  A library feeder as a network — grid-yukti's `netgraph.js`.

  Library feeders carry no coordinates, so they cannot go on a map. The server ships a
  per-bus (x, y) laid out once by Kamada-Kawai over the line lengths; the tidy-tree layout
  below is the fallback for a payload without it. Same shape language as the map: circle
  feasible, square infeasible, diamond inconclusive.
*/

export function treeLayout(buses, lines) {
  const adj = new Map()
  for (const b of buses) adj.set(b.bus_id, [])
  for (const ln of lines || []) {
    if (adj.has(ln.from) && adj.has(ln.to)) {
      adj.get(ln.from).push(ln.to)
      adj.get(ln.to).push(ln.from)
    }
  }
  const head = buses.find((b) => b.is_slack) || buses[0]
  if (!head) return { order: [], pos: {}, maxDepth: 0 }
  const seen = new Set([head.bus_id])
  const depth = { [head.bus_id]: 0 }
  const kids = new Map()
  const order = []
  const stack = [head.bus_id]
  while (stack.length) {
    const u = stack.pop()
    order.push(u)
    const next = (adj.get(u) || []).filter((v) => !seen.has(v)).sort((a, b) => b - a)
    kids.set(u, [...next].reverse())
    for (const v of next) { seen.add(v); depth[v] = depth[u] + 1; stack.push(v) }
  }
  const leaves = {}
  const count = (u) => {
    const k = kids.get(u) || []
    leaves[u] = k.length ? k.reduce((s, v) => s + count(v), 0) : 1
    return leaves[u]
  }
  count(head.bus_id)
  const pos = {}
  let cursor = 0
  const place = (u, x0) => {
    const k = kids.get(u) || []
    if (!k.length) { pos[u] = [cursor + 0.5, depth[u]]; cursor += 1; return }
    let x = x0
    for (const v of k) { place(v, x); x += leaves[v] }
    pos[u] = [k.reduce((s, v) => s + pos[v][0], 0) / k.length, depth[u]]
  }
  place(head.bus_id, 0)
  const maxDepth = Math.max(...Object.values(depth), 1)
  const width = Math.max(cursor, 1)
  for (const id of order) pos[id] = [pos[id][0] / width, pos[id][1] / maxDepth]
  for (const b of buses) if (!pos[b.bus_id]) pos[b.bus_id] = [0, 0]
  return { order, pos, maxDepth }
}

export function NetworkGraph({ buses, lines, verdictByBus = null, picked = null, disagree = null,
                               onBus = null, clickable = null, selected = null }) {
  const { pos: treePos } = useMemo(() => treeLayout(buses || [], lines || []), [buses, lines])
  if (!buses?.length) return null
  const laid = buses.every((b) => b.x !== undefined && b.y !== undefined)
  const pos = laid ? Object.fromEntries(buses.map((b) => [b.bus_id, [b.x, b.y]])) : treePos
  const W = 640
  const padx = 26
  const pady = 30
  let H = 420
  if (laid) {
    const xs = buses.map((b) => b.x)
    const ys = buses.map((b) => b.y)
    const dx = Math.max(...xs) - Math.min(...xs) || 1
    const dy = Math.max(...ys) - Math.min(...ys) || 1
    H = Math.max(280, Math.min(620, Math.round((W - 2 * padx) * (dy / dx)) + 2 * pady))
  }
  const X = (id) => padx + pos[id][0] * (W - 2 * padx)
  const Y = (id) => pady + pos[id][1] * (H - 2 * pady)
  const chosen = new Set(picked || [])
  const n = buses.length
  const r = n > 110 ? 3.4 : n > 60 ? 4.4 : 5.5
  return (
    <svg className="py-netgraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {(lines || []).map((ln, i) => (
        <line key={`l${i}`} className="py-ng-edge" x1={X(ln.from)} y1={Y(ln.from)} x2={X(ln.to)} y2={Y(ln.to)} />
      ))}
      {buses.map((b) => {
        const x = X(b.bus_id)
        const y = Y(b.bus_id)
        const v = verdictByBus ? verdictByBus[b.bus_id] : null
        const on = chosen.has(b.bus_id)
        const bad = disagree?.[b.bus_id]
        const title = `bus ${b.bus_id}${b.is_slack ? ' — feeder head' : ''}`
          + (b.p_kw ? ` · ${b.p_kw} kW` : b.is_slack ? '' : ' · no load')
          + (v ? ` · ${v}` : '') + (bad ? ' · the solve disagrees' : '')
        if (b.is_slack) {
          return (
            <g key={b.bus_id} className="py-ng-slack">
              <rect x={x - r - 1.5} y={y - r - 1.5} width={2 * r + 3} height={2 * r + 3} />
              <text x={x} y={y - r - 6} textAnchor="middle">SUB</text>
              <title>{title}</title>
            </g>
          )
        }
        const canClick = Boolean(onBus && (!clickable || clickable.has(b.bus_id)))
        const cls = `py-ng-bus ${v ? `v-${v}` : b.has_load ? 'host' : 'junction'}`
          + `${on ? ' on' : ''}${canClick ? ' clickable' : ''}${selected === b.bus_id ? ' sel' : ''}`
        let shape
        if (v === 'infeasible') {
          shape = <rect x={x - r} y={y - r} width={2 * r} height={2 * r} />
        } else if (v === 'inconclusive') {
          shape = <rect x={x - r} y={y - r} width={2 * r} height={2 * r} transform={`rotate(45 ${x} ${y})`} />
        } else {
          shape = <circle cx={x} cy={y} r={b.has_load ? r : r * 0.62} />
        }
        return (
          <g key={b.bus_id} className={cls} onClick={canClick ? () => onBus(b.bus_id) : undefined}>
            {canClick && <circle className="py-ng-hit" cx={x} cy={y} r={r * 2.2} />}
            {shape}
            {on && <circle className="py-ng-ring" cx={x} cy={y} r={r * 2.1} />}
            {bad && <circle className="py-ng-bad" cx={x} cy={y} r={r * 2.8} />}
            <title>{title}</title>
          </g>
        )
      })}
    </svg>
  )
}
