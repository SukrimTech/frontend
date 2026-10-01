import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INK, RAMPS, SHUNT_PITCH, colourFor } from './tokens.js'
import { DEVICE_GAP, SOURCE_GLYPH, edgeGlyph, phaseTicks, shuntGlyph, shuntSlot } from './symbols.js'

/*
  The renderer. Takes Iris's diagram document and paints one overlay onto it.

  It draws only what the document says. Every judgement about the network was
  made upstream — which branch is a switch, whether that switch is closed,
  whether a rating exists at all — so nothing here re-derives an electrical
  fact from a colour.

  The one rule this file enforces on its own is the one the document cannot:
  **an unrated branch is never coloured by the loading ramp.** `rating_a: null`
  means the model states no rating, which is not the same as a rating that is
  never approached, and painting it as "0 % loaded" would invent a measurement.
*/

const PAD = 40

// How far a pointer may travel and still count as a click rather than a pan.
const DRAG_THRESHOLD = 4

// How wide a thing has to be before a person can reliably click it. Drawn
// transparent, beneath the real geometry, so it costs nothing visually.
const HIT = 14

// The closest two bus centres may sit. A bus is 28 units wide, carries a label
// above it and may fan devices below, so anything under this overlaps
// something. Two buses drawn on top of each other are not only unreadable,
// they are unclickable -- whichever is painted last takes every press.
const MIN_GAP = 48

/**
 * Push overlapping buses apart, and say whether anything moved.
 *
 * This is a drawing fix, not a layout algorithm: it runs after Iris has
 * decided where things go and only ever relieves a collision. Nodes that are
 * already far enough apart are left exactly where the document put them.
 *
 * It matters that this can lie. On an inferred layout the caveat already says
 * distance is not length, so nudging costs nothing. On a *trustworthy* layout
 * the coordinates came from the model and moving them makes the picture
 * disagree with the feeder -- so the fact that it happened is returned, and
 * the caption says so rather than quietly presenting moved geometry as
 * surveyed.
 */
function separate(nodes) {
  if (nodes.length < 2) return { nodes, nudged: 0 }
  const out = nodes.map((node) => ({ ...node }))
  const origin = nodes.map((node) => ({ x: node.x, y: node.y }))

  // Relaxation rather than a solve: each pass halves the remaining overlap, so
  // a chain of collisions unwinds over several passes instead of one node
  // being flung clear across the drawing.
  for (let pass = 0; pass < 60; pass += 1) {
    let touched = 0
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i], b = out[j]
        let dx = b.x - a.x, dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= MIN_GAP) continue
        if (d < 1e-6) {
          // Exactly coincident: no direction to push along, so invent a
          // deterministic one. Deterministic matters -- a random jitter would
          // redraw differently on every render.
          dx = Math.cos(i * 2.399); dy = Math.sin(i * 2.399); d = 1
        }
        const push = (MIN_GAP - d) / 2
        const ux = dx / d, uy = dy / d
        a.x -= ux * push; a.y -= uy * push
        b.x += ux * push; b.y += uy * push
        touched += 1
      }
    }
    if (!touched) break
  }

  let nudged = 0
  for (let i = 0; i < out.length; i += 1) {
    if (Math.hypot(out[i].x - origin[i].x, out[i].y - origin[i].y) > 0.5) nudged += 1
  }
  return { nodes: out, nudged }
}
/*
  The workbench's palette, from the design: ink, paper and one mint. The ramps
  in tokens.js are still used for the overlays that genuinely need a scale
  (fault current, nodal price); everything else is drawn in these three.
*/
const INKC = '#111111'
const PAPER = '#FFFFFF'
const MINT = '#C6EBC5'

/*
  Branch weight carries loading, as the design asks: heavier is busier. Three
  steps rather than a continuous width, because a 3.7 px line and a 4.1 px line
  are not distinguishable and pretending otherwise is false precision.
*/
// Half the drawn width of an ordinary bus, and where its shunts begin.
const BUS_HALF = 24
const SHUNT_START = 14

const loadingWeight = (pct) => (pct >= 80 ? 5 : pct >= 50 ? 3 : 1.5)

export default function Diagram({
  diagram, overlay = null, selected = null, onSelect = () => {},
  showNames = true, showValues = true, showLoadings = true,
}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState(null)
  const dragging = useRef(null)
  const nodeDrag = useRef(null)
  const suppressClick = useRef(false)
  const svgRef = useRef(null)
  const sceneRef = useRef(null)

  // Where the user has dragged a bus to, by name. Purely a view: nothing here
  // is sent to the session, because moving a symbol on a canvas is not an
  // electrical edit and must never be recorded as one.
  const [moved, setMoved] = useState({})

  const raw = diagram?.nodes ?? []
  const edges = diagram?.edges ?? []
  const shunts = diagram?.shunts ?? []

  const spread = useMemo(() => separate(raw), [raw])

  const nodes = useMemo(() => {
    if (!Object.keys(moved).length) return spread.nodes
    return spread.nodes.map((node) =>
      (moved[node.name] ? { ...node, ...moved[node.name] } : node))
  }, [spread, moved])

  const nudgedByHand = Object.keys(moved).length

  const at = useMemo(() => {
    const map = {}
    for (const node of nodes) map[node.name] = node
    return map
  }, [nodes])

  const byBus = useMemo(() => {
    const map = {}
    for (const shunt of shunts) (map[shunt.bus] ||= []).push(shunt)
    return map
  }, [shunts])

  /*
    A wheel listener attached through React is passive, and a passive listener
    cannot preventDefault -- so the page scrolled under the zoom. Attached by
    hand with `passive: false` it can.

    Every value a state updater needs is read out of the event *before*
    setView is called, never inside the closure: the updater runs during the
    next render, by which time the event may be gone.
  */
  const onWheel = useCallback((event) => {
    event.preventDefault()
    const element = svgRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const inward = event.deltaY < 0
    setView((v) => {
      const k = Math.max(0.25, Math.min(8, v.k * (inward ? 1.12 : 1 / 1.12)))
      const ratio = k / v.k
      return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio }
    })
  }, [])

  useEffect(() => {
    const element = svgRef.current
    if (!element) return undefined
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [onWheel, diagram])

  // The buttons zoom about the centre of the canvas, where the wheel zooms
  // about the pointer.
  const zoomBy = (factor) => {
    const element = svgRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const mx = rect.width / 2, my = rect.height / 2
    setView((v) => {
      const k = Math.max(0.25, Math.min(8, v.k * factor))
      const ratio = k / v.k
      return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio }
    })
  }

  /*
    A press is a selection until it has travelled far enough to be a drag.

    Capturing the pointer on pointerdown retargets every later pointer event to
    the root, and the click never reaches the bus that was pressed. So nothing
    is captured and nothing pans until the pointer has moved past
    DRAG_THRESHOLD, at which point it is unambiguously a drag and the click
    that follows is suppressed.
  */
  const onDown = (event) => {
    dragging.current = {
      x: event.clientX - view.x, y: event.clientY - view.y,
      startX: event.clientX, startY: event.clientY, moved: false,
      pointerId: event.pointerId, target: event.currentTarget,
    }
  }

  // Client pixels to diagram units. The scene `<g>` carries the viewBox
  // scaling and the pan/zoom transform, so its own screen CTM inverts both.
  const toScene = (event) => {
    const svg = svgRef.current, scene = sceneRef.current
    if (!svg || !scene) return null
    const ctm = scene.getScreenCTM()
    if (!ctm) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX; point.y = event.clientY
    const mapped = point.matrixTransform(ctm.inverse())
    return { x: mapped.x, y: mapped.y }
  }

  const onBusDown = (event, node) => {
    const start = toScene(event)
    if (!start) return
    event.stopPropagation()
    nodeDrag.current = {
      name: node.name, start, origin: { x: node.x, y: node.y },
      startX: event.clientX, startY: event.clientY, moved: false,
      pointerId: event.pointerId, target: event.currentTarget,
    }
  }

  const onMove = (event) => {
    const grabbed = nodeDrag.current
    if (grabbed) {
      const { clientX, clientY } = event
      if (!grabbed.moved) {
        if (Math.hypot(clientX - grabbed.startX, clientY - grabbed.startY) < DRAG_THRESHOLD) return
        grabbed.moved = true
        grabbed.target?.setPointerCapture?.(grabbed.pointerId)
      }
      const now = toScene(event)
      if (!now) return
      const x = grabbed.origin.x + (now.x - grabbed.start.x)
      const y = grabbed.origin.y + (now.y - grabbed.start.y)
      setMoved((m) => ({ ...m, [grabbed.name]: { x, y } }))
      return
    }

    const from = dragging.current
    if (!from) return
    const { clientX, clientY } = event
    if (!from.moved) {
      if (Math.hypot(clientX - from.startX, clientY - from.startY) < DRAG_THRESHOLD) return
      from.moved = true
      from.target?.setPointerCapture?.(from.pointerId)
    }
    setView((v) => ({ ...v, x: clientX - from.x, y: clientY - from.y }))
  }

  const onUp = (event) => {
    const grabbed = nodeDrag.current
    nodeDrag.current = null
    if (grabbed?.moved) {
      grabbed.target?.releasePointerCapture?.(grabbed.pointerId)
      suppressClick.current = true
      if (event) event.preventDefault?.()
    }

    const from = dragging.current
    dragging.current = null
    if (from?.moved) {
      from.target?.releasePointerCapture?.(from.pointerId)
      // The browser still fires a click after a drag; swallow it so a pan
      // does not also select whatever happened to be under the cursor.
      suppressClick.current = true
      if (event) event.preventDefault?.()
    }
  }

  if (!diagram || !raw.length) {
    return <div className="wb-diagram-empty">Nothing to draw yet.</div>
  }

  /*
    Frame what is drawn, not the page Iris laid it out on. The layout's own
    width and height include margins, and fitting those shrank every label to
    the edge of legibility. The padding leaves room for names above the
    top row and shunts and values below the bottom one.
  */
  // From the positions before any hand-drag, so dragging a bus past the edge
  // does not reframe the canvas under the pointer.
  const xs = spread.nodes.map((n) => n.x), ys = spread.nodes.map((n) => n.y)
  const minX = Math.min(...xs) - PAD * 1.5, maxX = Math.max(...xs) + PAD * 1.5
  const minY = Math.min(...ys) - PAD, maxY = Math.max(...ys) + PAD * 1.5
  const inferred = !diagram.layout?.trustworthy_geometry

  const pick = (name, kind, payload) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    onSelect({ name, kind, ...payload })
  }
  const isSel = (kind, name) => selected?.kind === kind && selected.name === name

  return (
    <div className="wb-diagram">
      {(inferred || spread.nudged > 0 || nudgedByHand > 0) && (
        <div className="wb-caveat">
          {inferred
            ? `Inferred layout — ${diagram.layout?.inferred_nodes ?? nodes.length} of ${nodes.length} placed from topology. Distance is not line length.`
            : `${spread.nudged} bus${spread.nudged === 1 ? '' : 'es'} moved apart to stop them overlapping. Distance is no longer line length.`}
          {inferred && spread.nudged > 0 && ` ${spread.nudged} moved apart to stop overlaps.`}
          {nudgedByHand > 0 && ` ${nudgedByHand} moved by you.`}
        </div>
      )}

      <svg
        ref={svgRef}
        className="wb-svg"
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerLeave={onUp}
        role="img"
        aria-label={`Single-line diagram of ${diagram.circuit}, ${nodes.length} buses`}
      >
        <g ref={sceneRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {edges.map((edge, i) => (
              <EdgeMark key={`${edge.name}-${i}`} edge={edge} at={at}
                        overlay={overlay} showLoadings={showLoadings}
                        selected={isSel('edge', edge.name)}
                        hovered={hover?.kind === 'edge' && hover.name === edge.name}
                        onEnter={() => setHover({ kind: 'edge', name: edge.name })}
                        onLeave={() => setHover(null)}
                        onPick={() => pick(edge.name, 'edge', { edge })} />
            ))}
          </g>

          <g>
            {nodes.map((node) => (
              <ShuntFan key={`s-${node.name}`} node={node} shunts={byBus[node.name] || []}
                        overlay={overlay}
                        expanded={isSel('bus', node.name)
                          || (selected?.kind === 'shunt' && selected.shunt?.bus === node.name)}
                        selectedName={selected?.kind === 'shunt' ? selected.name : null}
                        onPick={(shunt) => pick(shunt.name, 'shunt', { shunt })} />
            ))}
          </g>

          <g>
            {nodes.map((node) => (
              <BusMark key={node.name} node={node} overlay={overlay}
                       showNames={showNames} showValues={showValues}
                       selected={isSel('bus', node.name)}
                       hovered={hover?.kind === 'bus' && hover.name === node.name}
                       onEnter={() => setHover({ kind: 'bus', name: node.name })}
                       onLeave={() => setHover(null)}
                       onDown={(event) => onBusDown(event, node)}
                       onPick={() => pick(node.name, 'bus', { node })} />
            ))}
          </g>
        </g>
      </svg>

      <div className="wb-zoom">
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <button className="wb-zoom-fit" onClick={() => setView({ x: 0, y: 0, k: 1 })}
                aria-label="Fit to screen">FIT</button>
        {nudgedByHand > 0 && (
          <button className="wb-zoom-fit" onClick={() => setMoved({})}
                  title={`Put back the ${nudgedByHand} bus${nudgedByHand === 1 ? '' : 'es'} you moved`}>
            ↺
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/*
  What a bus is filled with.

  Power flow is the design's three states -- inside limits, outside limits,
  not studied -- and "outside" is whatever the agent flagged, never a limit
  applied here. Fault current and price have no "outside"; they are a scale,
  so they keep their ramp.
*/
function busFill(overlay, name) {
  const value = overlay?.bus?.[name]
  if (value === undefined || value === null) return { fill: PAPER, studied: false }
  if (overlay.id === 'flow') {
    return { fill: overlay.outside?.includes(name) ? INKC : MINT, studied: true }
  }
  const painted = overlay.busRamp ? colourFor(overlay.busRamp, value, 'light') : null
  return { fill: painted || PAPER, studied: Boolean(painted) }
}

function BusMark({ node, overlay, showNames, showValues, selected, hovered,
                   onEnter, onLeave, onDown, onPick }) {
  const isSource = node.kind === 'source'
  const half = isSource ? 26 : BUS_HALF
  const value = overlay?.bus?.[node.name]
  const { fill, studied } = busFill(overlay, node.name)

  return (
    <g transform={`translate(${node.x} ${node.y})`} className="wb-bus"
       onMouseEnter={onEnter} onMouseLeave={onLeave}
       onPointerDown={onDown} onClick={onPick}>
      {selected && (
        <rect x={-half - 7} y={-9} width={half * 2 + 14} height={18} rx={9} fill={MINT} />
      )}
      <rect x={-half - 4} y={-HIT / 2} width={half * 2 + 8} height={HIT}
            fill="transparent" pointerEvents="all" />
      <rect x={-half} y={-3} width={half * 2} height={6} rx={1.5}
            fill={isSource ? INKC : fill} stroke={INKC}
            strokeWidth={hovered && !selected ? 2 : 1.3} />
      {isSource && (
        <path d={SOURCE_GLYPH.cap} fill={INKC} />
      )}
      {(showNames || isSource || selected) && (
        <text x={-half} y={-8} className="wb-label" fontSize={isSource ? 12 : 11}
              fontWeight={selected || isSource ? 600 : 500}>{node.name}</text>
      )}
      {showValues && studied && value !== undefined && (
        <text x={-half} y={17} className="wb-label wb-label-value" fontSize={10}>
          {formatValue(overlay, value)}
        </text>
      )}
    </g>
  )
}

function EdgeMark({ edge, at, overlay, showLoadings, selected, hovered,
                    onEnter, onLeave, onPick }) {
  const a = at[edge.from_bus], b = at[edge.to_bus]
  if (!a || !b) return null

  const dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

  // An unrated branch is never weighted by loading. `rating_a: null` means
  // the model states no rating; drawing it as lightly loaded would invent one.
  const unrated = edge.kind !== 'transformer' && edge.rating_a === null && edge.mva === null
  const loading = overlay?.branch?.[edge.name]
  const binding = overlay?.binding?.includes(edge.name)
  const onPath = overlay?.path?.includes(edge.name)
  const inert = !edge.in_service || edge.closed === false

  let weight = INK.edgeEmphasis
  if (binding) weight = 5.5
  else if (!unrated && loading !== undefined) weight = loadingWeight(loading)
  else if (onPath) weight = 3
  if (hovered && !selected) weight += 0.6

  const dash = inert ? '2 5' : (unrated ? '5 4' : undefined)

  const kind = edge.kind === 'transformer' && edge.windings >= 3 ? 'transformer3' : edge.kind
  const glyph = edgeGlyph(edge.kind, { windings: edge.windings, closed: edge.closed })
  const gap = DEVICE_GAP[kind] ?? 0
  const stub = Math.max(0, (length - gap) / 2)

  const phases = edge.phases?.filter((p) => p !== 0).length || 0
  const showPct = showLoadings && !unrated && loading !== undefined && loading >= 70
  // Text is kept upright whichever way the branch runs.
  const flip = angle > 90 || angle < -90

  return (
    <g className="wb-edge" onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onPick}>
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}>
        {selected && (
          <line x1={-length / 2} y1={0} x2={length / 2} y2={0}
                stroke={MINT} strokeWidth={14} strokeLinecap="round" />
        )}
        <line x1={-length / 2} y1={0} x2={length / 2} y2={0}
              stroke="transparent" strokeWidth={HIT} pointerEvents="stroke" />
        <line x1={-length / 2} y1={0} x2={-length / 2 + stub} y2={0}
              stroke={INKC} strokeWidth={weight} strokeDasharray={dash} />
        <line x1={length / 2 - stub} y1={0} x2={length / 2} y2={0}
              stroke={INKC} strokeWidth={weight} strokeDasharray={dash} />

        {glyph.stroke && (
          <>
            {gap > 0 && <circle r={gap / 2 - 1} fill={PAPER} />}
            <path d={glyph.stroke} fill="none" stroke={INKC}
                  strokeWidth={glyph.width} strokeDasharray={glyph.dash} />
          </>
        )}
        {glyph.fill && <path d={glyph.fill} fill={INKC} />}

        {phases > 0 && phases < 3 && (
          <path d={phaseTicks(phases)} fill="none" stroke={INKC}
                strokeWidth={INK.phaseTick}
                transform={`translate(${-length / 2 + length * 0.3} 0)`} />
        )}
        {glyph.label && (
          <text y={-12} textAnchor="middle" className="wb-label" fontSize={7.5}
                transform={flip ? 'rotate(180)' : undefined}>{glyph.label}</text>
        )}
        {showPct && (
          <text y={flip ? 14 : -8} textAnchor="middle" className="wb-label wb-label-halo"
                fontSize={10.5} transform={flip ? 'rotate(180)' : undefined}>
            {loading.toFixed(0)}%
          </text>
        )}
      </g>
    </g>
  )
}

function ShuntFan({ node, shunts, overlay, expanded, selectedName, onPick }) {
  if (!shunts.length) return null

  // One glyph per *type* with a count, unless the bus is selected. Nine loads
  // on a bus is routine on IEEE 123 and must not read as nine features.
  const groups = {}
  for (const shunt of shunts) {
    const slot = shuntSlot(shunt.kind)
    ;(groups[slot] ||= []).push(shunt)
  }

  // Whatever is drawn is laid out as one row along the bus's right half,
  // counting across all lanes at once so two types never share an offset.
  const lanes = Object.keys(groups).map(Number).sort((x, y) => x - y)
  const row = []
  for (const slot of lanes) {
    const members = groups[slot]
    for (const shunt of (expanded ? members : [members[0]])) {
      row.push({ shunt, count: expanded ? 0 : members.length })
    }
  }

  const drawn = row.map(({ shunt, count }, i) => ({
    shunt,
    count,
    // On the right half of the bus, as the design draws loads, so the value
    // printed under the bus's left end is never covered.
    offset: SHUNT_START + i * SHUNT_PITCH,
    value: overlay?.shunt?.[shunt.name],
  }))

  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      {drawn.map(({ shunt, offset, count, value }, i) => {
        const glyph = shuntGlyph(shunt.kind, {
          on: shunt.on, inService: shunt.in_service,
          fill: value !== undefined ? value : 0,
        })
        const isSelected = selectedName === shunt.name
        return (
          <g key={`${shunt.name}-${i}`} transform={`translate(${offset} 4)`}
             className="wb-shunt"
             onClick={(e) => { e.stopPropagation(); onPick(shunt) }}>
            {isSelected && <circle cx={0} cy={12} r={11} fill={MINT} />}
            <rect x={-8} y={-1} width={16} height={26}
                  fill="transparent" pointerEvents="all" />
            {glyph.stroke && (
              <path d={glyph.stroke} fill="none" stroke={INKC}
                    strokeWidth={isSelected ? glyph.width + 0.4 : glyph.width}
                    strokeDasharray={glyph.dash}
                    opacity={glyph.inert ? glyph.opacity : 1} />
            )}
            {glyph.fill && <path d={glyph.fill} fill={INKC}
                                 opacity={glyph.inert ? glyph.opacity : 1} />}
            {count > 1 && (
              <text x={7} y={16} className="wb-label" fontSize={7}>×{count}</text>
            )}
            {value !== undefined && (
              <text y={30} textAnchor="middle" className="wb-label" fontSize={7}>
                {value.toFixed(1)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function formatValue(overlay, value) {
  if (value === undefined || value === null) return ''
  if (overlay?.id === 'flow') return value.toFixed(3)
  const ramp = overlay?.busRamp
  if (!RAMPS[ramp]) return String(value)
  if (ramp === 'fault') return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} kA`
  if (ramp === 'price') return value.toFixed(2)
  return value.toFixed(0)
}
