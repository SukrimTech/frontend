/*
  The documentation, compiled into the app.

  The markdown lives in the Sukrim repository's docs/ -- found through the
  `@sukrim-docs` alias, which vite.config.js points at ../Sukrim/docs or at
  SUKRIM_DOCS -- and is written for MkDocs, so four pieces of its syntax have
  to be translated before react-markdown will take it. Doing that here rather
  than rewriting the source keeps one copy of the docs: the same files build
  the static site and feed this page.
*/

const FILES = import.meta.glob('@sukrim-docs/**/*.md', {
  query: '?raw', import: 'default', eager: true,
})

// The order mkdocs.yml declares. Explicit rather than derived, because
// alphabetical would open the reference before the overview.
export const NAV = [
  { section: null, items: [['index', 'Home']] },
  {
    section: 'The agents',
    items: [
      ['agents/index', 'Overview'],
      ['agents/ariadne', 'Ariadne — power flow'],
      ['agents/argus', 'Argus — fault analysis'],
      ['agents/themis', 'Themis — economic dispatch'],
      ['agents/ananke', 'Ananke — DC power flow and LOPF'],
      ['agents/iris', 'Iris — the diagram'],
      ['agents/pythia', 'Pythia — EV charger siting'],
      ['agents/hermes', 'Hermes — routing'],
    ],
  },
  {
    section: 'The Feeder IR',
    items: [
      ['ir/index', 'Overview'],
      ['ir/quantity', 'The Quantity'],
      ['ir/units', 'Units'],
      ['ir/elements', 'Element reference'],
      ['ir/mapping', 'From a file to the IR'],
      ['ir/crossref', 'Cross-reference'],
    ],
  },
]

/** `…/docs/agents/argus.md` → `agents/argus` */
function idOf(path) {
  return path.replace(/^.*\/docs\//, '').replace(/\.md$/, '')
}

import { prepare, slugify } from './transform.js'

export { slugify }

const PAGES = {}
for (const [path, raw] of Object.entries(FILES)) {
  const id = idOf(path)
  const title = (String(raw).match(/^#\s+(.+)$/m) || [null, id])[1]
  PAGES[id] = { id, title: title.trim(), body: prepare(String(raw)) }
}

export const pages = PAGES
export const has = (id) => Object.prototype.hasOwnProperty.call(PAGES, id)

/**
 * Resolve a link written for MkDocs against the page it appears on.
 *
 * `../ir/index.md` from `agents/argus` is `/docs/ir/index`; a bare `#anchor`
 * stays put; anything absolute is left alone so external links still work.
 */
export function resolveLink(href, fromId) {
  if (!href) return href
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href
  if (href.startsWith('/')) return href

  const [target, hash] = href.split('#')
  if (!target) return `#${hash}`

  const base = fromId.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') base.pop()
    else base.push(part)
  }
  const id = base.join('/').replace(/\.md$/, '')
  return `/docs/${id}${hash ? `#${hash}` : ''}`
}

export function titleOf(id) {
  for (const group of NAV) {
    for (const [pageId, label] of group.items) if (pageId === id) return label
  }
  return PAGES[id]?.title ?? id
}
