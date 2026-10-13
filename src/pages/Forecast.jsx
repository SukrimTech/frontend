import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSnapshot } from '../apollo/api.js'
import { DailyChart, LoadChart, MiniChart } from '../apollo/charts.jsx'
import { local } from '../apollo/time.js'
import '../apollo/apollo.css'

/*
  Load forecast — the design's page (Load Forecast.dc.html), on Apollo's live snapshot
  (GET /api/apollo/snapshot, rewritten by the service after every hourly issue).

  One hover drives everything: the main chart, every input chart and the first metric follow the
  same instant. The page polls every five minutes; nothing here computes a forecast or a score.
*/

const POLL_MS = 5 * 60 * 1000
const COUNTRY_KEY = 'sukrim-apollo-country'
const COUNTRIES = ['FR', 'GB', 'CH']
const MODELS = [
  { id: 'average', label: 'Ensemble', about: 'Blend of both models' },
  { id: 'tabpfn_v2', label: 'TabPFN v2', about: 'Weather and calendar features' },
  { id: 'chronos2', label: 'Chronos-2', about: 'Past demand shape' },
]
const COLS = [['average', 'Ensemble'], ['tabpfn_v2', 'TabPFN v2'], ['chronos2', 'Chronos-2'], ['operator', 'Grid op.']]
const METRICS = {
  MAE: { key: 'mae', about: 'Mean absolute error', fmt: (v) => mw(v), best: (v) => v },
  MAPE: { key: 'mape', about: 'Mean absolute % error', fmt: (v) => `${v.toFixed(2)} %`, best: (v) => v },
  Coverage: { key: 'cover80', about: 'Share inside P10–P90 (target 80%)', fmt: (v) => `${Math.round(v)} %`, best: (v) => Math.abs(v - 80) },
  Bias: { key: 'bias', about: 'Mean signed error', fmt: (v) => `${v > 0 ? '+' : '−'}${mw(Math.abs(v))}`, best: (v) => Math.abs(v) },
}
const PERIODS = [['7d', '7 d'], ['30d', '30 d'], ['backtest', 'Backtest 2025']]
const INPUTS = [
  { title: 'Temperature', unit: '°C', keys: ['temperature_2m', 'apparent_temperature'], dec: 1 },
  { title: 'Solar radiation', unit: 'W/m²', keys: ['shortwave_radiation'], dec: 0 },
  { title: 'Cloud cover', unit: '%', keys: ['cloud_cover'], dec: 0 },
  { title: 'Wind speed', unit: 'km/h', keys: ['wind_speed_10m'], dec: 1 },
  { title: 'Humidity', unit: '%', keys: ['relative_humidity_2m'], dec: 0 },
  { title: 'Dew point', unit: '°C', keys: ['dew_point_2m'], dec: 1 },
  { title: 'Precipitation', unit: 'mm', keys: ['precipitation'], dec: 2 },
  { title: 'Embedded solar', unit: 'MW', keys: ['embedded_solar_fc_mw', 'embedded_wind_fc_mw'], dec: 0 },
  { title: 'Rooftop PV', unit: 'MW', keys: ['pv_proxy_mw'], dec: 0 },
]

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const ms = (iso) => Date.parse(iso)
const gw = (v) => (fin(v) ? (v / 1000).toFixed(v < 10000 ? 2 : 1) : '—')
const mw = (v) => (fin(v) ? `${Math.round(v).toLocaleString('en-GB')} MW` : '—')
const binLabel = (b) => (b.startsWith('all') ? 'All' : b.replace(/^\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\] h$/, '$1–$2 h'))

function storedCountry() {
  try { return localStorage.getItem(COUNTRY_KEY) } catch { return null }
}

export default function Forecast() {
  const [snap, setSnap] = useState(null)
  const [error, setError] = useState(null)
  const [country, setCountry] = useState(() => storedCountry() || 'GB')
  const [modelBy, setModelBy] = useState({})
  const [hover, setHover] = useState(null)
  const [metric, setMetric] = useState('MAE')
  const [period, setPeriod] = useState('7d')

  useEffect(() => {
    let alive = true
    const load = () => getSnapshot()
      .then((s) => { if (alive) { setSnap(s); setError(null) } })
      .catch((e) => { if (alive) setError(e) })
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const pick = (k) => {
    setCountry(k)
    setHover(null)
    try { localStorage.setItem(COUNTRY_KEY, k) } catch { /* private window */ }
  }

  const countries = snap?.countries || {}
  const code = countries[country] ? country : COUNTRIES.find((k) => countries[k])
  const c = code ? countries[code] : null
  const models = MODELS.filter((m) => c?.latest?.[m.id])
  const model = models.find((m) => m.id === modelBy[code])?.id || (c?.latest?.[c?.shown] ? c.shown : models[0]?.id)

  const view = (() => {
    if (!c || !model) return null
    const issue = c.latest[model]
    const fc = issue.rows.map((r) => ({ t: ms(r.t), v: r.point, p10: r.q10, p25: r.q25, p75: r.q75, p90: r.q90 }))
    const now = ms(issue.issue_time)
    const first = fc[0].t
    const t1 = fc.at(-1).t
    const hist = (c.actuals || []).map((a) => ({ t: ms(a.t), v: a.value })).filter((p) => p.t >= first - 48 * 3.6e6 && p.t <= now)
    const t0 = hist.length ? first - 48 * 3.6e6 : first
    const op = (c.operator?.rows || []).map((x) => ({ t: ms(x.t), v: x.value })).filter((p) => p.t >= first && p.t <= t1)
    const ahead = fc.filter((p) => p.t >= now && p.t <= now + 24 * 3.6e6)
    const peak = ahead.reduce((m, p) => (fin(p.v) && (!m || p.v > m.v) ? p : m), null)
    const next = fc.find((p) => p.t >= now) || fc[0]
    const feats = Object.fromEntries((c.features?.series || []).map((s) => [s.key, s.points.map((p) => ({ t: ms(p.t), v: p.v }))]))
    return { fc, hist, op, now, t0, t1, peak, next, feats }
  })()

  const tz = c?.tz
  const zone = tz ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value : ''

  const stats = (() => {
    if (!view) return []
    const live = (c.live_scores?.['7d'] || []).find((r) => r.model === model && r.lead_bin.startsWith('all'))
    const hp = hover != null ? (view.hist.find((p) => p.t === hover) || view.fc.find((p) => p.t === hover)) : null
    const isFc = hp && hp.t > view.now
    const last = view.hist.at(-1) || (c.latest_actual ? { t: ms(c.latest_actual.t), v: c.latest_actual.value } : null)
    const lk = hp || last
    const pending = c.code === 'CH' ? 'scored monthly' : 'scoring starts soon'
    return [
      { label: hp ? `${isFc ? 'Forecast' : 'Actual'} · ${local(hp.t, tz).day} ${local(hp.t, tz).hm}`
        : `Load · ${!last ? '—' : view.now - last.t > 864e5
          ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(last.t))
          : local(last.t, tz).hm}`,
      value: `${gw(lk?.v)} GW`, note: isFc ? `P10–P90 ${gw(hp.p10)}–${gw(hp.p90)}` : zone, first: true },
      { label: `Next · ${local(view.next.t, tz).hm}`, value: `${gw(view.next.v)} GW`, note: `P10–P90 ${gw(view.next.p10)}–${gw(view.next.p90)}` },
      { label: 'Peak · next 24 h', value: `${gw(view.peak?.v)} GW`,
        note: view.peak ? `${local(view.peak.t, tz).day} ${local(view.peak.t, tz).hm} ${zone}` : '—' },
      { label: 'MAE · 7 d', value: live ? mw(live.mae) : '—', note: live ? `MAPE ${live.mape.toFixed(2)} %` : pending },
      { label: 'Coverage · 7 d', value: live && fin(live.cover80) ? `${Math.round(live.cover80)} %` : '—', note: 'P10–P90, target 80 %' },
    ]
  })()

  const acc = (() => {
    if (!c) return null
    const recs = period === 'backtest' ? (c.backtest?.scores || []) : (c.live_scores?.[period] || [])
    const M = METRICS[metric]
    const cols = COLS.filter(([id]) => recs.some((r) => r.model === id && fin(r[M.key])))
    const bins = [...new Set(recs.map((r) => r.lead_bin))]
    const rows = bins.map((b) => {
      const cells = cols.map(([id]) => recs.find((r) => r.model === id && r.lead_bin === b)?.[M.key])
      const score = cells.map((v) => (fin(v) ? M.best(v) : Infinity))
      const best = Math.min(...score)
      const n = recs.find((r) => r.model === (c.shown || cols[0]?.[0]) && r.lead_bin === b)?.n
        ?? recs.find((r) => r.lead_bin === b)?.n
      return { label: binLabel(b), all: b.startsWith('all'), n,
        cells: cells.map((v, i) => ({ txt: fin(v) ? M.fmt(v) : '—', best: fin(v) && cols.length > 1 && score[i] === best })) }
    })
    return { cols, rows }
  })()

  const dailyKey = metric === 'MAPE' ? 'mape' : 'mae'

  return (
    <div className="lf">
      <header className="lf-top">
        <div className="lf-top-in">
          <Link to="/" className="lf-brand">
            <img src="/assets/sukrim-icon.svg" alt="" className="lf-icon" />
            <img src="/assets/sukrim-wordmark.svg" alt="SUKRIM" className="lf-word" />
          </Link>
          <span className="lf-sep" aria-hidden="true" />
          <span className="lf-title">Load forecast</span>
          {snap && (
            <span className="lf-live"><i className={error ? 'off' : ''} />
              {error ? 'Offline' : 'Live'} · {new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(snap.generated_at))} UTC
            </span>
          )}
          <nav className="lf-nav">
            <Link to="/">Overview</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/workbench" className="lf-pill">Workbench <span className="lf-mono">→</span></Link>
          </nav>
        </div>
      </header>

      <main className="lf-main">
        {!snap && <p className="lf-empty lf-pad">{error ? (error.status === 503 ? 'No forecast available yet.' : `Could not load the forecast: ${error.message}`) : 'Loading…'}</p>}

        {c && (
          <>
            <div className="lf-controls">
              <div role="tablist" aria-label="Country" className="lf-tabs">
                {COUNTRIES.filter((k) => countries[k]).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={k === code} className={k === code ? 'on' : ''}
                          onClick={() => pick(k)}>
                    {countries[k].name}<span className="lf-mono">{k}</span>
                  </button>
                ))}
              </div>
              {models.length > 0 && (
                <div className="lf-ctl">
                  <span className="lf-kick">Model</span>
                  <div className="lf-seg">
                    {models.map((m) => (
                      <button key={m.id} type="button" title={m.about} className={m.id === model ? 'on' : ''}
                              onClick={() => setModelBy({ ...modelBy, [code]: m.id })}>{m.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <dl className="lf-stats">
              {stats.map((s) => (
                <div key={s.label} className={s.first ? 'first' : ''}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                  <span>{s.note}</span>
                </div>
              ))}
            </dl>

            {view && (
              <section className="lf-load">
                <div className="lf-row">
                  <span className="lf-kick">Load · {c.name} · GW · {zone}</span>
                  <div className="lf-legend">
                    {view.hist.length > 0 && <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" className="k-act" /></svg>Actual</span>}
                    <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" className="k-fc" /></svg>Forecast</span>
                    <span><i className="k-band"><b /><b /><b /></i>P25–P75 · P10–P90</span>
                    {view.op.length > 0 && <span><svg viewBox="0 0 22 8"><line x1="1" y1="4" x2="22" y2="4" className="k-op" /></svg>Grid operator</span>}
                  </div>
                </div>
                <LoadChart tz={tz} t0={view.t0} t1={view.t1} now={view.now} hist={view.hist} fc={view.fc} op={view.op}
                           peak={view.peak} hover={hover} onHover={setHover} />
              </section>
            )}

            {view && (
              <section className="lf-inputs">
                {INPUTS.filter((g) => view.feats[g.keys[0]]).map((g) => {
                  const lines = g.keys.filter((k) => view.feats[k]).map((k, i) => ({ key: k, dash: i > 0, points: view.feats[k] }))
                  const at = hover ?? view.now
                  const main = view.feats[g.keys[0]]
                  const pt = main.reduce((b, p) => (Math.abs(p.t - at) < Math.abs(b.t - at) ? p : b), main[0])
                  return (
                    <figure key={g.title}>
                      <figcaption>
                        <span>{g.title} <small className="lf-mono">{g.unit}</small></span>
                        <span className="lf-mono lf-read">{fin(pt?.v) ? pt.v.toLocaleString('en-GB', { minimumFractionDigits: g.dec, maximumFractionDigits: g.dec }) : '—'}</span>
                      </figcaption>
                      <MiniChart tz={tz} t0={view.t0} t1={view.t1} now={view.now} lines={lines}
                                 hover={hover} onHover={setHover} />
                    </figure>
                  )
                })}
              </section>
            )}

            <section className="lf-acc" id="accuracy">
              <div className="lf-row">
                <span className="lf-h">Accuracy</span>
                <div className="lf-ctl">
                  <div className="lf-seg">
                    {Object.entries(METRICS).map(([k, m]) => (
                      <button key={k} type="button" title={m.about} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{k}</button>
                    ))}
                  </div>
                  <div className="lf-seg">
                    {PERIODS.map(([k, l]) => (
                      <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="lf-acc-grid">
                <div className="lf-tablewrap">
                  <table>
                    <thead>
                      <tr><th className="l">Lead</th>{acc.cols.map(([, l]) => <th key={l}>{l}</th>)}<th className="n">N</th></tr>
                    </thead>
                    <tbody>
                      {acc.rows.length ? acc.rows.map((r) => (
                        <tr key={r.label}>
                          <td className={`l${r.all ? ' all' : ''}`}>{r.label}</td>
                          {r.cells.map((ce, i) => <td key={i} className={ce.best ? 'best' : ''}>{ce.txt}</td>)}
                          <td className="n">{fin(r.n) ? r.n.toLocaleString('en-GB') : '—'}</td>
                        </tr>
                      )) : (
                        <tr><td className="l" colSpan={6}>{c.code === 'CH' && period !== 'backtest' ? 'Scored monthly, as Swissgrid publishes' : 'No scores yet'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {period !== 'backtest' && (
                  <div className="lf-dailybox">
                    <div className="lf-row">
                      <span className="lf-kick">Daily {metric === 'MAPE' ? 'MAPE · %' : 'MAE · MW'}</span>
                      <span className="lf-legend">
                        <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" className="k-act" /></svg>{MODELS.find((m) => m.id === c.shown)?.label}</span>
                        <span><svg viewBox="0 0 22 8"><line x1="1" y1="4" x2="22" y2="4" className="k-op" /></svg>Grid operator</span>
                      </span>
                    </div>
                    <DailyChart days={c.daily_scores || []} key1={dailyKey} key2={`operator_${dailyKey}`} tz={tz} />
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="lf-foot">
        <div>
          <span className="lf-badge">Built with PriorLabs-TabPFN</span>
          <span>RTE éCO2mix (Licence Ouverte 2.0) · Elexon BMRS © Elexon Limited · NESO · Swissgrid · ENTSO-E via Energy-Charts · Open-Meteo.com (CC BY 4.0)</span>
        </div>
      </footer>
    </div>
  )
}
