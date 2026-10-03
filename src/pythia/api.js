/*
  Pythia's API — the one place the Workbench's EV-charger mode talks to its server.

  Pythia runs as its own process (backend/Pythia/routes.py on :8001, in .venv/Pythia) because
  its environment cannot share the main API's. Vite proxies `/api/pythia/*` to it and strips
  the prefix, so every path below is the server's own `/v1/...`.

  Carried over from grid-yukti's UI, and the reason for its two error classes: every number
  on screen comes from a response here, and a refusal is typed, not a string. Several refusals
  carry structure a panel is supposed to act on — `retry_after_s`, `variant`, `remedy`,
  `bus_ids` — so `ApiError` keeps the whole detail object, and a transport failure is a
  different class because "the server is not running" is not the server saying no.
*/

import { apiFetch, apiLink } from '../config.js'

const BASE = '/api/pythia'

export class ApiError extends Error {
  constructor(status, detail, url) {
    const d = (detail && typeof detail === 'object') ? detail : { message: String(detail) }
    super(d.message || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    // A failed JOB is not an HTTP refusal: the request succeeded and the work it started did
    // not, so the code comes from the job's own error object.
    this.code = d.code || (status === null ? 'JOB_FAILED'
      : status === 404 ? 'NOT_FOUND' : `HTTP_${status}`)
    this.detail = d
    this.url = url
    this.fromServer = true
  }
}

export class OfflineError extends Error {
  constructor(url, cause) {
    super(`cannot reach ${url}`)
    this.name = 'OfflineError'
    this.code = 'SERVER_UNREACHABLE'
    this.url = url
    this.cause = cause
    this.detail = {
      message: 'The Pythia server is not answering. Start it with '
        + '`.venv/Pythia/bin/python -m backend.Pythia.routes` (port 8001).',
    }
    this.fromServer = false
  }
}

async function call(method, path, body) {
  const url = BASE + path
  let res
  try {
    res = await apiFetch(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new OfflineError(url, e)
  }
  // The dev proxy answers 502/504 itself when nothing listens on :8001 — that is the server
  // being absent, not refusing, and is reported as such.
  if ((res.status === 502 || res.status === 504) && !res.headers.get('content-type')?.includes('json')) {
    throw new OfflineError(url, new Error(`${res.status} from the proxy`))
  }
  let payload = null
  try { payload = await res.json() } catch { payload = null }
  if (!res.ok) {
    const d = payload && payload.detail !== undefined ? payload.detail : payload
    throw new ApiError(res.status, d === null || d === undefined
      ? { message: `${res.status} ${res.statusText || 'error'} from ${path}, with no JSON body — `
                 + 'the server failed before it could describe the failure' }
      : d, url)
  }
  return payload
}

export const api = {
  health: () => call('GET', '/v1/health'),
  options: () => call('GET', '/v1/options'),
  libFeeders: () => call('GET', '/v1/library/feeders'),
  libFeeder: (fid, arm) => call('GET', `/v1/library/feeders/${encodeURIComponent(fid)}`
                                         + (arm ? `?arm=${arm}` : '')),
  libScreen: (body) => call('POST', '/v1/library/screen', body),
  libStudies: () => call('GET', '/v1/library/studies'),
  libStudy: (sid) => call('GET', `/v1/library/studies/${sid}`),
  libStudyReport: (sid) => call('GET', `/v1/library/studies/${sid}/report`),
  feeders: () => call('GET', '/v1/feeders'),
  feeder: (fid) => call('GET', `/v1/feeders/${fid}`),
  renameFeeder: (fid, name) => call('PUT', `/v1/feeders/${fid}/name`, { name }),
  deleteFeeder: (fid, force) => call('DELETE', `/v1/feeders/${fid}${force ? '?force=true' : ''}`),
  buildFeeder: (req) => call('POST', '/v1/feeders', req),
  appendPlacements: (fid, pl) => call('POST', `/v1/feeders/${fid}/placements`, { placements: pl }),
  job: (jid) => call('GET', `/v1/jobs/${jid}`),
  createRun: (body) => call('POST', '/v1/runs', body),
  runs: (fid) => call('GET', fid ? `/v1/runs?feeder_id=${fid}` : '/v1/runs'),
  screen: (rid, body) => call('POST', `/v1/runs/${rid}/screen`, body || {}),
  recount: (rid, body) => call('POST', `/v1/runs/${rid}/recount`, body || {}),
  envelope: (rid, vmin) => call('GET', `/v1/runs/${rid}/envelope`
                                        + (vmin !== undefined && vmin !== null ? `?vmin=${vmin}` : '')),
  report: (rid, vmin) => call('GET', `/v1/runs/${rid}/report`
                                      + (vmin !== undefined && vmin !== null ? `?vmin=${vmin}` : '')),
  candidates: (rid) => call('GET', `/v1/runs/${rid}/candidates`),
  validate: (rid, pid) => call('POST', `/v1/runs/${rid}/validate`, { pid }),
  promote: (rid, pid) => call('POST', `/v1/runs/${rid}/anchors`, { pid }),
  lopo: (rid) => call('GET', `/v1/runs/${rid}/lopo`),
}

export const exportUrl = (rid, vmin, z) =>
  apiLink(`${BASE}/v1/runs/${rid}/export.xlsx?${new URLSearchParams({ vmin: String(vmin), z: String(z) })}`)

/*
  Poll a job to settlement. The phases ARE the progress: `phases[].elapsed_s` is computed by
  the server at read time for whatever is running, so `onTick` repaints from measured elapsed
  time on every poll and never from a predicted one.
*/
export async function pollJob(jid, onTick, intervalMs = 500) {
  for (;;) {
    const d = await api.job(jid)
    if (onTick) onTick(d)
    if (d.state === 'done' || d.state === 'failed') return d
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
