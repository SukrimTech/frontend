/*
  Reading the snapshot. Selection only: which stored row is "the next hour", which stored
  value is the highest in the next 24 h. No forecast, score or band is derived here — those are
  the service's, and a page that recomputed them would be a second, unaudited copy.
*/

import { isNum, ms } from './format.js'

export const COUNTRY_ORDER = ['FR', 'GB', 'CH']
export const MODEL_ORDER = ['average', 'tabpfn_v2', 'chronos2']

/** The models with a stored issue, the shown one first. */
export function modelsOf(c) {
  const have = Object.keys(c?.latest || {})
  const order = [c?.shown, ...MODEL_ORDER].filter((m, i, a) => m && a.indexOf(m) === i)
  return order.filter((m) => have.includes(m))
}

export function issueOf(c, model) {
  return c?.latest?.[model] || null
}

export function rowsOf(c, model) {
  return (issueOf(c, model)?.rows || []).map((r) => ({ ...r, ms: ms(r.t) }))
}

export function latestActual(c) {
  const a = (c?.actuals || []).filter((x) => isNum(x.value))
  if (a.length) return a[a.length - 1]
  // Swissgrid publishes monthly, so the last 7 days hold nothing: the newest value is older.
  return c?.latest_actual && isNum(c.latest_actual.value) ? c.latest_actual : null
}

/** Minutes in one period of this country's grid. */
export const stepMin = (c) => (c?.freq === '60min' ? 60 : 30)

/** The first stored period that has not started yet (falls back to the issue's first row). */
export function nextRow(rows, now = Date.now()) {
  return rows.find((r) => r.ms >= now && isNum(r.point)) || rows.find((r) => r.lead_h > 0) || null
}

/** The stored row with the highest point in the 24 h after `now`. */
export function peakRow(rows, now = Date.now(), hours = 24) {
  const win = rows.filter((r) => r.ms >= now && r.ms < now + hours * 3.6e6 && isNum(r.point))
  const pool = win.length ? win : rows.filter((r) => r.lead_h > 0 && r.lead_h <= hours && isNum(r.point))
  return pool.reduce((best, r) => (!best || r.point > best.point ? r : best), null)
}

/** The stored row whose lead is closest to `lead` hours. */
export function rowAtLead(rows, lead) {
  return rows.reduce((best, r) => (!best || Math.abs(r.lead_h - lead) < Math.abs(best.lead_h - lead) ? r : best), null)
}

export function newestLog(c) {
  return (c?.issue_log || [])[0] || null
}

export const toPoints = (arr, key, tKey = 't') =>
  (arr || []).map((x) => ({ t: ms(x[tKey]), v: x[key] })).filter((p) => Number.isFinite(p.t))

export const toBand = (arr, lo, hi, tKey = 't') =>
  (arr || []).map((x) => ({ t: ms(x[tKey]), lo: x[lo], hi: x[hi] })).filter((p) => Number.isFinite(p.t))
