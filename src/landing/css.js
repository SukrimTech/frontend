/*
 * Turn the design's inline CSS text into a React style object.
 *
 * `Sukrim Landing v2.dc.html` carries its layout in `style="..."` strings —
 * around two hundred of them. Hand-converting each into a camelCased object
 * would be a long transcription with a silent failure mode: one mistyped
 * property does not throw, it just quietly stops applying, and comparing the
 * result against the design by eye would not reliably catch it.
 *
 * So the strings are copied across verbatim and parsed here instead. The JSX
 * stays diffable against the design file, which is the property that matters
 * when the brief is "exact copy".
 *
 * Results are memoised because these strings are literals in the render path
 * and re-parsing them on every render would be pure waste.
 */

const cache = new Map()

/** Convert a CSS property name to its React style key. */
function key(prop) {
  // Custom properties keep their exact spelling; React sets them as-is.
  if (prop.startsWith('--')) return prop
  // `-webkit-font-smoothing` -> `WebkitFontSmoothing`, `font-size` -> `fontSize`.
  const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  return prop.startsWith('-ms-') ? camel.replace(/^Ms/, 'ms') : camel
}

/**
 * Parse one inline-style string into a React style object.
 *
 * Splits on top-level semicolons and colons only: `clamp(20px,4vw,56px)` and
 * `url(data:...)` both contain characters that a naive split would cut
 * through, so parens are tracked and the value is taken as everything after
 * the FIRST colon rather than by splitting on every colon.
 */
export function s(text) {
  if (!text) return undefined
  const hit = cache.get(text)
  if (hit) return hit

  const out = {}
  let depth = 0
  let start = 0
  const decls = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ';' && depth === 0) { decls.push(text.slice(start, i)); start = i + 1 }
  }
  decls.push(text.slice(start))

  decls.forEach((decl) => {
    const trimmed = decl.trim()
    if (!trimmed) return
    const colon = trimmed.indexOf(':')
    if (colon < 1) return
    out[key(trimmed.slice(0, colon).trim())] = trimmed.slice(colon + 1).trim()
  })

  cache.set(text, out)
  return out
}
