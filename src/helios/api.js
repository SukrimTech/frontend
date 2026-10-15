/*
  Helios's API — the one place the Workbench's rooftop-solar mode talks to its server.

  Helios runs as its own process (backend/Helios/routes.py on :8003, in .venv/Helios), for
  the reason Pythia does: its environment cannot share the main API's. Vite proxies
  `/api/helios/*` to it and strips the prefix, so every path below is the server's `/v1/...`.

  Errors are typed the way Pythia's client types them: a refusal from the server keeps its
  whole detail object (`code`, `message`, `retry_after_s`, ...), and "the server is not
  running" is a different class, because it is not the server saying no.
*/

import { apiFetch } from '../config.js'

const BASE = '/api/helios'

export class ApiError extends Error {
  constructor(status, detail, url) {
    const d = (detail && typeof detail === 'object') ? detail : { message: String(detail) }
    super(d.message || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = d.code || (status === 404 ? 'NOT_FOUND' : `HTTP_${status}`)
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
      message: 'The Helios server is not answering. Start it with '
        + '`.venv/Helios/bin/python -m backend.Helios.routes` (port 8003).',
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
  if ((res.status === 502 || res.status === 504) && !res.headers.get('content-type')?.includes('json')) {
    throw new OfflineError(url, new Error(`${res.status} from the proxy`))
  }
  const text = await res.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) {
    const d = payload && payload.detail !== undefined ? payload.detail : payload
    throw new ApiError(res.status, d ?? { message: `${res.status} from ${path}` }, url)
  }
  return payload
}

export const api = {
  health: () => call('GET', '/v1/health'),
  options: () => call('GET', '/v1/options'),
  feeders: () => call('GET', '/v1/library/feeders'),
  feeder: (sid) => call('GET', `/v1/library/feeders/${encodeURIComponent(sid)}`),
  createRun: (body) => call('POST', '/v1/runs', body),
  runs: () => call('GET', '/v1/runs'),
  run: (rid) => call('GET', `/v1/runs/${rid}`),
  recount: (rid, body) => call('POST', `/v1/runs/${rid}/recount`, body),
  anchor: (rid, pid) => call('POST', `/v1/runs/${rid}/anchors`, { pid }),
  rescreen: (rid) => call('POST', `/v1/runs/${rid}/screen`, {}),
  report: (rid) => call('GET', `/v1/runs/${rid}/report`),
}
