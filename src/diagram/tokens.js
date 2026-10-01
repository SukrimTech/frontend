/*
  The visual language, ported verbatim from the Iris design project
  (claude.ai/design "Iris design system spec", artboards 1a and 2a).

  Four ramps, and they are not interchangeable — each answers a different
  question and two of them would be actively wrong as the other's kind:

    volt   diverging about 1.00 pu, because both directions are faults
    load   sequential 0-100 %, plus two states past the end: binding and over
    fault  sequential and LOGARITHMIC. IEEE 13 runs 2.3 kA to 2,311 kA because
           its substation transformer is deliberately stiffened, so a linear
           ramp puts every real bus in the first 0.1 % of the scale
    price  sequential, and usually flat — which is what uncongested means
*/

export const RAMPS = {
  volt: {
    light: ['#17408c', '#4c78c8', '#9db8de', '#c3bfb6', '#e8b784', '#d1802f', '#8f4a07'],
    dark: ['#2c5fd0', '#5f8ef0', '#96b6ee', '#4a4842', '#d6a05e', '#f79009', '#c26a10'],
    at: [0.90, 0.94, 0.97, 1.00, 1.03, 1.06, 1.10],
    labels: ['0.90', '0.94', '0.97', '1.00', '1.03', '1.06', '1.10'],
    unit: 'pu', diverging: true,
  },
  load: {
    light: ['#dcd7cd', '#b3bcc6', '#8397ad', '#566f92', '#2e4d7a', '#6941c6', '#b42318'],
    dark: ['#2e2e33', '#46505e', '#5f7391', '#7c9ac4', '#a9c4ea', '#b692f6', '#f97066'],
    at: [0, 25, 50, 75, 100],
    labels: ['0 %', '25 %', '50 %', '75 %', '100 %', 'binding', 'over'],
    unit: '%',
  },
  fault: {
    light: ['#cfd6d2', '#9dbcb6', '#66a09a', '#1c5c5d', '#0b3a3c'],
    dark: ['#263033', '#3a5a5c', '#4f8285', '#93cfcc', '#c2e8e3'],
    at: [2, 10, 100, 1000, 2311],
    labels: ['2 kA', '10 kA', '100 kA', '1 000', '2 311'],
    unit: 'kA', log: true,
  },
  price: {
    light: ['#efe9dc', '#ddcfb0', '#c6ae7c', '#a98a4a', '#5c4207'],
    dark: ['#2a271f', '#4a4128', '#6d5c33', '#c0a45c', '#e6cc84'],
    at: [28, 42, 56, 70, 98],
    labels: ['28', '42', '56', '70', '98'],
    unit: '/MWh',
  },
}

// The two states past the end of the loading ramp. A branch AT its limit is
// categorically different from one at 99 %: it is constraining the answer.
export const BINDING = { light: '#6941c6', dark: '#b692f6' }

/*
  The prominence ladder. Ink is allocated by how often an element occurs,
  inverted — 91 loads on IEEE 123 must read as population, not as 91 features,
  and a load is never allowed to outweigh the conductor it hangs from.
*/
export const INK = {
  source: 8,
  bus: 5.5,
  busQuiet: 4.5,
  edge: 1.4,
  edgeEmphasis: 1.8,
  machine: 1.6,
  load: 1.2,
  loadOpacity: 0.85,
  phaseTick: 1.3,
  inertOpacity: 0.45,
}

// Shunt glyphs fan horizontally, one slot per *type*, at this pitch.
export const SHUNT_PITCH = 16
export const SHUNT_SLOTS = ['load', 'capacitor', 'machine']

/** Interpolate a ramp. `t` in [0,1]; returns a hex string. */
export function sample(stops, t) {
  if (!stops.length) return '#888888'
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.floor(x)
  if (i >= stops.length - 1) return stops[stops.length - 1]
  return mix(stops[i], stops[i + 1], x - i)
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255]
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb)
  const to = (v) => Math.round(v).toString(16).padStart(2, '0')
  return `#${to(r1 + (r2 - r1) * t)}${to(g1 + (g2 - g1) * t)}${to(b1 + (b2 - b1) * t)}`
}

/**
 * Where a value sits on a ramp, as a fraction.
 *
 * The fault ramp is logarithmic and that is not a stylistic choice: three
 * orders of magnitude on a linear scale shows nothing, and a reader who
 * assumes linear misjudges by 100x. The legend says so too.
 */
export function position(ramp, value) {
  const at = ramp.at
  if (value === null || value === undefined || Number.isNaN(value)) return null
  if (ramp.log) {
    const lo = Math.log10(Math.max(at[0], 1e-9))
    const hi = Math.log10(at[at.length - 1])
    return (Math.log10(Math.max(value, 1e-9)) - lo) / (hi - lo)
  }
  const lo = at[0], hi = at[at.length - 1]
  return (value - lo) / (hi - lo)
}

export function colourFor(kind, value, theme) {
  const ramp = RAMPS[kind]
  if (!ramp) return null
  const t = position(ramp, value)
  if (t === null) return null
  const stops = ramp[theme] || ramp.light
  const usable = kind === 'load' ? stops.slice(0, 5) : stops
  return sample(usable, t)
}
