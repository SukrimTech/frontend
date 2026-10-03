/*
  Pythia's refusals — grid-yukti's `errors.js`, as a chat card.

  The server's refusal IS the content. Each carries a stable `code`, a message written for a
  person, and for several codes structure to act on: `variant`, `remedy`, `retry_after_s`,
  `bus_ids`, `coverage`. This table supplies a heading and nothing else; every other line of
  the card is a field the server returned, all of them, so a field added later still shows.

  `GPU_UNAVAILABLE` has three variants and two remedies, and the difference is the point:
  `no_torch` / `no_cuda` mean INSTALL (waiting never helps), `device_busy` means RETRY
  (reinstalling a working driver is the worst thing to do). So "Try again" appears only when
  the server says `remedy: retry`.
*/

export const STATES = {
  NO_ROAD_NETWORK: 'No drivable roads near that point',
  BUS_COUNT_UNREACHABLE: 'No cut of this network hits that bus count',
  GATE_FAILED: 'The base power flow did not converge',
  INELIGIBLE_BUS: 'A station cannot sit on that bus',
  OUT_OF_COVERAGE: 'Outside what the library covers',
  TIER_UNAVAILABLE: 'That tier is not installed here',
  GPU_UNAVAILABLE: 'The GPU is not available',
  SERVER_BUSY: 'One job at a time',
  LIBRARY_NOT_FOUND: 'The library is not where the server expects it',
  NOT_SOLVED: 'Nothing to promote yet',
  UNKNOWN_PID: 'No such placement on this feeder',
  OSM_FETCH_FAILED: 'The road-network service did not answer',
  OSM_FETCH_REQUIRED: 'This build needs to fetch roads, and was not authorised to',
  COST_REGRESSION: 'Correct rows at the wrong price',
  SERVER_RESTARTED: 'That job outlived the process running it',
  NOT_SCREENED: 'Nothing to re-count yet',
  UNKNOWN_RUN: 'No such run',
  UNKNOWN_JOB: 'No such job',
  UNKNOWN_FEEDER: 'No such feeder',
  SOLVE_FAILED: 'The validation solve exited badly',
  BUILD_TIMEOUT: 'The build ran out of time',
  WRONG_MODULE: 'The server loaded code from the wrong tree',
  INTERNAL: 'Something broke',
  BAD_REQUEST: 'That request cannot be answered as written',
  EXPORT_UNAVAILABLE: 'There is nothing to export yet',
  TOPO_UNAVAILABLE: 'This library feeder has no stored network to draw',
  UNKNOWN_STUDY: 'No such study',
  FEEDER_IN_USE: 'Runs on this feeder hold real solves',
  SERVER_UNREACHABLE: 'The Pythia server is not running',
  JOB_FAILED: 'The job failed',
}

// Formatter from the field's NAME, which is where the server puts the units.
function show(key, v) {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  if (typeof v !== 'number') return String(v)
  if (/_s$/.test(key)) return `${v.toFixed(1)} s`
  if (/_mpu$/.test(key)) return `${v.toFixed(3)} mpu`
  if (/_pct$/.test(key)) return `${v.toFixed(2)}%`
  return Number.isInteger(v) ? String(v) : v.toFixed(3)
}

export function ErrorCard({ err, onRetry }) {
  const d = err?.detail || {}
  const title = STATES[err?.code] || 'Refused'
  const rest = Object.keys(d).filter((k) => !['code', 'message'].includes(k)
    && d[k] !== null && d[k] !== undefined && d[k] !== '')
  return (
    <div className="py-err">
      <div className="py-err-head">
        <span className="wb-mono">{err?.code}</span>
        <span className="wb-meta">{err?.status ? `HTTP ${err.status}` : err?.fromServer === false
          ? 'no response' : 'reported by the job that ran it'}</span>
      </div>
      <b>{title}</b>
      <p className="wb-small">{d.message || err?.message}</p>
      {rest.length > 0 && (
        <dl className="py-kv">
          {rest.map((k) => (
            <div key={k}><dt className="wb-mono">{k}</dt><dd className="wb-mono">{show(k, d[k])}</dd></div>
          ))}
        </dl>
      )}
      <div className="wb-row">
        {d.remedy === 'retry' && onRetry && (
          <button className="wb-btn wb-btn-sm" onClick={onRetry}>Try again</button>
        )}
        {d.remedy === 'install' && (
          <span className="wb-small">Retrying will not help — the message says what is missing. Nothing was spent.</span>
        )}
      </div>
    </div>
  )
}

/** A refusal as a Needs-attention finding, so the side panel lists it like any other. */
export const errorFinding = (err) => ({
  severity: 'error',
  code: err?.code || 'ERROR',
  element: 'circuit.server',
  message: err?.detail?.message || err?.message || String(err),
})
