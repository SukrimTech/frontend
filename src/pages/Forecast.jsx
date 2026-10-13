import { useEffect, useState } from 'react'
import { getSnapshot } from '../apollo/api.js'
import AskApollo from '../apollo/Ask.jsx'
import { COUNTRY_ORDER, modelsOf } from '../apollo/data.js'
import { MODEL_LABEL, OPERATOR_LABEL, ageSince, utcTime } from '../apollo/format.js'
import {
  ActualsChart, Attribution, Backtest, CountryCards, Diagnosis, FanChart, Feeds, IssueStrip, Kpis, LiveScores,
  Notes, Track,
} from '../apollo/panels.jsx'
import '../apollo/apollo.css'

/*
  Load forecast — Apollo's pitch page and its live score.

  Apollo issues a 48-hour national load forecast every hour for France, Great Britain and
  Switzerland, stores it, and later scores it against what the operator first published. This
  page draws the newest snapshot the service wrote (GET /api/apollo/snapshot): the forecast and
  its band, what was said a day and an hour ahead against what happened, the live scores, the
  backtest — labelled as one — and the health of every feed. It polls every five minutes; the
  service writes once an hour.
*/

const COUNTRY_KEY = 'sukrim-apollo-country'
const POLL_MS = 5 * 60 * 1000

function storedCountry() {
  try { return localStorage.getItem(COUNTRY_KEY) } catch { return null }
}

export default function Forecast() {
  const [snap, setSnap] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [country, setCountry] = useState(() => storedCountry() || 'FR')
  const [modelBy, setModelBy] = useState({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // A failed refresh keeps the last good snapshot on screen; the banner says why.
    let alive = true
    const load = () => getSnapshot()
      .then((s) => { if (alive) { setSnap(s); setError(null) } })
      .catch((e) => { if (alive) setError(e) })
      .finally(() => { if (alive) { setLoading(false); setNow(Date.now()) } })
    load()
    const id = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => { alive = false; clearInterval(id); clearInterval(tick) }
  }, [])

  const pick = (k) => {
    setCountry(k)
    try { localStorage.setItem(COUNTRY_KEY, k) } catch { /* private window */ }
  }

  const countries = snap?.countries || {}
  const code = countries[country] ? country : COUNTRY_ORDER.find((k) => countries[k])
  const c = code ? countries[code] : null
  const models = modelsOf(c)
  const model = models.includes(modelBy[code]) ? modelBy[code] : models[0]
  const liveDays = Math.max(0, ...Object.values(countries).map((x) => x.live_days || 0))
  // the oldest issue in any country's log (the log is newest-first)
  const firstIssue = Object.values(countries).map((x) => x.issue_log?.[x.issue_log.length - 1]?.issue_time)
    .filter(Boolean).sort()[0]

  return (
    <div className="ap page">
      <header className="ap-hero">
        <p className="eyebrow">Apollo · national load forecast</p>
        <h1>How much electricity each country will use in the next 48 hours</h1>
        <p className="lede">
          Every hour Apollo reads the newest published load and the newest weather forecast, and
          issues a forecast of national demand for the next 48 hours with an uncertainty band. Two
          models make it — TabPFN v2 and Chronos-2 — and their average; one is shown, the others
          run in the background. Every forecast is kept, and later scored against the first value
          the grid operator publishes.
        </p>
        <div className="stat-line">
          {snap && <span>snapshot <b>{utcTime(snap.generated_at)}</b> ({ageSince(snap.generated_at, now)} ago)</span>}
          {snap && (liveDays >= 0.05
            ? <span>live for <b>{liveDays.toFixed(1)} days</b></span>
            : firstIssue
              ? <span>issuing since <b>{utcTime(firstIssue)}</b></span>
              : <span><b>not issuing yet</b></span>)}
          {snap && <span>issued hourly at <b>:{String(snap.issue_minute ?? 10).padStart(2, '0')}</b></span>}
          <span className="ap-badge">Built with PriorLabs-TabPFN</span>
        </div>
      </header>

      {error && (
        <div className={`ap-banner${snap ? '' : ' big'}`} role="status">
          {error.status === 503
            ? <><b>No forecast yet.</b> {error.message}. The page fills in once the hourly service has run.</>
            : <><b>{snap ? 'Could not refresh.' : 'Could not load the forecast.'}</b> {error.message}
              {snap ? ' — showing the last snapshot.' : ''}</>}
        </div>
      )}
      {loading && !snap && <p className="ap-empty">Loading the newest snapshot…</p>}

      {c && (
        <>
          <CountryCards countries={countries} selected={code} onSelect={pick} now={now} />

          <section className="ap-card ap-main">
            <header className="ap-card-head">
              <div>
                <p className="eyebrow">{c.name} · next 48 h</p>
                <h2>Published load and the newest forecast</h2>
                <p className="ap-small">{c.target}</p>
              </div>
              {models.length > 0 && <div className="ap-seg" role="group" aria-label="Model">
                {models.map((m) => (
                  <button key={m} type="button" className={m === model ? 'on' : ''} aria-pressed={m === model}
                          onClick={() => setModelBy({ ...modelBy, [code]: m })}>
                    {MODEL_LABEL[m]}<span className="ap-tag">{m === c.shown ? 'shown' : 'shadow'}</span>
                  </button>
                ))}
              </div>}
            </header>
            {model ? (
              <>
                <FanChart c={c} model={model} operatorLabel={OPERATOR_LABEL[c.operator?.series] || 'Operator forecast'} />
                <Kpis c={c} model={model} now={now} />
                <p className="ap-small">
                  {c.latest?.[model]?.calibrated ? 'Bands calibrated on the 2024 validation window. ' : 'Bands as the model gives them (not yet calibrated). '}
                  {model.startsWith('tabpfn') || model === 'average' ? 'TabPFN v2 output — Built with PriorLabs-TabPFN.' : ''}
                </p>
              </>
            ) : <ActualsChart c={c} />}
          </section>

          <div className="ap-grid2">
            <Track c={c} model={model} kind="day_ahead" title="A day ahead: what Apollo said, and what happened"
                   note="each period's forecast from about 24 h before it" liveDays={c.live_days} />
            <Track c={c} model={model} kind="hour_ahead" title="An hour ahead"
                   note="each period's forecast from about 1 h before it" liveDays={c.live_days} />
          </div>

          <LiveScores c={c} />
          <Backtest c={c} />

          <div className="ap-grid3">
            <Feeds c={c} feeds={snap.feeds} />
            <IssueStrip c={c} now={now} />
            <Diagnosis c={c} />
          </div>

          <AskApollo />
          <Notes c={c} />
        </>
      )}

      {snap && <Attribution items={snap.attribution} />}
    </div>
  )
}
