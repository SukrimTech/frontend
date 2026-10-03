import { useCallback, useEffect, useRef, useState } from 'react'

/*
  Drag the lines either side of the stage to resize the Assistant and the side panel.

  The default widths are the stylesheet's (`.wb-cols` in workbench.css) and stay untouched
  until somebody drags: a drag sets `--wb-left` / `--wb-right` on the grid, and the
  stylesheet falls back to its own clamp() when they are absent. Double-click a line to put
  that column back. The widths are remembered in this browser only — a per-viewer
  convenience, so a failing localStorage just means the defaults.

  The handles live on the two edges of the stage (`.wb-stage` is positioned), which both the
  model Workbench and EV-charger mode render, so neither needs anything else.
*/

const KEY = 'sukrim-workbench-columns'
const MIN_SIDE = 200
const MIN_STAGE = 360
const MAX_SIDE = 640

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { left: Number(v.left) || null, right: Number(v.right) || null }
  } catch { return { left: null, right: null } }
}

export function useColumnResize() {
  const ref = useRef(null)
  const [w, setW] = useState(load)
  const [dragging, setDragging] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(w)) } catch { /* private mode */ }
  }, [w])

  const start = useCallback((side) => (e) => {
    const grid = ref.current
    if (!grid || e.button !== 0) return
    e.preventDefault()
    const cols = grid.children
    const total = grid.getBoundingClientRect().width
    const startX = e.clientX
    const startLeft = cols[0].getBoundingClientRect().width
    const startRight = cols[cols.length - 1].getBoundingClientRect().width
    setDragging(side)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const move = (ev) => {
      const dx = ev.clientX - startX
      setW((cur) => {
        const left = side === 'left' ? startLeft + dx : (cur.left ?? startLeft)
        const right = side === 'right' ? startRight - dx : (cur.right ?? startRight)
        const room = total - MIN_STAGE
        if (side === 'left') {
          return { ...cur, left: Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, room - right, left))) }
        }
        return { ...cur, right: Math.round(Math.max(MIN_SIDE, Math.min(MAX_SIDE, room - left, right))) }
      })
    }
    const up = () => {
      setDragging(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const reset = (side) => () => setW((cur) => ({ ...cur, [side]: null }))

  const style = {}
  if (w.left) style['--wb-left'] = `${w.left}px`
  if (w.right) style['--wb-right'] = `${w.right}px`

  const handles = (
    <>
      <div className={`wb-resize left${dragging === 'left' ? ' on' : ''}`} role="separator"
           aria-orientation="vertical" aria-label="Resize the assistant"
           title="Drag to resize · double-click to reset"
           onPointerDown={start('left')} onDoubleClick={reset('left')} />
      <div className={`wb-resize right${dragging === 'right' ? ' on' : ''}`} role="separator"
           aria-orientation="vertical" aria-label="Resize the side panel"
           title="Drag to resize · double-click to reset"
           onPointerDown={start('right')} onDoubleClick={reset('right')} />
    </>
  )
  return { ref, style, handles }
}
