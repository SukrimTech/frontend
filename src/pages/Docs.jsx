import { useEffect, useMemo, useRef } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { NAV, has, pages, resolveLink, slugify, titleOf } from '../docs/load.js'

/*
  The documentation, rendered by the app rather than by a second static site.

  One server, one design language, and one copy of the markdown: these are the
  same files MkDocs builds, translated at import time. Formulas go through
  KaTeX, which is enough for everything the docs use and needs no network.
*/

const ALERT = {
  NOTE: { label: 'Note', tone: 'info' },
  ABSTRACT: { label: '', tone: 'accent' },
  WARNING: { label: 'Warning', tone: 'warn' },
  DANGER: { label: '', tone: 'error' },
  BUG: { label: 'Open bug', tone: 'error' },
  QUOTE: { label: '', tone: 'quiet' },
  TIP: { label: 'Tip', tone: 'good' },
}

export default function Docs() {
  const params = useParams()
  const { hash, pathname } = useLocation()
  const contentRef = useRef(null)

  const id = params['*'] && has(params['*']) ? params['*'] : 'index'
  const page = pages[id]

  // Follow an in-page anchor after the markdown has actually rendered; on a
  // fresh navigation the element does not exist yet when the route changes.
  useEffect(() => {
    if (!hash) { contentRef.current?.scrollTo?.(0, 0); window.scrollTo(0, 0); return }
    const target = document.getElementById(hash.slice(1))
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, pathname])

  const components = useMemo(() => build(id), [id])

  if (!page) {
    return (
      <div className="page docs">
        <p>No such page. <Link to="/docs">Back to the documentation.</Link></p>
      </div>
    )
  }

  return (
    <div className="docs-shell">
      <nav className="docs-nav" aria-label="Documentation">
        {NAV.map((group, i) => (
          <div key={i} className="docs-nav-group">
            {group.section && <div className="docs-nav-head mono">{group.section}</div>}
            {group.items.map(([pageId, label]) => (
              <NavLink key={pageId} to={`/docs/${pageId}`} end
                       className={({ isActive }) =>
                         isActive || (pageId === 'index' && id === 'index')
                           ? 'docs-link active' : 'docs-link'}>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <article className="docs-body md" ref={contentRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
          components={components}
        >
          {page.body}
        </ReactMarkdown>
        <footer className="docs-foot">
          <span className="mono">{id}.md</span>
          <span>·</span>
          <Link to="/workbench">Open the workbench</Link>
        </footer>
      </article>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function build(id) {
  const heading = (level) => function Heading({ children, ...rest }) {
    const Tag = `h${level}`
    const slug = slugify(flatten(children))
    return (
      <Tag id={slug} {...rest}>
        <a className="anchor" href={`#${slug}`} aria-label="Link to this section">#</a>
        {children}
      </Tag>
    )
  }

  return {
    h1: heading(1), h2: heading(2), h3: heading(3),
    h4: heading(4), h5: heading(5), h6: heading(6),

    a({ href, children, ...rest }) {
      const to = resolveLink(href, id)
      if (to?.startsWith('/')) return <Link to={to} {...rest}>{children}</Link>
      return <a href={to} {...rest} target={to?.startsWith('http') ? '_blank' : undefined}
                rel={to?.startsWith('http') ? 'noreferrer' : undefined}>{children}</a>
    },

    // Wide tables and code blocks scroll inside themselves; the page never
    // scrolls sideways.
    table: ({ children, ...rest }) => (
      <div className="table-wrap"><table {...rest}>{children}</table></div>
    ),
    pre: ({ children, ...rest }) => (
      <pre className="docs-pre" {...rest}>{children}</pre>
    ),

    blockquote({ children, ...rest }) {
      const text = flatten(children)
      const match = text.match(/^\s*\[!(\w+)\]\s*(.*)/)
      if (!match) return <blockquote {...rest}>{children}</blockquote>

      const [, rawKind, rest_] = match
      const kind = ALERT[rawKind] ?? { label: rawKind, tone: 'info' }
      const title = rest_.split('\n')[0].trim() || kind.label
      return (
        <div className={`adm adm-${kind.tone}`}>
          {title && <div className="adm-title">{title}</div>}
          <div className="adm-body">{strip(children)}</div>
        </div>
      )
    },
  }
}

/** The text of a React children tree, for slugs and alert detection. */
function flatten(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  if (node.props?.children) return flatten(node.props.children)
  return ''
}

/**
 * Drop the `[!TYPE] Title` marker paragraph from an alert's body.
 *
 * It arrives as the first paragraph of the blockquote, so the paragraph is
 * rebuilt without its leading marker rather than removed — a one-line
 * admonition would otherwise lose its whole content.
 */
function strip(children) {
  const list = Array.isArray(children) ? children : [children]
  let done = false
  return list.map((child, i) => {
    if (done || typeof child === 'string') return child
    const text = flatten(child)
    if (!/^\s*\[!\w+\]/.test(text)) return child
    done = true
    const kids = child.props?.children
    const rest = Array.isArray(kids) ? kids.slice(1) : []
    // The marker paragraph holds only the title; anything after it is body.
    return rest.length ? <p key={i}>{rest}</p> : null
  })
}
