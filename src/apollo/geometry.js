/*
  Chart geometry shared by Apollo's figures: how wide a chart is, and which round values its
  axis shows. Kept apart from charts.jsx so that file exports components only.
*/

import { useEffect, useRef, useState } from 'react'
import { isNum } from './format.js'

/** The width of an element, kept current. */
export function useWidth(fallback = 760) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Round tick values covering [lo, hi], about `n` of them. */
export function niceTicks(lo, hi, n = 5) {
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return [lo]
  const raw = (hi - lo) / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}

