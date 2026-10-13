/*
  The Load forecast dashboard's panels. Each reads one part of the snapshot and draws it; none of
  them computes a forecast or a score. Missing fields are normal (Switzerland's actuals arrive
  monthly), so a panel shows a dash or a one-line status rather than an empty frame.
*/

import { useState } from 'react'
import { Sparkline, TimeChart, Legend } from './charts.jsx'
import { MODEL_LABEL, gw, gwNum, isNum, localTime, ms, mwFmt, pct, signedMw } from './format.js'
import { COUNTRY_ORDER, latestActual, nextRow, peakRow, rowsOf, toBand, toPoints } from './data.js'

const GW_AXIS = (v) => (v / 1000).toFixed(v % 1000 ? 1 : 0)

/* --- the country switcher ----------------------------------------------------------- */

export function CountryCards({ countries, selected, onSelect, now }) {
  return (
    <div className="ap-countries" role="tablist" aria-label="Country">
      {COUNTRY_ORDER.filter((k) => countries[k]).map((k) => {
        const c = countries[k]
        const a = latestActual(c)
        const rows = rowsOf(c, c.shown)
        const next = nextRow(rows, now)
        const past = toPoints((c.actuals || []).filter((x) => ms(x.t) >= now - 24 * 3.6e6), 'value')
        const fut = rows.filter((r) => r.ms >= (a ? ms(a.t) : now) && r.ms <= now + 24 * 3.6e6)
          .map((r) => ({ t: r.ms, v: r.point }))
        return (
          <button key={k} type="button" role="tab" aria-selected={selected === k}
                  className={`ap-country${selected === k ? ' on' : ''}`} onClick={() => onSelect(k)}>
            <span className="ap-country-head"><b>{c.name}</b><span className="ap-mono">{k}</span></span>
            <span className="ap-country-figs">
              <span><em>load</em><b className="ap-num">{a ? gw(a.value) : '–'}</b>
                <small>{a ? localTime(a.t, c.tz, { day: now - ms(a.t) > 864e5 }) : '–'}</small></span>
              <span><em>next</em><b className="ap-num">{next ? gw(next.point) : '–'}</b>
                <small>{next ? localTime(next.t, c.tz, { day: false }) : '–'}</small></span>
            </span>
            <Sparkline past={past} future={fut} />
          </button>
        )
      })}
    </div>
  )
}

/* --- headline numbers --------------------------------------------------------------- */

function allLeads(records, model) {
  return (records || []).find((r) => r.model === model && r.lead_bin?.startsWith('all'))
}

export function KpiStrip({ c, model, now }) {
  const rows = rowsOf(c, model)
  const a = latestActual(c)
  const next = nextRow(rows, now)
  const peak = peakRow(rows, now)
  const live = allLeads(c.live_scores?.['7d'], model)
  const op = allLeads(c.live_scores?.['7d'], 'operator')
  const monthly = c.code === 'CH'
  const pending = monthly ? 'awaiting Swissgrid monthly data' : 'scoring starts with the first targets'
  const tiles = [
    { label: 'Load', value: a ? gw(a.value) : '–', sub: a ? localTime(a.t, c.tz, { day: now - ms(a.t) > 864e5 }) : '–' },
    { label: 'Next period', value: next ? gw(next.point) : '–',
      sub: next ? `P10–P90 ${gwNum(next.q10)}–${gwNum(next.q90)} GW` : '–' },
    { label: 'Peak, next 24 h', value: peak ? gw(peak.point) : '–', sub: peak ? localTime(peak.t, c.tz) : '–' },
    { label: 'MAE · 7 d', value: live ? mwFmt(live.mae) : '–', sub: live ? `${live.n.toLocaleString('en-GB')} forecasts` : pending },
    { label: 'MAPE · 7 d', value: live ? pct(live.mape, 2) : '–', sub: live ? `bias ${signedMw(live.bias)}` : pending },
    { label: 'Coverage · 7 d', value: live ? pct(live.cover80, 0) : '–', sub: 'P10–P90, target 80 %' },
    { label: 'Operator MAE · 7 d', value: op ? mwFmt(op.mae) : '–',
      sub: op ? `MAPE ${pct(op.mape, 2)}` : (monthly ? 'no operator forecast of this series' : '–') },
  ]
  return (
    <dl className="ap-kpis">
      {tiles.map((t) => (
        <div key={t.label} className="ap-kpi">
          <dt>{t.label}</dt>
          <dd><b className="ap-num">{t.value}</b><small>{t.sub}</small></dd>
        </div>
      ))}
    </dl>
  )
}

/* --- the forecast chart ------------------------------------------------------------- */

export function FanChart({ c, model, operatorLabel }) {
  const issue = c.latest?.[model]
  const rows = issue?.rows || []
  const actualAll = toPoints(c.actuals || [], 'value')
  if (!rows.length) {
    const last = actualAll.at(-1)?.t
    if (!last) return <p className="ap-empty">No data yet.</p>
    return <TimeChart tz={c.tz} height={340} xDomain={[last - 48 * 3.6e6, last]}
                      lines={[{ key: 'actual', label: 'Load', cls: 'actual', points: actualAll }]}
                      fmt={(v) => gw(v)} axisFmt={GW_AXIS} yLabel="GW" ariaLabel={`${c.name}: load`} />
  }
  const first = ms(rows[0].t)
  const last = ms(rows[rows.length - 1].t)
  const recent = actualAll.filter((p) => p.t >= first - 48 * 3.6e6)
  // no recent load (Swissgrid publishes monthly): the chart starts at the forecast
  const from = recent.length ? first - 48 * 3.6e6 : first
  const actual = recent
  const op = toPoints((c.operator?.rows || []).filter((x) => ms(x.t) >= from && ms(x.t) <= last), 'value')
  const lines = [
    { key: 'actual', label: 'Load', cls: 'actual', points: actual },
    { key: 'fc', label: `Forecast (${MODEL_LABEL[model]})`, cls: 'fc', points: toPoints(rows, 'point') },
  ]
  if (op.length) lines.push({ key: 'op', label: operatorLabel, cls: 'op', dash: true, points: op })
  const bands = [
    { key: 'b80', label: 'P10–P90', cls: 'fc outer', points: toBand(rows, 'q10', 'q90') },
    { key: 'b50', label: 'P25–P75', cls: 'fc inner', points: toBand(rows, 'q25', 'q75') },
  ]
  return (
    <>
      <Legend items={[...lines.map((l) => ({ key: l.key, cls: l.cls, dash: l.dash, label: l.label })),
        { key: 'b80', cls: 'fc outer', band: true, label: 'P10–P90' },
        { key: 'b50', cls: 'fc inner', band: true, label: 'P25–P75' }]} />
      <TimeChart tz={c.tz} lines={lines} bands={bands} height={360} xDomain={[from, last]}
                 markers={[{ t: ms(issue.issue_time), label: localTime(issue.issue_time, c.tz, { day: false }) }]}
                 fmt={(v) => gw(v)} axisFmt={GW_AXIS} yLabel="GW"
                 ariaLabel={`${c.name}: load for the last 48 hours and the forecast for the next 48 hours`} />
      <details className="ap-tableview">
        <summary>Forecast table</summary>
        <div className="ap-scroll">
          <table>
            <thead><tr><th>Period</th><th className="n">Forecast, GW</th><th className="n">P10</th><th className="n">P25</th><th className="n">P75</th><th className="n">P90</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t}>
                  <td>{localTime(r.t, c.tz)}</td>
                  <td className="n">{gwNum(r.point)}</td><td className="n">{gwNum(r.q10)}</td><td className="n">{gwNum(r.q25)}</td>
                  <td className="n">{gwNum(r.q75)}</td><td className="n">{gwNum(r.q90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/* --- accuracy ----------------------------------------------------------------------- */

const METRICS = {
  mae: { label: 'MAE', fmt: (v) => mwFmt(v), best: 'low' },
  mape: { label: 'MAPE', fmt: (v) => pct(v, 2), best: 'low' },
  pinball: { label: 'Pinball loss', fmt: (v) => mwFmt(v), best: 'low' },
  cover80: { label: 'P10–P90 coverage', fmt: (v) => pct(v, 1), best: 'near80' },
  bias: { label: 'Bias', fmt: (v) => signedMw(v), best: 'near0' },
}

function bestOf(vals, rule) {
  const ok = vals.filter(isNum)
  if (ok.length < 2) return null
  if (rule === 'low') return Math.min(...ok)
  const target = rule === 'near80' ? 80 : 0
  return ok.reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b))
}

function ScoreMatrix({ records, models, metric }) {
  const bins = [...new Set(records.map((r) => r.lead_bin))]
  const present = models.filter((m) => records.some((r) => r.model === m && isNum(r[metric])))
  const cell = (m, b) => records.find((r) => r.model === m && r.lead_bin === b)
  const M = METRICS[metric]
  if (!present.length) return <p className="ap-empty">–</p>
  return (
    <div className="ap-scroll ap-matrix">
      <table>
        <thead>
          <tr><th>Lead time</th>{present.map((m) => <th key={m} className="n">{MODEL_LABEL[m] || m}</th>)}
            <th className="n">n</th></tr>
        </thead>
        <tbody>
          {bins.map((b) => {
            const vals = present.map((m) => cell(m, b)?.[metric])
            const best = bestOf(vals, M.best)
            const n = cell(present[0], b)?.n
            return (
              <tr key={b} className={b.startsWith('all') ? 'total' : ''}>
                <td>{b.startsWith('all') ? 'All leads' : b}</td>
                {present.map((m, i) => (
                  <td key={m} className={`n${isNum(vals[i]) && vals[i] === best ? ' best' : ''}`}>
                    {isNum(vals[i]) ? M.fmt(vals[i]) : '–'}
                  </td>
                ))}
                <td className="n muted">{isNum(n) ? n.toLocaleString('en-GB') : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const VIEWS = {
  live7: { label: 'Live · 7 days', models: ['average', 'tabpfn_v2', 'chronos2', 'operator'] },
  live30: { label: 'Live · 30 days', models: ['average', 'tabpfn_v2', 'chronos2', 'operator'] },
  backtest: { label: 'Backtest · 2025', models: ['average', 'tabpfn_v2', 'chronos2', 'gbm', 'operator', 'persistence', 'naive_7d'] },
}

export function Accuracy({ c }) {
  const [view, setView] = useState('live7')
  const [metric, setMetric] = useState('mae')
  const records = view === 'backtest' ? (c.backtest?.scores || [])
    : (c.live_scores?.[view === 'live7' ? '7d' : '30d'] || [])
  const daily = c.daily_scores || []
  const dm = metric === 'mape' ? 'mape' : 'mae'
  const dayT = (d) => Date.parse(`${d.day}T12:00:00Z`)
  return (
    <section className="ap-card">
      <header className="ap-card-head">
        <div><p className="ap-kicker">{c.name}</p><h2>Accuracy</h2></div>
        <div className="ap-seg" role="group" aria-label="Period">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} aria-pressed={view === k}
                    onClick={() => setView(k)}>{v.label}</button>
          ))}
        </div>
      </header>
      <div className="ap-seg ap-metrics" role="group" aria-label="Metric">
        {Object.entries(METRICS).map(([k, v]) => (
          <button key={k} type="button" className={metric === k ? 'on' : ''} aria-pressed={metric === k}
                  onClick={() => setMetric(k)}>{v.label}</button>
        ))}
      </div>
      <div className={`ap-acc${view === 'backtest' ? ' wide' : ''}`}>
        <div className="ap-acc-table">
          {records.length
            ? <ScoreMatrix records={records} models={VIEWS[view].models} metric={metric} />
            : <p className="ap-empty">{c.code === 'CH' && view !== 'backtest'
              ? 'Scored monthly, as Swissgrid publishes.' : 'No scores for this period yet.'}</p>}
        </div>
        {view !== 'backtest' && (
          <figure className="ap-figure">
            <figcaption><b>Daily {METRICS[dm].label}</b></figcaption>
            {daily.length ? (
              <>
                <Legend items={[{ key: 'a', cls: 'actual', label: MODEL_LABEL[c.shown] },
                  { key: 'o', cls: 'op', dash: true, label: 'Grid operator' }]} />
                <TimeChart tz={c.tz} height={200}
                           lines={[{ key: 'a', label: MODEL_LABEL[c.shown], cls: 'actual', points: daily.map((d) => ({ t: dayT(d), v: d[dm] })) },
                             { key: 'o', label: 'Grid operator', cls: 'op', dash: true, points: daily.map((d) => ({ t: dayT(d), v: d[`operator_${dm}`] })) }]}
                           fmt={(v) => (dm === 'mape' ? pct(v, 2) : mwFmt(v))}
                           axisFmt={(v) => (dm === 'mape' ? v.toFixed(1) : Math.round(v).toLocaleString('en-GB'))}
                           yLabel={dm === 'mape' ? '%' : 'MW'} ariaLabel={`Daily ${METRICS[dm].label}`} />
              </>
            ) : <p className="ap-empty">–</p>}
          </figure>
        )}
      </div>
    </section>
  )
}

/* --- forecast inputs ---------------------------------------------------------------- */

const GROUPS = [
  { title: 'Temperature', unit: '°C', keys: ['temperature_2m', 'apparent_temperature', 'temp_s99'],
    names: { temperature_2m: 'Temperature', apparent_temperature: 'Feels like', temp_s99: 'Smoothed' } },
  { title: 'Solar radiation', unit: 'W/m²', keys: ['shortwave_radiation'] },
  { title: 'Cloud cover', unit: '%', keys: ['cloud_cover'] },
  { title: 'Wind speed', unit: 'km/h', keys: ['wind_speed_10m'] },
  { title: 'Relative humidity', unit: '%', keys: ['relative_humidity_2m'] },
  { title: 'Dew point', unit: '°C', keys: ['dew_point_2m'] },
  { title: 'Precipitation', unit: 'mm', keys: ['precipitation'] },
  { title: 'Embedded solar & wind', unit: 'MW', keys: ['embedded_solar_fc_mw', 'embedded_wind_fc_mw'],
    names: { embedded_solar_fc_mw: 'Solar', embedded_wind_fc_mw: 'Wind' } },
  { title: 'Rooftop PV', unit: 'MW', keys: ['pv_proxy_mw'] },
]
const CALENDAR = ['holiday', 'bridge_day', 'school_holiday_zones', 'holiday_eng', 'holiday_sct', 'holiday_wls']
const STYLES = ['actual', 'fc', 'op']

export function Inputs({ c }) {
  const series = c.features?.series || []
  if (!series.length) return null
  const by = Object.fromEntries(series.map((s) => [s.key, s]))
  const groups = GROUPS.filter((g) => g.keys.some((k) => by[k]))
  const days = {}
  for (const key of CALENDAR) {
    const s = by[key]
    if (!s) continue
    for (const p of s.points) {
      if (isNum(p.v) && p.v > 0) {
        const d = new Intl.DateTimeFormat('en-GB', { timeZone: c.tz, weekday: 'short', day: 'numeric', month: 'short' })
          .format(new Date(p.t))
        days[d] = days[d] || new Set()
        days[d].add(s.label)
      }
    }
  }
  return (
    <section className="ap-card">
      <header className="ap-card-head">
        <div><p className="ap-kicker">{c.name} · next 48 h</p><h2>Forecast inputs</h2></div>
        <div className="ap-quick">
          {Object.keys(days).length
            ? Object.entries(days).map(([d, set]) => <span key={d} className="ap-chip on">{[...set].join(', ')} · {d}</span>)
            : <span className="ap-chip">No holidays in the next 48 h</span>}
        </div>
      </header>
      <div className="ap-inputs">
        {groups.map((g) => {
          const lines = g.keys.filter((k) => by[k]).map((k, i) => ({
            key: k, label: g.names?.[k] || by[k].label, cls: STYLES[i % 3], dash: i === 2,
            points: by[k].points.map((p) => ({ t: ms(p.t), v: p.v })),
          }))
          const nd = ['MW', 'W/m²', '%'].includes(g.unit) ? 0 : g.unit === 'mm' ? 2 : 1
          return (
            <figure key={g.title} className="ap-figure ap-input">
              <figcaption><b>{g.title}</b><span>{g.unit}</span></figcaption>
              {lines.length > 1 && <Legend items={lines.map((l) => ({ key: l.key, cls: l.cls, dash: l.dash, label: l.label }))} />}
              <TimeChart tz={c.tz} height={150} lines={lines}
                         fmt={(v) => `${v.toLocaleString('en-GB', { maximumFractionDigits: nd })} ${g.unit}`}
                         axisFmt={(v) => v.toLocaleString('en-GB', { maximumFractionDigits: nd })}
                         yLabel={g.unit} ariaLabel={`${g.title}, next 48 hours`} />
            </figure>
          )
        })}
      </div>
    </section>
  )
}

/* --- footer: the attribution the licences require, in one line ----------------------- */

export function Footer() {
  return (
    <footer className="ap-foot">
      <span className="ap-badge">Built with PriorLabs-TabPFN</span>
      <span>Data: RTE éCO2mix (Licence Ouverte 2.0) · Elexon BMRS © Elexon Limited · NESO · Swissgrid ·
        ENTSO-E via Energy-Charts · Weather: Open-Meteo.com (CC BY 4.0)</span>
    </footer>
  )
}
