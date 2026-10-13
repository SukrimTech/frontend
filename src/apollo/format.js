/*
  How Apollo's numbers and times are written on the page.

  Every time in the snapshot is UTC. A reader in Paris thinks in Paris time, so times are shown
  in the COUNTRY's zone with its abbreviation (CEST, BST), and anything shown in UTC says "UTC".
  National levels are in GW to two decimals (a reader compares 47.25 with 51.80, not 47,251 with
  51,803); errors are in MW, because a forecast that is 0.30 GW off reads as "small" and 300 MW
  does not.
*/

export const MODEL_LABEL = {
  tabpfn_v2: 'TabPFN v2',
  chronos2: 'Chronos-2',
  average: 'Average of the two',
  gbm: 'Gradient boosting',
  persistence: 'Persistence',
  naive_7d: 'Same period, 7 days earlier',
  operator: 'Grid operator',
}

export const OPERATOR_LABEL = {
  'FR.op_d1': 'RTE day-ahead forecast',
  'GB.ndf': 'National Demand Forecast (NDF)',
  'CH.op_da': 'ENTSO-E day-ahead forecast',
}

export const SERIES_LABEL = {
  'FR.load': 'RTE load (éCO2mix real time)',
  'FR.op_d1': 'RTE day-ahead forecast',
  'GB.load': 'Elexon demand outturn (INDO)',
  'GB.ndf': 'Elexon NDF',
  'CH.load': 'Swissgrid end-user consumption (monthly)',
  'CH.entsoe': 'ENTSO-E total load (archived for comparison)',
  'CH.op_da': 'ENTSO-E day-ahead forecast (of total load)',
}

export const ms = (iso) => (iso ? Date.parse(iso) : NaN)

const fmtCache = new Map()
function dtf(tz, opts) {
  const key = tz + JSON.stringify(opts)
  if (!fmtCache.has(key)) {
    // en-GB writes Europe/Paris as CEST and Europe/London as BST; en-US would write GMT+2.
    fmtCache.set(key, new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }))
  }
  return fmtCache.get(key)
}

function parts(t, tz, opts) {
  const out = {}
  for (const p of dtf(tz, opts).formatToParts(new Date(t))) out[p.type] = p.value
  return out
}

/** "Tue 14:30 CEST" */
export function localTime(iso, tz, { day = true, zone = true } = {}) {
  const t = typeof iso === 'number' ? iso : ms(iso)
  if (!Number.isFinite(t)) return '–'
  const p = parts(t, tz, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZoneName: 'short' })
  return `${day ? `${p.weekday} ` : ''}${p.hour}:${p.minute}${zone ? ` ${p.timeZoneName}` : ''}`
}

/** "12 Oct, 21:10 CEST" */
export function localDateTime(iso, tz) {
  const t = typeof iso === 'number' ? iso : ms(iso)
  if (!Number.isFinite(t)) return '–'
  const p = parts(t, tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short' })
  return `${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.timeZoneName}`
}

/** "12 Oct 21:10 UTC" */
export function utcTime(iso) {
  const t = typeof iso === 'number' ? iso : ms(iso)
  if (!Number.isFinite(t)) return '–'
  return `${localDateTime(t, 'UTC').replace(' UTC', '')} UTC`
}

/** Local hour of day 0-23 (for axis ticks). */
export function localHour(t, tz) {
  return Number(parts(t, tz, { hour: '2-digit', hourCycle: 'h23' }).hour)
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export const gw = (mw, nd = 2) => (isNum(mw) ? `${(mw / 1000).toFixed(nd)} GW` : '–')
export const gwNum = (mw, nd = 2) => (isNum(mw) ? (mw / 1000).toFixed(nd) : '–')
export const mwFmt = (mw) => (isNum(mw) ? `${Math.round(mw).toLocaleString('en-GB')} MW` : '–')
export const pct = (v, nd = 1) => (isNum(v) ? `${v.toFixed(nd)} %` : '–')
export const signedMw = (mw) => (isNum(mw) ? `${mw > 0 ? '+' : ''}${Math.round(mw).toLocaleString('en-GB')} MW` : '–')

/** "35 min", "4.6 h", "3.2 d" */
export function age(minutes) {
  if (!isNum(minutes)) return '–'
  const m = Math.abs(minutes)
  if (m < 90) return `${Math.round(m)} min`
  if (m < 48 * 60) return `${(m / 60).toFixed(1)} h`
  return `${(m / 1440).toFixed(1)} d`
}

export const ageSince = (iso, now = Date.now()) => age((now - ms(iso)) / 60000)
