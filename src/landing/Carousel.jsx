import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * The buildings-and-industry products as an endless, wave-shaped 3D carousel.
 *
 * The cards ride along a surface that undulates in depth -- an S-shape held
 * still on screen. The middle of the screen is a crest, so the card there
 * bulges toward the viewer; either side is a trough, so the neighbours hollow
 * away from it; past them the surface rises again. As a card travels it passes
 * crest and trough in turn and bends one way, then the other.
 *
 * CSS cannot bend an element, so every card is cut into SLICES thin vertical
 * strips, each placed and turned onto the wave separately. Each strip holds a
 * full copy of the card and shows only its own column of it, which is what
 * makes the corners, the border and the artwork read as one curved surface.
 * Strips are laid out by distance *along* the curve rather than across the
 * screen, so a card keeps its width wherever on the wave it is.
 *
 * Where the carousel is, `off`, counts in cards and is unbounded: card i is
 * drawn at whichever copy of itself is nearest, so after the fifth card the
 * first comes round again and it never runs out. Two things move it:
 *   - page scroll. The section is pinned for a stretch of scrolling, which
 *     carries the carousel once all the way round, back to the first card.
 *   - a horizontal trackpad swipe or a drag, which spins it freely, either way,
 *     for as long as you keep going.
 *
 * Clicking a card opens it: the wave flattens, the card grows to nearly the
 * whole screen and a detail panel fades in over it, with its neighbours still
 * peeking in at the edges. Sideways input then moves between open cards, and
 * that loops too.
 *
 * The geometry is recomputed every animation frame from two numbers -- where
 * the carousel is and how open it is (`m`, 0 to 1) -- and written straight to
 * the DOM, so nothing re-renders while it moves.
 */

const SLICES = 12
// How much page scroll, in viewport heights, moves the carousel by one card.
const SCROLL_PER = 0.7

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
// The remainder that is always positive: mod(-1, 5) is 4, not -1.
const mod = (a, n) => ((a % n) + n) % n
// Shortest signed distance from a to b on a loop of n.
const wrapDelta = (a, b, n) => { const d = mod(b - a, n); return d > n / 2 ? d - n : d }

/*
 * The wave, as a lookup from distance along it to where that is.
 *
 * Depth is a cosine: z(x) = A (cos(2 pi x / L) - 1) / 2, a crest at x = 0 and
 * troughs at +-L/2. L is two card pitches, so a card centred on screen sits on
 * the crest and the cards either side sit in the troughs. Arc length has no
 * closed form here, so it is integrated numerically once per size, and each
 * strip is placed by searching the table.
 */
function buildWave(A, L, span) {
  const STEP = 2
  const n = Math.ceil((2 * span) / STEP) + 1
  const xs = new Float64Array(n), ss = new Float64Array(n)
  const z = (x) => (A * (Math.cos((2 * Math.PI * x) / L) - 1)) / 2
  let s = 0, px = -span, pz = z(-span)
  for (let i = 0; i < n; i += 1) {
    const x = -span + i * STEP, zz = z(x)
    if (i) s += Math.hypot(x - px, zz - pz)
    xs[i] = x; ss[i] = s; px = x; pz = zz
  }
  const s0 = ss[Math.floor(n / 2)]       // arc length is measured from x = 0
  for (let i = 0; i < n; i += 1) ss[i] -= s0
  return { xs, ss, n, A, L, z }
}

/** Where on the wave arc distance `a` lands: x, depth z and the turn to face out. */
function onWave(w, a) {
  if (w.A < 0.5) return { x: a, z: 0, t: 0 }        // flat
  const { xs, ss, n } = w
  if (a <= ss[0] || a >= ss[n - 1]) return null      // off the end: not drawn
  let lo = 0, hi = n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ss[mid] < a) lo = mid; else hi = mid }
  const f = (a - ss[lo]) / (ss[hi] - ss[lo] || 1)
  const x = xs[lo] + (xs[hi] - xs[lo]) * f
  // Slope dz/dx; the strip turns so its face stays perpendicular to the wave.
  const slope = (-w.A * Math.PI / w.L) * Math.sin((2 * Math.PI * x) / w.L)
  return { x, z: w.z(x), t: -Math.atan(slope) }
}

export default function Carousel({ items, figure }) {
  const wrap = useRef(null)
  const stage = useRef(null)
  const panels = useRef([])          // one open panel per card
  const strips = useRef([])          // strips[i][j]
  const counter = useRef(null)
  const bar = useRef(null)
  const state = useRef({
    off: 0,        // where the carousel is drawn, in cards
    scrolled: 0,   // the part of it that page scroll asks for
    free: 0,       // the part that dragging and swiping add
    openAt: 0,     // while open: where the open card sits
    drag: 0,       // while open: how far a drag in progress has pulled it
    m: 0, mTarget: 0, open: false, active: 0,
    W: 0, H: 0, size: 0, wave: null, waveKey: '',
  })
  const [active, setActive] = useState(null)
  const N = items.length

  const open = useCallback((i) => {
    const s = state.current
    s.open = true; s.active = i; s.mTarget = 1
    // Open the copy of card i nearest to where the carousel already is, so it
    // does not spin the long way round to get there.
    s.openAt = s.off + wrapDelta(s.off, i, N)
    setActive(i)
    // Opened from the keyboard list, the carousel may be scrolled out of view;
    // bring its stage on screen first, or the panel opens where nobody can see it.
    const el = wrap.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.top > 1 || r.bottom < window.innerHeight - 1) {
        const run = el.offsetHeight - window.innerHeight
        const top = r.top + window.scrollY
        window.scrollTo({ top: top + clamp(s.scrolled / N, 0, 1) * run, behavior: 'instant' })
      }
    }
    document.documentElement.style.overflow = 'hidden'
    wrap.current?.closest('.sk')?.classList.add('sk-expanded')
  }, [N])

  const close = useCallback(() => {
    const s = state.current
    if (!s.open) return
    s.open = false; s.mTarget = 0; s.drag = 0
    // The page was locked while open, so `scrolled` has not moved. Leave the
    // carousel exactly where the open card put it.
    s.free = s.openAt - s.scrolled
    document.documentElement.style.overflow = ''
    wrap.current?.closest('.sk')?.classList.remove('sk-expanded')
  }, [])

  const step = useCallback((dir) => {
    const s = state.current
    s.openAt += dir
    s.active = mod(s.active + dir, N)
    setActive(s.active)
  }, [N])

  /* --- the frame loop ---------------------------------------------------- */
  useEffect(() => {
    const s = state.current
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const st = stage.current, el = wrap.current
      if (!st || !el) { raf = requestAnimationFrame(frame); return }
      const vw = st.clientWidth, vh = st.clientHeight

      if (!s.open) {
        const r = el.getBoundingClientRect()
        const run = el.offsetHeight - vh
        s.scrolled = run > 0 ? clamp(-r.top / run, 0, 1) * N : 0
      }
      const target = s.open ? s.openAt + s.drag : s.scrolled + s.free
      const ease = reduced ? 1 : 1 - Math.exp(-dt * 7)
      s.off += (target - s.off) * ease
      if (Math.abs(target - s.off) < 1e-4) s.off = target
      s.m += (s.mTarget - s.m) * (reduced ? 1 : 1 - Math.exp(-dt * 6))
      if (Math.abs(s.m - s.mTarget) < 1e-4) s.m = s.mTarget
      const m = s.m

      // Card size and gap, closed and open.
      const W0 = clamp(vw * 0.44, 280, 800), H0 = W0 * 0.64
      const W1 = vw - 2 * clamp(vw * 0.035, 20, 64), H1 = vh - 2 * clamp(vh * 0.025, 12, 24)
      const W = lerp(W0, W1, m), H = lerp(H0, H1, m)
      const gap = lerp(vw * 0.02, 24, m)
      const pitch = W + gap
      const sw = W / SLICES
      const yC = lerp(-vh * 0.02, 0, m)

      // The wave flattens as a card opens. Rebuilt only when it changes.
      const A = clamp(vw * 0.24, 180, 460) * (1 - m)
      const L = 2 * (W0 + vw * 0.02)
      const key = `${vw}|${A.toFixed(1)}`
      if (key !== s.waveKey) { s.wave = buildWave(A, L, vw * 2.2); s.waveKey = key }
      const wave = s.wave

      // A new size gets a new number. Each strip remembers the number it was
      // last sized to, so one that was off screen when the size changed is
      // brought up to date the moment it comes back -- rather than reappearing
      // at the size it had when the panel was open.
      if (Math.abs(W - s.W) > 0.25 || Math.abs(H - s.H) > 0.25) { s.W = W; s.H = H; s.size += 1 }

      for (let i = 0; i < N; i += 1) {
        // The copy of card i nearest the middle: this is the loop.
        const rel = wrapDelta(s.off, i, N)
        const c = rel * pitch
        // Opening, every card's strips give way to that card's flat panel,
        // drawn in the same place -- the open card and the neighbours peeking
        // in beside it alike.
        const fade = 1 - smooth(0.75, 0.92, m)
        const row = strips.current[i] || []
        for (let j = 0; j < SLICES; j += 1) {
          const node = row[j]
          if (!node) continue
          const p = onWave(wave, c + (j + 0.5 - SLICES / 2) * sw)
          const hidden = !p || Math.abs(p.x) > vw * 0.8 || fade < 0.01
          node.style.visibility = hidden ? 'hidden' : 'visible'
          if (hidden) continue
          if (node._size !== s.size) {
            node._size = s.size
            node.style.width = `${sw + 0.8}px`
            node.style.height = `${H}px`
            node.style.left = `${-(sw + 0.8) / 2}px`
            node.style.top = `${-H / 2}px`
            const face = node.firstChild
            face.style.width = `${W}px`
            face.style.height = `${H}px`
            face.style.left = `${-j * sw}px`
          }
          node.style.transform = `translate3d(${p.x.toFixed(2)}px,${yC.toFixed(2)}px,${p.z.toFixed(2)}px) rotateY(${p.t.toFixed(5)}rad)`
          // Deeper is dimmer, a little, so the wave reads as depth.
          const depth = A > 1 ? clamp(-p.z / A, 0, 1) : 0
          node.style.opacity = (fade * (1 - depth * 0.28)).toFixed(3)
        }
      }

      // The open panels ride the carousel, one per card, so changing card
      // slides the whole row across instead of swapping what one panel says.
      // By the time they show, the wave is flat, so a card's place is simply
      // its distance from the middle times the pitch.
      const show = smooth(0.7, 0.92, m)
      for (let i = 0; i < N; i += 1) {
        const d = panels.current[i]
        if (!d) continue
        const x = wrapDelta(s.off, i, N) * pitch
        const off = show < 0.005 || Math.abs(x) > vw
        d.style.visibility = off ? 'hidden' : 'visible'
        if (off) continue
        d.style.width = `${W}px`; d.style.height = `${H}px`
        d.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${yC.toFixed(2)}px,0)`
        d.style.opacity = show.toFixed(3)
        d.style.pointerEvents = show > 0.5 ? 'auto' : 'none'
      }
      const at = mod(Math.round(s.off), N)
      if (counter.current) counter.current.textContent = `${String(at + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`
      if (bar.current) bar.current.style.transform = `scaleX(${(mod(s.off, N) / N).toFixed(4)})`

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [N])

  /* --- input: sideways wheel, drag, keys --------------------------------- */
  useEffect(() => {
    const st = stage.current
    if (!st) return undefined
    const s = state.current
    let swipe = 0, cool = 0

    const pitch = () => clamp(st.clientWidth * 0.44, 280, 800) + st.clientWidth * 0.02
    // The pitch of the open panels: nearly the full width, plus their gap.
    const pitchOpen = () => st.clientWidth - 2 * clamp(st.clientWidth * 0.035, 20, 64) + 24

    const onWheel = (e) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (s.open) {
        // Let the gallery column scroll; everything else steps between cards.
        if (!sideways && e.target.closest?.('.kc-gallery')) return
        e.preventDefault()
        if (!sideways) return
        swipe += e.deltaX
        const now = performance.now()
        if (Math.abs(swipe) > 60 && now > cool) { step(Math.sign(swipe)); swipe = 0; cool = now + 500 }
        return
      }
      // Sideways spins the carousel; up and down stay ordinary page scroll.
      if (sideways) { e.preventDefault(); s.free += e.deltaX / pitch() }
    }

    let press = null
    const onDown = (e) => {
      // Buttons and links keep their clicks; a drag can start anywhere else,
      // the open panel's picture column included.
      if (e.button !== 0 || e.target.closest?.('button, a')) return
      press = { x: e.clientX, y: e.clientY, last: e.clientX, moved: false, id: e.pointerId }
    }
    const onMove = (e) => {
      if (!press) return
      const dx = e.clientX - press.last
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        press.moved = true
        st.setPointerCapture?.(press.id)
        st.classList.add('dragging')
      }
      if (press.moved) {
        // Closed, a drag spins the carousel. Open, the panels follow the
        // pointer and settle on a card when it lets go.
        if (s.open) s.drag = -(e.clientX - press.x) / pitchOpen()
        else s.free -= dx / pitch()
      }
      press.last = e.clientX
    }
    const onUp = (e) => {
      if (!press) return
      const moved = press.moved, total = e.clientX - press.x
      st.releasePointerCapture?.(press.id)
      st.classList.remove('dragging')
      press = null
      if (moved) {
        if (s.open) {
          // Land on the nearest card; a short, deliberate flick still counts.
          let k = Math.round(s.drag)
          if (!k && Math.abs(total) > 60) k = total < 0 ? 1 : -1
          s.drag = 0
          if (k) step(k)
        }
        return
      }
      if (s.open) {
        // A click on a neighbour peeking in brings it to the middle.
        const near = e.target.closest?.('[data-panel]')
        if (near) {
          const k = wrapDelta(s.active, Number(near.dataset.panel), N)
          if (k) step(k)
        }
        return
      }
      const hit = e.target.closest?.('[data-card]')
      if (hit) open(Number(hit.dataset.card))
    }
    const onKey = (e) => {
      if (!s.open) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }

    st.addEventListener('wheel', onWheel, { passive: false })
    st.addEventListener('pointerdown', onDown)
    st.addEventListener('pointermove', onMove)
    st.addEventListener('pointerup', onUp)
    st.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      st.removeEventListener('wheel', onWheel)
      st.removeEventListener('pointerdown', onDown)
      st.removeEventListener('pointermove', onMove)
      st.removeEventListener('pointerup', onUp)
      st.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close, step, N])

  // Never leave the page scroll-locked if the component goes away open.
  useEffect(() => () => {
    document.documentElement.style.overflow = ''
  }, [])

  return (
    <div className="kc" ref={wrap} style={{ height: `calc(100vh + ${N * SCROLL_PER * 100}vh)` }}>
      <div className="kc-stage" ref={stage}>
        <div className="kc-scene" aria-hidden="true">
          {items.map((it, i) => (
            Array.from({ length: SLICES }, (_, j) => (
              <div key={`${it.n}-${j}`} className="kc-strip" data-card={i}
                   ref={(node) => { (strips.current[i] ||= [])[j] = node }}>
                <Face item={it} total={N} />
              </div>
            ))
          ))}
        </div>

        {/* What a screen reader and the keyboard get: the carousel itself is
            decoration made of sixty copies of five cards. */}
        <ul className="kc-sr">
          {items.map((it, i) => (
            <li key={it.n}><button type="button" onClick={() => open(i)}>Open {it.title}</button></li>
          ))}
        </ul>

        <div className="kc-hud" aria-hidden="true">
          <span ref={counter} className="kc-count">01 / {String(N).padStart(2, '0')}</span>
          <span className="kc-track"><i ref={bar} /></span>
          <span className="kc-hint">Scroll, swipe or drag · click to open</span>
        </div>

        {items.map((it, i) => {
          const current = active === i
          return (
            <div key={it.n} className={`kc-detail${current ? ' current' : ''}`} data-panel={i}
                 ref={(node) => { panels.current[i] = node }}
                 role={current ? 'dialog' : undefined} aria-modal={current ? 'true' : undefined}
                 aria-label={current ? it.title : undefined} aria-hidden={current ? undefined : 'true'}>
              <Detail item={it} total={N} figure={figure} current={current}
                      onPrev={() => step(-1)} onNext={() => step(1)} onClose={close} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* The card's face, as every strip draws it. */
function Face({ item, total }) {
  return (
    <div className="kc-face">
      <div className="kc-face-top">
        <span>{item.tag}</span>
        <span>{item.n} / {String(total).padStart(2, '0')}</span>
      </div>
      <img src={item.art} alt="" draggable="false" className="kc-face-art" />
      <div className="kc-face-foot">
        <span className="kc-face-title">{item.title}</span>
        <span className="kc-arrow">→</span>
      </div>
    </div>
  )
}

/* The open card. Previous and next loop, like the carousel behind it. */
function Detail({ item, total, figure, current, onPrev, onNext, onClose }) {
  // Only the panel in the middle takes the keyboard. The ones peeking in at
  // the edges are still clickable -- a click brings them to the middle.
  const tab = current ? undefined : -1
  return (
    <div className="kc-panel">
      <button type="button" className="kc-close" onClick={onClose} aria-label="Close" data-hover="1" tabIndex={tab}>×</button>
      <div className="kc-panel-text">
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        <div className="kc-chips">
          <span className="kc-arrow kc-arrow-dark">↗</span>
          <span className="kc-chip">{item.tag}</span>
        </div>
        <div className="kc-panel-nav">
          <button type="button" onClick={onPrev} aria-label="Previous product" data-hover="1" tabIndex={tab}>←</button>
          <span>{item.n} / {String(total).padStart(2, '0')}</span>
          <button type="button" onClick={onNext} aria-label="Next product" data-hover="1" tabIndex={tab}>→</button>
        </div>
      </div>
      <div className="kc-gallery" tabIndex={tab}>
        <figure>
          <img src={item.art} alt={`Concept sketch: ${item.title}`} draggable="false" />
          <figcaption>{item.tag}</figcaption>
        </figure>
        {figure && (
          <figure>
            <img src={figure.src} alt={figure.alt} draggable="false" />
            {figure.caption && <figcaption>{figure.caption}</figcaption>}
          </figure>
        )}
      </div>
    </div>
  )
}
