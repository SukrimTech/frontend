import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSnapshot } from '../apollo/api.js'
import AskApollo from '../apollo/Ask.jsx'
import { COUNTRY_ORDER, modelsOf } from '../apollo/data.js'
import { MODEL_LABEL, OPERATOR_LABEL, utcTime } from '../apollo/format.js'
import { Accuracy, CountryCards, FanChart, Footer, Inputs, KpiStrip } from '../apollo/panels.jsx'
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

  return (
    <div className="ap">
      {/* Its own top bar, like the landing page and the Workbench (App hides the docs header). */}
      <header className="ap-top">
        <div className="ap-top-inner">
          <Link to="/" className="ap-brand">
            <img src="/assets/sukrim-icon.svg" alt="" />
            <img src="/assets/sukrim-wordmark.svg" alt="SUKRIM" className="ap-wordmark" />
          </Link>
          <span className="ap-top-sep" aria-hidden="true" />
          <span className="ap-top-title">Load forecast</span>
          {snap && (
            <span className={`ap-live${error ? ' off' : ''}`}>
              <i aria-hidden="true" />{error ? 'Offline' : 'Live'} · updated {utcTime(snap.generated_at)}
            </span>
          )}
          <nav className="ap-top-nav">
            <Link to="/">Overview</Link>
            <Link to="/docs">Docs</Link>
            <Link to="/workbench" className="ap-pill dark">Workbench <span className="ap-mono">→</span></Link>
          </nav>
        </div>
      </header>

      <div className="ap-wrap ap-dash">
        {error && !snap && (
          <div className="ap-banner big" role="status">
            {error.status === 503 ? 'No forecast available yet.' : `Could not load the forecast: ${error.message}`}
          </div>
        )}
        {loading && !snap && <p className="ap-empty">Loading…</p>}

        {c && (
          <>
            <CountryCards countries={countries} selected={code} onSelect={pick} now={now} />
            <KpiStrip c={c} model={model || c.shown} now={now} />

            <section className="ap-card ap-main">
              <header className="ap-card-head">
                <div>
                  <p className="ap-kicker">{c.name} · next 48 h</p>
                  <h2>Load forecast</h2>
                </div>
                {models.length > 1 && <div className="ap-seg" role="group" aria-label="Model">
                  {models.map((m) => (
                    <button key={m} type="button" className={m === model ? 'on' : ''} aria-pressed={m === model}
                            onClick={() => setModelBy({ ...modelBy, [code]: m })}>{MODEL_LABEL[m]}</button>
                  ))}
                </div>}
              </header>
              <FanChart c={c} model={model} operatorLabel={OPERATOR_LABEL[c.operator?.series] || 'Grid operator'} />
            </section>

            <Accuracy c={c} />
            <Inputs c={c} />
            <AskApollo />
          </>
        )}

        <Footer />
      </div>
    </div>
  )
}
