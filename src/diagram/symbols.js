/*
  IEC 60617 / IEEE 315 glyphs, as path data.

  Every symbol is expressed in its own local frame, centred on the origin, so
  the renderer can drop one at an edge's midpoint and rotate it to the edge's
  angle without the geometry caring. Edge devices interrupt the conductor by
  the same 26 units whatever they are, so a device is legible as *a device*
  before it is identified.

  The shapes are not ours to improve: a transformer is two interlocking
  circles, a capacitor two parallel plates, a load a filled arrowhead. What was
  designed is everything around them — weight, size, where the label sits, what
  survives at 12 px.
*/

const n = (v) => Math.round(v * 10) / 10
const seg = (x1, y1, x2, y2) => `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`
const arc = (cx, cy, r) =>
  `M ${n(cx - r)} ${n(cy)} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
const tri = (x, y, w, h) => `M ${n(x - w)} ${n(y)} L ${n(x + w)} ${n(y)} L ${n(x)} ${n(y + h)} Z`
const rect = (x, y, w, h) => `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} z`

/** How much of the conductor an edge device eats, in local units. */
export const DEVICE_GAP = {
  line: 0, switch: 22, transformer: 26, transformer3: 30, regulator: 26,
}

/**
 * The glyph for something sitting in a branch, centred on the origin and
 * drawn along the +x axis.
 *
 * `stroke` paths take the branch colour; `fill` paths are solid.
 */
export function edgeGlyph(kind, { windings = 2, closed = true } = {}) {
  switch (kind) {
    case 'switch':
      if (closed === false) {
        // A gap plus a blade swung 40 degrees — never a colour change, because
        // colour is already carrying loading.
        return {
          stroke: [seg(-11, 0, 2, -11), seg(-11, -4.5, -11, 4.5), seg(11, -4.5, 11, 4.5)].join(' '),
          fill: '', width: 1.8, label: 'open',
        }
      }
      if (closed === null || closed === undefined) {
        return {
          stroke: [seg(-11, 0, 4, -6), seg(-11, -4.5, -11, 4.5), seg(11, -4.5, 11, 4.5)].join(' '),
          fill: '', width: 1.8, dash: '2 2', label: 'state unknown', warn: true,
        }
      }
      return {
        stroke: [seg(-7, -4.5, -7, 4.5), seg(7, -4.5, 7, 4.5)].join(' '),
        fill: rect(-3, -3, 6, 6), width: 1.4,
      }

    case 'transformer':
      if (windings >= 3) {
        return {
          stroke: [arc(-6, 0, 6), arc(6, 0, 6), arc(0, 9, 6)].join(' '),
          fill: '', width: 1.4,
        }
      }
      return { stroke: [arc(-5, 0, 6.5), arc(5, 0, 6.5)].join(' '), fill: '', width: 1.4 }

    case 'regulator':
      // A transformer plus the control arrow through it.
      return {
        stroke: [arc(-5, 0, 6.5), arc(5, 0, 6.5), seg(-10, 10, 10, -9)].join(' '),
        fill: 'M 10 -9 L 3.5 -7.5 L 7 -3 Z', width: 1.4,
      }

    default:
      return { stroke: '', fill: '', width: 1.4 }
  }
}

/**
 * The glyph for something hanging off a bus, drawn downwards from the origin.
 *
 * A load is the quietest mark in the whole system — 1.2 px, faint, 85 % — and
 * multiples collapse to one glyph with a count, because ninety-one arrowheads
 * are a population and not ninety-one features.
 */
export function shuntGlyph(kind, { on = true, inService = true, fill = 0 } = {}) {
  if (!inService) {
    return { stroke: seg(0, 0, 0, 8), fill: tri(0, 8, 5, 9), width: 1.2,
             dash: '2 2', opacity: 0.45, inert: true }
  }
  switch (kind) {
    case 'load':
      return { stroke: seg(0, 0, 0, 8), fill: tri(0, 8, 5, 9), width: 1.2, opacity: 0.85 }

    case 'capacitor':
      if (on === false) {
        // Stem broken, blade swung: it is switched out, not absent.
        return {
          stroke: [seg(0, 0, 0, 2.5), seg(0, 2.5, 5, 6.5),
                   seg(-6.5, 8, 6.5, 8), seg(-6.5, 12, 6.5, 12)].join(' '),
          fill: '', width: 1.6, opacity: 1,
        }
      }
      return {
        stroke: [seg(0, 0, 0, 7), seg(-6.5, 8, 6.5, 8), seg(-6.5, 12, 6.5, 12)].join(' '),
        fill: '', width: 1.6, opacity: 1,
      }

    case 'generator':
      // The fill radius carries the output, so a machine at rest is hollow.
      return {
        stroke: [seg(0, 0, 0, 6), arc(0, 13, 7)].join(' '),
        fill: fill > 0 ? arc(0, 13, Math.max(1.5, 7 * Math.sqrt(Math.min(fill, 1)))) : '',
        width: 1.6, opacity: 1,
      }

    case 'pvsystem':
      // Square and diagonal — never a machine circle, because it behaves
      // differently in every study.
      return {
        stroke: [seg(0, 0, 0, 6), rect(-7, 6, 14, 13), seg(-7, 19, 7, 6)].join(' '),
        fill: fill > 0 ? rect(-7, 6 + 13 * (1 - Math.min(fill, 1)), 14, 13 * Math.min(fill, 1)) : '',
        width: 1.5, opacity: 1,
      }

    default:
      return { stroke: '', fill: '', width: 1.2, opacity: 0.85 }
  }
}

/** Which fan slot a shunt kind occupies. Machines share one. */
export function shuntSlot(kind) {
  if (kind === 'load') return 0
  if (kind === 'capacitor') return 1
  return 2
}

/**
 * Phase ticks across a conductor, at 30 % along, 5 units apart.
 *
 * Below half zoom the three-phase ticks are dropped and only 1 and 2 phase
 * keep a numeral — those are the ones that change what a fault *means*. A
 * three-phase fault on a single-phase lateral is not a small current; it is
 * not a fault.
 */
export function phaseTicks(count) {
  if (!count || count > 3) return ''
  const offsets = count === 3 ? [-5, 0, 5] : count === 2 ? [-2.5, 2.5] : [0]
  return offsets.map((dx) => seg(dx, -5, dx, 5)).join(' ')
}

export const SOURCE_GLYPH = {
  bar: rect(-24, -1.25, 48, 2.5),
  cap: tri(0, -20, 7, 8),
}
