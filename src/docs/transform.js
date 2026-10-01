/*
  Translating MkDocs markdown into something react-markdown will take.

  Kept apart from the glob that loads the files so these are ordinary
  functions: `load.js` needs Vite to resolve `import.meta.glob`, and nothing
  here does, which means the transforms can be exercised directly.
*/

/**
 * MkDocs heading slugs, reproduced.
 *
 * The in-page links in the source were written against MkDocs' own
 * algorithm, so anything else here would break every one of them: lowercase,
 * drop everything that is not a letter, digit, space or hyphen, then collapse
 * runs of whitespace into single hyphens. An em dash vanishes rather than
 * becoming a separator, which is why "E10 — impedance magnitude" slugs to
 * `e10-impedance-magnitude` and not `e10--impedance-magnitude`.
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Admonitions: `!!! note "Title"` with a four-space indented body.
 *
 * Rewritten as a blockquote opening with `[!NOTE] Title`, which is the
 * GitHub callout convention and something a custom blockquote renderer can
 * pick apart without a remark plugin.
 */
export function admonitions(text) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i].match(/^!!!\s+(\w+)(?:\s+"([^"]*)")?\s*$/)
    if (!head) { out.push(lines[i]); continue }

    const [, kind, title] = head
    const body = []
    let j = i + 1
    for (; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') { body.push(''); continue }
      if (!/^\s{4}/.test(line)) break
      body.push(line.slice(4))
    }
    // A trailing blank inside the quote would close it early.
    while (body.length && body[body.length - 1] === '') body.pop()

    out.push(`> [!${kind.toUpperCase()}]${title ? ' ' + title : ''}`)
    out.push('>')
    for (const line of body) out.push(line === '' ? '>' : `> ${line}`)
    i = j - 1
  }
  return out.join('\n')
}

/**
 * Display maths.
 *
 * The source uses `\[ … \]`, which is what pymdownx.arithmatex emits for
 * MathJax. remark-math only knows `$$ … $$`, so the fences are swapped. Inline
 * `$ … $` is already common to both.
 */
export function displayMath(text) {
  return text
    .replace(/^(\s*)\\\[\s*$/gm, '$1$$$$')
    .replace(/^(\s*)\\\]\s*$/gm, '$1$$$$')
}

/** `## Heading { #explicit-id }` → `## Heading`, since slugify reproduces it. */
export function headingAnchors(text) {
  return text.replace(/^(#{1,6}\s+.*?)\s*\{\s*#[\w-]+\s*\}\s*$/gm, '$1')
}

export function prepare(raw) {
  return admonitions(displayMath(headingAnchors(raw)))
}

