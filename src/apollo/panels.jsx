/*
  The Load forecast page's panels. Each reads one part of the snapshot and draws it; none of them
  computes a forecast or a score. Missing fields are normal (a service that has run for an hour
  has no live scores and maybe no backtest yet), so every panel says plainly what is not there
  rather than drawing an empty frame.
*/

import { useState } from 'react'
import { Sparkline, TimeChart, Legend } from './charts.jsx'
import {
  MODEL_LABEL, SERIES_LABEL, age, ageSince, gw, gwNum, isNum, localDateTime, localTime, ms,
  mwFmt, pct, signedMw, utcTime,
} from './format.js'
import {
  COUNTRY_ORDER, latestActual, newestLog, nextRow, peakRow, rowAtLead, rowsOf,
  toBand, toPoints,
} from './data.js'

/* --- the country switcher ----------------------------------------------------------- */

export function CountryCards({ countries, selected, onSelect, now }) {
  return (
    <div className="ap-countries" role="tablist" aria-label="Country">
      {COUNTRY_ORDER.filter((k) => countries[k]).map((k) => {
        const c = countries[k]
        const a = latestActual(c)
        const rows = rowsOf(c, c.shown)
        const next = nextRow(rows, now)
        const since = now - 24 * 3.6e6
        const past = toPoints((c.actuals || []).filter((x) => ms(x.t) >= since), 'value')
        const fut = rows.filter((r) => r.ms >= (a ? ms(a.t) : now) && r.ms <= now + 24 * 3.6e6)
          .map((r) => ({ t: r.ms, v: r.point }))
        return (
          <button key={k} type="button" role="tab" aria-selected={selected === k}
                  className={`ap-country${selected === k ? ' on' : ''}`} onClick={() => onSelect(k)}>
            <span className="ap-country-head">
              <b>{c.name}</b>
              <span className="ap-mono">{k}</span>
            </span>
            <span className="ap-country-body">
              <span className="ap-country-figs">
                <span><em>now</em><b className="ap-num">{a ? gw(a.value) : '–'}</b>
                  <small>{a ? `${localTime(a.t, c.tz, { day: now - ms(a.t) > 864e5 })} · ${ageSince(a.t, now)} ago` : 'no load yet'}</small>
                </span>
                <span><em>next period</em><b className="ap-num">{next ? gw(next.point) : '–'}</b>
                  <small>{next ? localTime(next.t, c.tz, { day: false }) : 'no issue yet'}</small>
                </span>
              </span>
              <Sparkline past={past} future={fut} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* --- the headline numbers ------------------------------------------------------------ */

export function Kpis({ c, model, now }) {
  const rows = rowsOf(c, model)
  const next = nextRow(rows, now)
  const peak = peakRow(rows, now)
  const at24 = rowAtLead(rows, 24)
  const log = newestLog(c)
  const issue = c.latest?.[model]?.issue_time
  const tiles = [
    { label: 'Next period', value: next ? gw(next.point) : '–',
      sub: next ? `${localTime(next.t, c.tz)} · 80 % band ${gwNum(next.q10)}–${gwNum(next.q90)}` : 'no stored issue' },
    { label: 'Peak in the next 24 h', value: peak ? gw(peak.point) : '–',
      sub: peak ? `at ${localTime(peak.t, c.tz)}` : '–' },
    { label: 'Band width at +24 h', value: at24 && isNum(at24.q90) ? mwFmt(at24.q90 - at24.q10) : '–',
      sub: at24 && isNum(at24.point) ? `P10–P90, ${pct(100 * (at24.q90 - at24.q10) / at24.point)} of the forecast` : '–' },
    { label: 'Load known until', value: log?.load_known_until ? localTime(log.load_known_until, c.tz, { day: false }) : '–',
      sub: isNum(log?.data_age_h) ? `${age(log.data_age_h * 60)} before the issue` : '–' },
    { label: 'Issued', value: issue ? localTime(issue, c.tz, { day: false }) : '–',
      sub: log?.weather_run && log.weather_run !== 'None' ? `weather run available ${utcTime(log.weather_run.replace(' ', 'T').replace('+00:00', 'Z'))}` : 'weather run –' },
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

/* --- the main chart ------------------------------------------------------------------ */

/** Before the first issue: the published load alone, so the page still shows what is live. */
export function ActualsChart({ c }) {
  const pts = toPoints(c.actuals || [], 'value')
  const last = pts.at(-1)?.t
  if (!last) return <p className="ap-empty">No published load in the snapshot yet.</p>
  return (
    <>
      <p className="ap-empty">No forecast has been stored for {c.name} yet — the hourly service has not issued
        here. The published load of the last 48 h is shown.</p>
      <TimeChart tz={c.tz} height={260} xDomain={[last - 48 * 3.6e6, last]}
                 lines={[{ key: 'actual', label: 'Published load', cls: 'actual', points: pts.filter((p) => p.t >= last - 48 * 3.6e6) }]}
                 fmt={(v) => gw(v)} axisFmt={(v) => (v / 1000).toFixed(v % 1000 ? 1 : 0)} yLabel="GW"
                 ariaLabel={`${c.name}: published load for the last 48 hours`} />
    </>
  )
}

export function FanChart({ c, model, operatorLabel }) {
  const issue = c.latest?.[model]
  const rows = issue?.rows || []
  if (!rows.length) return <ActualsChart c={c} />
  const first = ms(rows[0].t)
  const last = ms(rows[rows.length - 1].t)
  const from = first - 48 * 3.6e6
  const actual = toPoints((c.actuals || []).filter((x) => ms(x.t) >= from), 'value')
  const op = toPoints((c.operator?.rows || []).filter((x) => ms(x.t) >= from && ms(x.t) <= last), 'value')
  const lines = [
    { key: 'actual', label: 'Published load', cls: 'actual', points: actual },
    { key: 'fc', label: `${MODEL_LABEL[model]} forecast`, cls: 'fc', points: toPoints(rows, 'point') },
  ]
  if (op.length) lines.push({ key: 'op', label: operatorLabel, cls: 'op', dash: true, points: op })
  const bands = [
    { key: 'b80', label: 'P10–P90 (80 % band)', cls: 'fc outer', points: toBand(rows, 'q10', 'q90') },
    { key: 'b50', label: 'P25–P75 (50 % band)', cls: 'fc inner', points: toBand(rows, 'q25', 'q75') },
  ]
  return (
    <>
      <Legend items={[...lines.map((l) => ({ key: l.key, cls: l.cls, dash: l.dash, label: l.label })),
        { key: 'b80', cls: 'fc outer', band: true, label: 'P10–P90' },
        { key: 'b50', cls: 'fc inner', band: true, label: 'P25–P75' }]} />
      <TimeChart tz={c.tz} lines={lines} bands={bands} height={340} xDomain={[from, last]}
                 markers={[{ t: ms(issue.issue_time), label: `issued ${localTime(issue.issue_time, c.tz, { day: false })}` }]}
                 fmt={(v) => gw(v)} axisFmt={(v) => (v / 1000).toFixed(v % 1000 ? 1 : 0)} yLabel="GW"
                 ariaLabel={`${c.name}: published load for the last 48 hours and ${MODEL_LABEL[model]}'s forecast for the next 48 hours`} />
      <details className="ap-tableview">
        <summary>Show the forecast as a table</summary>
        <div className="ap-scroll">
          <table>
            <thead><tr><th>Period (local)</th><th className="n">Lead</th><th className="n">Forecast, GW</th><th className="n">P10</th><th className="n">P25</th><th className="n">P75</th><th className="n">P90</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t}>
                  <td>{localTime(r.t, c.tz)}</td><td className="n">{isNum(r.lead_h) ? `${r.lead_h.toFixed(1)} h` : '–'}</td>
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

/* --- what was said against what happened --------------------------------------------- */

export function Track({ c, model, kind, title, note, liveDays }) {
  const pts = c.tracks?.[kind]?.[model] || []
  return (
    <figure className="ap-card ap-figure">
      <figcaption><b>{title}</b><span>{note}</span></figcaption>
      {pts.length ? (
        <>
          <Legend items={[{ key: 'a', cls: 'actual', label: 'Published load (first release)' },
            { key: 'f', cls: 'fc', label: `${MODEL_LABEL[model]}` },
            { key: 'b', cls: 'fc outer', band: true, label: 'P10–P90' }]} />
          <TimeChart tz={c.tz} height={230}
                     lines={[{ key: 'a', label: 'Published', cls: 'actual', points: toPoints(pts, 'actual') },
                       { key: 'f', label: 'Forecast', cls: 'fc', points: toPoints(pts, 'point') }]}
                     bands={[{ key: 'b', label: 'P10–P90', cls: 'fc outer', points: toBand(pts, 'q10', 'q90') }]}
                     fmt={(v) => gw(v)} axisFmt={(v) => (v / 1000).toFixed(v % 1000 ? 1 : 0)} yLabel="GW"
                     ariaLabel={`${title}: forecast against published load`} />
        </>
      ) : (
        <p className="ap-empty">
          Live scoring starts once the first forecasts reach their target hours.{' '}
          {isNum(liveDays) && liveDays > 0
            ? `Apollo has been issuing here for ${liveDays.toFixed(1)} days.`
            : 'Apollo has not issued here yet.'}
        </p>
      )}
    </figure>
  )
}

/* --- score tables -------------------------------------------------------------------- */

const METRICS = {
  mae: { label: 'MAE', fmt: (v) => mwFmt(v), best: 'low', note: 'mean absolute error of the point forecast' },
  mape: { label: 'MAPE', fmt: (v) => pct(v, 2), best: 'low', note: 'mean absolute percentage error' },
  pinball: { label: 'Pinball', fmt: (v) => mwFmt(v), best: 'low', note: 'mean pinball loss over P10, P25, P50, P75, P90 (lower is better)' },
  cover80: { label: 'P10–P90 coverage', fmt: (v) => pct(v, 1), best: 'near80', note: 'share of actual values inside the 80 % band (nominal 80 %)' },
  bias: { label: 'Bias', fmt: (v) => signedMw(v), best: 'near0', note: 'mean of forecast minus actual' },
}

function bestOf(vals, rule) {
  const ok = vals.filter(isNum)
  if (ok.length < 2) return null
  if (rule === 'low') return Math.min(...ok)
  const target = rule === 'near80' ? 80 : 0
  return ok.reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b))
}

export function ScoreMatrix({ records, models, shown, caption }) {
  const [metric, setMetric] = useState('mae')
  const bins = [...new Set(records.map((r) => r.lead_bin))]
  const present = models.filter((m) => records.some((r) => r.model === m && isNum(r[metric])))
  const cell = (m, b) => records.find((r) => r.model === m && r.lead_bin === b)
  const M = METRICS[metric]
  return (
    <div className="ap-matrix">
      <div className="ap-seg" role="group" aria-label="Score">
        {Object.entries(METRICS).map(([k, v]) => (
          <button key={k} type="button" className={metric === k ? 'on' : ''} aria-pressed={metric === k}
                  onClick={() => setMetric(k)}>{v.label}</button>
        ))}
      </div>
      <p className="ap-small">{M.label}: {M.note}.{caption ? ` ${caption}` : ''}</p>
      {present.length ? (
        <div className="ap-scroll">
          <table>
            <thead>
              <tr><th>Lead time</th>{present.map((m) => (
                <th key={m} className="n">{MODEL_LABEL[m] || m}{m === shown ? <span className="ap-tag">shown</span> : null}</th>))}
              <th className="n">n</th></tr>
            </thead>
            <tbody>
              {bins.map((b) => {
                const vals = present.map((m) => cell(m, b)?.[metric])
                const best = bestOf(vals, M.best)
                const n = cell(shown, b)?.n ?? cell(present[0], b)?.n
                return (
                  <tr key={b} className={b.startsWith('all') ? 'total' : ''}>
                    <td>{b}</td>
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
      ) : <p className="ap-empty">No {M.label} for these models.</p>}
    </div>
  )
}

export function LiveScores({ c }) {
  const [win, setWin] = useState('7d')
  const recs = c.live_scores?.[win] || []
  const any = Object.values(c.live_scores || {}).some((r) => r?.length)
  return (
    <section className="ap-card">
      <header className="ap-card-head">
        <div>
          <p className="ap-kicker">Live</p>
          <h2>Live accuracy — scored against the operator’s first published values</h2>
        </div>
        <div className="ap-seg" role="group" aria-label="Window">
          {['7d', '30d'].map((w) => (
            <button key={w} type="button" className={win === w ? 'on' : ''} aria-pressed={win === w}
                    onClick={() => setWin(w)}>{w === '7d' ? 'Last 7 days' : 'Last 30 days'}</button>
          ))}
        </div>
      </header>
      {recs.length ? (
        <ScoreMatrix records={recs} models={['average', 'tabpfn_v2', 'chronos2', 'operator']} shown={c.shown}
                     caption="Bold marks the best value in each row." />
      ) : (
        <p className="ap-empty">
          {any ? `No scored forecasts in the ${win === '7d' ? 'last 7' : 'last 30'} days.`
            : 'No live scores yet: none of the stored forecasts has reached its target time with a published value. '
              + 'This table is the only place the page calls a number “Apollo’s accuracy”.'}
        </p>
      )}
    </section>
  )
}

export function Backtest({ c }) {
  const bt = c.backtest || {}
  const recs = bt.scores || []
  return (
    <section className="ap-card ap-backtest">
      <header className="ap-card-head">
        <div>
          <p className="ap-kicker">Backtest — not live accuracy</p>
          <h2>Backtest (2025, hourly issues, forecast weather)</h2>
        </div>
      </header>
      <p className="ap-small">
        Through 2025, each model forecast the next 48 h from regular hourly issue times, using only what
        had been published by then and the weather forecasts as they stood at the time. History is the operator’s consolidated
        data, not first releases, so this is a guide to live accuracy, not a measurement of it.
      </p>
      {recs.length ? (
        <ScoreMatrix records={recs} shown={c.shown}
                     models={['average', 'tabpfn_v2', 'chronos2', 'gbm', 'persistence', 'naive_7d', 'operator']}
                     caption="Persistence is scored to 6 h only." />
      ) : <p className="ap-empty">The backtest has not finished for {c.name} yet.</p>}
      {bt.rule && (
        <div className="ap-rule">
          <p><b>Shown: {MODEL_LABEL[bt.rule.shown] || bt.rule.shown}.</b> {bt.rule.why}
            {isNum(bt.rule.days) ? ` (${bt.rule.days} days of issues).` : ''}</p>
          {bt.rule.mean_pinball && (
            <p className="ap-small">Mean pinball on the test window:{' '}
              {Object.entries(bt.rule.mean_pinball).map(([m, v]) => `${MODEL_LABEL[m] || m} ${mwFmt(v)}`).join(' · ')}.
              The rule was written before any result: a clear winner (95 % interval excluding zero) is
              shown; otherwise the average, unless it is clearly worse than one model.</p>
          )}
        </div>
      )}
      {bt.calibration && <Calibration cal={bt.calibration} />}
      {bt.sample_week?.rows?.length > 0 && (
        <figure className="ap-figure">
          <figcaption><b>{bt.sample_week.title || 'A backtest week'}</b>
            <span>backtest, {MODEL_LABEL[bt.sample_week.model] || bt.sample_week.model || ''}
              {isNum(bt.sample_week.lead_h) ? `, ${bt.sample_week.lead_h} h ahead` : ''}</span></figcaption>
          <TimeChart tz={c.tz} height={220}
                     lines={[{ key: 'a', label: 'Published', cls: 'actual', points: toPoints(bt.sample_week.rows, 'actual') },
                       { key: 'f', label: 'Forecast', cls: 'fc', points: toPoints(bt.sample_week.rows, 'point') }]}
                     bands={[{ key: 'b', label: 'P10–P90', cls: 'fc outer', points: toBand(bt.sample_week.rows, 'q10', 'q90') }]}
                     fmt={(v) => gw(v)} axisFmt={(v) => (v / 1000).toFixed(v % 1000 ? 1 : 0)} yLabel="GW"
                     ariaLabel="Backtest week: forecast against published load" />
        </figure>
      )}
    </section>
  )
}

/** Coverage before and after the D5 widening, in whatever tabular shape the service wrote. */
function Calibration({ cal }) {
  const blocks = Object.entries(cal).filter(([, v]) => Array.isArray(v) && v.length)
  if (!blocks.length) {
    return <p className="ap-small">Calibration: {typeof cal === 'string' ? cal : JSON.stringify(cal)}</p>
  }
  return (
    <div className="ap-cal">
      <h3>Band calibration (split-conformal widening per lead bin)</h3>
      {blocks.map(([model, rows]) => {
        const cols = Object.keys(rows[0])
        return (
          <div key={model} className="ap-scroll">
            <table>
              <caption>{MODEL_LABEL[model] || model}</caption>
              <thead><tr>{cols.map((k) => <th key={k}>{k.replaceAll('_', ' ')}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i}>{cols.map((k) => <td key={k} className={isNum(r[k]) ? 'n' : ''}>{isNum(r[k]) ? +r[k].toFixed(3) : String(r[k] ?? '–')}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/* --- feeds and issues ---------------------------------------------------------------- */

export function Feeds({ c, feeds }) {
  const own = c.feeds || []
  // the live pulls only: a bootstrap (".history") pull is a one-off, not the feed's health
  const pulls = (feeds || []).filter((f) => f.series?.startsWith('pull:') && f.series.includes(`${c.code}.`)
    && !f.series.includes('.history'))
  return (
    <section className="ap-card">
      <header className="ap-card-head"><div><p className="ap-kicker">Inputs</p><h2>Feeds</h2></div></header>
      <ul className="ap-feeds">
        {own.map((f) => {
          const future = isNum(f.age_min) && f.age_min < 0
          return (
            <li key={f.series}>
              <span className={`ap-status ${f.stale ? 'bad' : 'good'}`}>{f.stale ? '✕ stale' : '✓ fresh'}</span>
              <span className="ap-feed-name">{SERIES_LABEL[f.series] || f.series}</span>
              <span className="ap-feed-age mono">
                {future ? `covers to ${localDateTime(f.newest_valid_time, c.tz)}`
                  : `newest ${localTime(f.newest_valid_time, c.tz)} · ${age(f.age_min)} old`}
              </span>
            </li>
          )
        })}
        {pulls.map((f) => (
          <li key={f.series}>
            <span className={`ap-status ${f.ok ? 'good' : 'bad'}`}>{f.ok ? '✓ pull ok' : '✕ pull failed'}</span>
            <span className="ap-feed-name">{f.series.replace('pull:', 'last pull ')}</span>
            <span className="ap-feed-age mono">{utcTime(f.last_retrieved)}{f.message ? ` · ${f.message}` : ''}</span>
          </li>
        ))}
        {!own.length && !pulls.length && <li className="ap-empty">No feed status in the snapshot.</li>}
      </ul>
    </section>
  )
}

export function IssueStrip({ c, now }) {
  const log = [...(c.issue_log || [])].slice(0, 24).reverse()
  const ok = log.filter((x) => x.status === 'ok').length
  const span = log.length ? (ms(log.at(-1).issue_time) - ms(log[0].issue_time)) / 3.6e6 : 0
  return (
    <section className="ap-card">
      <header className="ap-card-head"><div><p className="ap-kicker">Service</p><h2>Hourly issues</h2></div></header>
      {log.length ? (
        <>
          <ol className="ap-strip" aria-label="Last issues, oldest first">
            {log.map((x) => (
              <li key={x.issue_time} className={x.status === 'ok' ? 'ok' : 'bad'}
                  title={`${utcTime(x.issue_time)} · ${x.status}${isNum(x.seconds) ? ` · ${x.seconds.toFixed(0)} s` : ''}${x.message ? ` · ${x.message}` : ''}`}>
                <span className="sr">{utcTime(x.issue_time)} {x.status}</span>
                {x.status === 'ok' ? '' : '✕'}
              </li>
            ))}
          </ol>
          <p className="ap-small">{ok} of the last {log.length} issues succeeded, over {span.toFixed(0)} h
            (oldest left, newest right; the newest was {ageSince(log.at(-1).issue_time, now)} ago).
            {log.at(-1)?.seconds ? ` The newest took ${log.at(-1).seconds.toFixed(0)} s.` : ''}</p>
          {log.filter((x) => x.status !== 'ok').slice(-2).map((x) => (
            <p key={x.issue_time} className="ap-small ap-fail mono">{utcTime(x.issue_time)}: {x.message || x.status}</p>
          ))}
        </>
      ) : <p className="ap-empty">No issues logged yet.</p>}
    </section>
  )
}

/* --- why it missed ------------------------------------------------------------------- */

export function Diagnosis({ c }) {
  const d = c.diagnosis || {}
  return (
    <section className="ap-card">
      <header className="ap-card-head"><div><p className="ap-kicker">Heuristic</p><h2>Weather or model?</h2></div></header>
      {isNum(d.n) && d.n > 0 && isNum(d.r2_temperature) ? (
        <>
          <dl className="ap-kv">
            <div><dt>Share of error variance explained by temperature</dt><dd className="ap-num">{pct(100 * d.r2_temperature, 0)}</dd></div>
            <div><dt>Load error per K of weather error</dt><dd className="ap-num">{signedMw(d.slope_mw_per_k)}</dd></div>
            <div><dt>Mean temperature forecast error</dt><dd className="ap-num">{isNum(d.mean_abs_temp_error_k) ? `${d.mean_abs_temp_error_k.toFixed(2)} K` : '–'}</dd></div>
            <div><dt>Scored targets</dt><dd className="ap-num">{d.n.toLocaleString('en-GB')}</dd></div>
          </dl>
          <p className="ap-small">{MODEL_LABEL[d.model] || 'The shown model'}, over the last 30 days.{' '}
            {d.note ? `${d.note.charAt(0).toUpperCase()}${d.note.slice(1)}.` : ''} Not a decomposition:
            other weather variables are not attributed, and the short-lead weather is itself a forecast.</p>
        </>
      ) : <p className="ap-empty">{d.note || 'Not available yet.'}</p>}
    </section>
  )
}

/* --- notes and attribution ----------------------------------------------------------- */

export function Notes({ c }) {
  return (
    <section className="ap-notes">
      <h2>Reading this page</h2>
      <ul>
        <li><b>What is forecast ({c.name}).</b> {c.target}.{c.code === 'CH'
          ? ' Swissgrid publishes it once a month, about 15 working days after the month ends, so no recent load is known when a Swiss forecast is made: the model forecasts from calendar and weather alone, and each forecast is scored when Swissgrid publishes. No operator forecasts this quantity. (ENTSO-E’s Swiss total load, which is published within hours, is a broader quantity; it was tested as a target and not chosen.)'
          : ''}</li>
        <li><b>Only live scores are Apollo’s accuracy.</b> Backtest numbers are labelled backtest; they come
          from history, not from forecasts made in real time.</li>
        <li><b>The operator is a reference, not a rival.</b> No claim is made that Apollo beats the grid
          operator: the operator’s own forecast is shown and scored beside Apollo’s.</li>
        <li><b>Shown and shadow.</b> Every model issues every hour. One is shown, chosen per country by a rule
          written before any result; the others run in shadow mode and are scored the same way.</li>
        <li><b>Nothing here is computed in your browser.</b> The page draws what the hourly service stored.</li>
      </ul>
    </section>
  )
}

export function Attribution({ items }) {
  return (
    <footer className="ap-attr">
      <p className="ap-badge-line"><span className="ap-badge">Built with PriorLabs-TabPFN</span></p>
      <ul>{(items || []).map((a) => <li key={a}>{a}</li>)}</ul>
    </footer>
  )
}
