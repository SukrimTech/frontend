/*
 * The landing page's motion, ported from the design file's own runtime.
 *
 * The design (`Sukrim Landing v2.dc.html`) drives everything from data
 * attributes on the markup rather than from component state — `data-rv` for a
 * reveal, `data-mag` for a magnetic button, `data-lens` for the spotlight over
 * the artwork. Porting it that way keeps the JSX a readable transcription of
 * the design instead of scattering refs through it, and keeps this file a
 * close copy of the original script, which is what makes it checkable against
 * the design.
 *
 * Everything here is cleaned up on unmount: the rAF loop, both observers, the
 * listeners, and the elements appended to <body>. A route change away from the
 * landing page must not leave a cursor or a filter behind.
 */

const EASE = 'cubic-bezier(.2,.75,.2,1)'

/* Hover styles. The design writes them as `style-hover="background:#C6EBC5"`,
 * which its own tooling applies. React renders the attribute verbatim, so the
 * behaviour has to be bound here. The previous inline values are saved and put
 * back on leave, rather than cleared, so a hover does not wipe the base style. */
function bindHover(root, push) {
  root.querySelectorAll('[style-hover]').forEach((el) => {
    const rules = el.getAttribute('style-hover')
    if (!rules) return
    const props = rules.split(';').filter(Boolean).map((r) => {
      const i = r.indexOf(':')
      return [r.slice(0, i).trim(), r.slice(i + 1).trim()]
    })
    const enter = () => {
      el._was = props.map(([k]) => [k, el.style.getPropertyValue(k)])
      props.forEach(([k, v]) => el.style.setProperty(k, v))
    }
    const leave = () => (el._was || []).forEach(([k, v]) => {
      if (v) el.style.setProperty(k, v)
      else el.style.removeProperty(k)
    })
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    el.addEventListener('focus', enter)
    el.addEventListener('blur', leave)
    push(() => {
      el.removeEventListener('mouseenter', enter)
      el.removeEventListener('mouseleave', leave)
      el.removeEventListener('focus', enter)
      el.removeEventListener('blur', leave)
    })
  })
}

/* Types a label out of noise. The source text is cached on the element the
 * first time, because the effect overwrites textContent and a second run would
 * otherwise cache the scrambled version and never recover the real one. */
function scramble(el) {
  if (el._txt == null) el._txt = el.textContent
  const txt = el._txt
  const chars = '01/#_-·<>+'
  const t0 = Date.now()
  const dur = 900
  clearInterval(el._si)
  el._si = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / dur)
    const n = Math.floor(txt.length * p)
    el.textContent = p < 1
      ? txt.slice(0, n) + txt.slice(n).replace(/[^\s]/g, () => chars[(Math.random() * chars.length) | 0])
      : txt
    if (p >= 1) clearInterval(el._si)
  }, 40)
  setTimeout(() => { clearInterval(el._si); el.textContent = txt }, dur + 200)
}

/* Restart the SVG line-drawing animations by re-fetching with a cache-buster.
 * The artwork animates on load via CSS animation-delay, so without this a
 * sketch that scrolls past before it is seen would already be finished. */
function replay(el) {
  const imgs = el.matches?.('img[data-replay]')
    ? [el] : [...el.querySelectorAll('img[data-replay]')]
  imgs.forEach((i) => {
    const base = i.getAttribute('src').split('?')[0]
    i.setAttribute('src', `${base}?r=${Date.now()}`)
  })
}

function hide(el) {
  const t = el.dataset.rv
  const d = +(el.dataset.d || 0)
  el._shown = false
  if (t === 'up') {
    el.style.opacity = '0'
    el.style.transform = 'translateY(48px)'
    el.style.transition = `opacity 1s ${EASE} ${d}ms, transform 1.2s ${EASE} ${d}ms`
  } else if (t === 'fade') {
    el.style.opacity = '0'
    el.style.transition = `opacity 1.4s ease ${d}ms`
  } else if (t === 'line') {
    el.style.transformOrigin = 'left center'
    el.style.transform = 'scaleX(0)'
    el.style.transition = `transform 1.6s cubic-bezier(.7,0,.2,1) ${d + 100}ms`
  } else if (t === 'wipe') {
    el.style.clipPath = 'inset(0 0 100% 0)'
    el.style.transition = `clip-path 1.6s cubic-bezier(.7,0,.2,1) ${d}ms`
  } else if (t === 'mark') {
    el.style.backgroundSize = '0% 100%'
    el.style.transition = `background-size 1.1s cubic-bezier(.7,0,.2,1) ${d + 600}ms`
  } else if (t === 'mask') {
    el.querySelectorAll('[data-w]').forEach((w, i) => {
      w.style.transform = 'translateY(110%) rotate(5deg)'
      w.style.transformOrigin = 'left bottom'
      w.style.transition = `transform 1.3s ${EASE} ${d + i * 70}ms`
    })
  } else if (t === 'scramble') {
    el.style.opacity = '0'
  }
}

function show(el) {
  const t = el.dataset.rv
  const d = +(el.dataset.d || 0)
  if (t === 'up' || t === 'fade') { el.style.opacity = '1'; el.style.transform = 'none' }
  else if (t === 'line') el.style.transform = 'scaleX(1)'
  else if (t === 'wipe') el.style.clipPath = 'inset(0 0 0% 0)'
  else if (t === 'mark') el.style.backgroundSize = '100% 100%'
  else if (t === 'mask') el.querySelectorAll('[data-w]').forEach((w) => { w.style.transform = 'none' })
  else if (t === 'scramble') setTimeout(() => { el.style.opacity = '1'; scramble(el) }, d)
  replay(el)
}

/* The displacement filter that gives the sketches their hand-drawn wobble.
 * It lives in a 0x0 SVG on <body> because the artwork references it by id. */
function wobbleFilter() {
  if (document.getElementById('sk-wob')) return null
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  const filter = document.createElementNS(NS, 'filter')
  filter.id = 'sk-wob'
  filter.setAttribute('x', '-3%'); filter.setAttribute('y', '-3%')
  filter.setAttribute('width', '106%'); filter.setAttribute('height', '106%')
  const turb = document.createElementNS(NS, 'feTurbulence')
  turb.setAttribute('type', 'fractalNoise')
  turb.setAttribute('baseFrequency', '0.022')
  turb.setAttribute('numOctaves', '2')
  turb.setAttribute('seed', '4')
  const disp = document.createElementNS(NS, 'feDisplacementMap')
  disp.setAttribute('in', 'SourceGraphic')
  disp.setAttribute('scale', '7')
  filter.append(turb, disp)
  svg.appendChild(filter)
  document.body.appendChild(svg)
  return svg
}

/**
 * Wire the landing page's motion. Call from an effect with the section root.
 *
 * `motion` and `customCursor` mirror the design's own props. Both are also
 * gated on the environment: no motion under `prefers-reduced-motion`, and no
 * cursor, magnetic buttons or lens on a coarse pointer, where there is no
 * hover to drive them and the thumbnails are shown inline instead.
 *
 * Returns a teardown function.
 */
export function startMotion(root, { motion: wantMotion = true, customCursor = true } = {}) {
  if (!root) return () => {}

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const motion = wantMotion && !reduced
  const fine = matchMedia('(pointer: fine)').matches
  const useCursor = customCursor && fine && motion

  const offs = []
  const spawned = []
  const push = (fn) => offs.push(fn)
  const on = (target, ev, handler, opts) => {
    target.addEventListener(ev, handler, opts)
    push(() => target.removeEventListener(ev, handler, opts))
  }
  const all = (sel) => [...root.querySelectorAll(sel)]

  // Without hover there is no preview, so the thumbnails go inline.
  if (!fine) all('[data-thumb]').forEach((t) => { t.style.display = 'block' })

  bindHover(root, push)

  let io = null
  let safety = null
  if (motion) {
    const els = all('[data-rv]')
    els.forEach(hide)
    const reveal = (el) => {
      if (el._shown) return
      el._shown = true
      io?.unobserve(el)
      show(el)
    }
    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) reveal(e.target) }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    els.forEach((el) => io.observe(el))
    void document.body.offsetHeight
    setTimeout(() => els.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.top < innerHeight && r.bottom > 0) reveal(el)
    }), 30)

    /* If the main thread is starved the transitions never run and the page
     * would sit invisible. Count frames; if too few landed, drop the
     * transitions and show everything at once rather than show nothing. */
    let frames = 0
    const count = () => { frames += 1; if (frames < 20) requestAnimationFrame(count) }
    requestAnimationFrame(count)
    safety = setTimeout(() => {
      const starved = frames < 10
      els.forEach((el) => {
        if (starved) {
          el.style.transition = 'none'
          el.querySelectorAll('[data-w]').forEach((w) => { w.style.transition = 'none' })
          el._shown = false
        }
        reveal(el)
      })
      if (starved) document.getAnimations().forEach((a) => { try { a.finish() } catch { /* already done */ } })
    }, 2800)
  }

  // The big number beside the agent list, following whichever is centred.
  const idx = root.querySelector('[data-agent-idx]')
  const agentIo = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting && idx && idx.textContent !== e.target.dataset.agent) {
        idx.textContent = e.target.dataset.agent
        if (motion) {
          idx.animate(
            [{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 500, easing: EASE },
          )
        }
      }
    }),
    { rootMargin: '-45% 0px -45% 0px' },
  )
  all('[data-agent]').forEach((a) => agentIo.observe(a))

  let mx = innerWidth / 2
  let my = innerHeight / 2
  let cx = mx; let cy = my; let px = mx; let py = my
  let cs = 1; let ct = 1
  let cursor = null; let preview = null; let previewImg = null; let previewOn = false
  let ring = null

  if (useCursor) {
    cursor = document.createElement('div')
    cx = -100; cy = -100; mx = -100; my = -100
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', transform: 'translate3d(-100px,-100px,0)',
      width: '16px', height: '16px', marginLeft: '-8px', marginTop: '-8px',
      borderRadius: '50%', background: '#C6EBC5', border: '1px solid #111111',
      pointerEvents: 'none', zIndex: '100', mixBlendMode: 'multiply',
    })
    document.body.appendChild(cursor); spawned.push(cursor)

    preview = document.createElement('div')
    Object.assign(preview.style, {
      position: 'fixed', left: '0', top: '0', width: '360px', height: '270px',
      marginLeft: '-180px', marginTop: '-135px', background: '#FFFFFF',
      border: '1px solid #111111', pointerEvents: 'none', zIndex: '90',
      opacity: '0', transition: 'opacity .35s ease',
    })
    previewImg = document.createElement('img')
    Object.assign(previewImg.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block' })
    preview.appendChild(previewImg)
    document.body.appendChild(preview); spawned.push(preview)

    on(document, 'mouseover', (e) => {
      ct = e.target.closest?.('a,button,[data-hover]') ? 3.2 : 1
    })
    all('[data-pv]').forEach((row) => {
      on(row, 'mouseenter', () => {
        previewImg.src = `${row.dataset.pv}?r=${Date.now()}`
        previewOn = true
        preview.style.opacity = '1'
        ct = 0.001
      })
      on(row, 'mouseleave', () => { previewOn = false; preview.style.opacity = '0' })
    })
  }
  on(window, 'mousemove', (e) => { mx = e.clientX; my = e.clientY }, { passive: true })

  const mags = motion && fine ? all('[data-mag]') : []
  mags.forEach((m) => {
    m.style.transition = `${m.style.transition ? `${m.style.transition},` : ''}transform .35s ${EASE}`
  })

  const filterSvg = wobbleFilter()
  if (filterSvg) spawned.push(filterSvg)
  all('[data-lens-base]').forEach((i) => { i.style.filter = 'url(#sk-wob)' })

  const lenses = all('[data-lens]').map((el) => ({
    el, box: el.parentElement, clear: el.querySelector('[data-lens-clear]'), r: 0,
  }))
  if (useCursor) {
    ring = document.createElement('div')
    Object.assign(ring.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0',
      borderRadius: '50%', border: '1.5px solid #111111', pointerEvents: 'none',
      zIndex: '99', opacity: '0', boxSizing: 'border-box',
    })
    document.body.appendChild(ring); spawned.push(ring)
  } else {
    // No pointer to carry the spotlight, so show the artwork at full clarity
    // rather than leaving it permanently clipped to nothing.
    lenses.forEach((L) => { if (L.clear) L.clear.style.clipPath = 'none' })
  }

  const nav = root.querySelector('[data-nav]')
  const bar = root.querySelector('[data-progress]')
  const marquees = all('[data-marquee]').map((el) => ({
    el, track: el.firstElementChild, off: 0, dir: +(el.dataset.dir || 1),
  }))

  let lastY = scrollY
  let vel = 0
  let navHidden = false
  let raf = 0

  const tick = () => {
    const y = scrollY
    vel += ((y - lastY) - vel) * 0.1
    if (nav) {
      if (y > lastY + 3 && y > 200 && !navHidden) { nav.style.transform = 'translateY(-100%)'; navHidden = true }
      else if (y < lastY - 3 && navHidden) { nav.style.transform = 'none'; navHidden = false }
    }
    lastY = y
    if (bar) {
      const h = document.documentElement.scrollHeight - innerHeight
      bar.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`
    }
    if (motion) {
      marquees.forEach((m) => {
        const w = m.track.scrollWidth / 2
        if (!w) return
        m.off -= (0.6 + Math.min(12, Math.abs(vel) * 0.35)) * m.dir
        if (m.off <= -w) m.off += w
        if (m.off > 0) m.off -= w
        m.track.style.transform = `translate3d(${m.off}px,0,0)`
      })
    }
    if (cursor) {
      cx += (mx - cx) * 0.22; cy += (my - cy) * 0.22; cs += (ct - cs) * 0.15
      cursor.style.transform = `translate3d(${cx}px,${cy}px,0) scale(${cs})`
      let widest = 0
      lenses.forEach((L) => {
        if (!L.clear) return
        const vb = L.box.getBoundingClientRect()
        const b = L.el.getBoundingClientRect()
        const inside = mx >= vb.left && mx <= vb.right && my >= vb.top && my <= vb.bottom
        L.r += ((inside ? 150 : 0) - L.r) * 0.16
        if (!inside && L.r < 0.5) L.r = 0
        L.clear.style.clipPath =
          `circle(${L.r.toFixed(1)}px at ${(cx - b.left).toFixed(1)}px ${(cy - b.top).toFixed(1)}px)`
        if (L.r > widest) widest = L.r
      })
      if (ring) {
        ring.style.width = `${(2 * widest).toFixed(1)}px`
        ring.style.height = ring.style.width
        ring.style.transform = `translate3d(${(cx - widest).toFixed(1)}px,${(cy - widest).toFixed(1)}px,0)`
        ring.style.opacity = widest > 2 ? '1' : '0'
      }
      const dx = mx - px
      px += dx * 0.12
      py += (my - py) * 0.12
      if (preview) {
        preview.style.transform =
          `translate3d(${px + 40}px,${py}px,0) rotate(${Math.max(-8, Math.min(8, dx * 0.06))}deg) ` +
          `scale(${previewOn ? 1 : 0.85})`
      }
    }
    mags.forEach((m) => {
      const r = m.getBoundingClientRect()
      const ox = mx - (r.left + r.width / 2)
      const oy = my - (r.top + r.height / 2)
      m.style.transform = Math.hypot(ox, oy) < 110 ? `translate(${ox * 0.28}px,${oy * 0.35}px)` : ''
    })
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(safety)
    io?.disconnect()
    agentIo.disconnect()
    offs.forEach((f) => f())
    spawned.forEach((e) => e.remove())
  }
}
