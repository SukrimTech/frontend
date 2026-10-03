/*
  Where the backend is, read once from the build environment (see .env.example).

  Locally nothing needs setting: the API is reached at the same origin under /api, and Vite
  proxies it to the servers on this machine. A deployed build (Vercel) sets VITE_API_BASE to
  the backend's public https address — the Cloudflare tunnel in front of the gateway — and
  every request goes there instead.
*/

const env = import.meta.env

/** The backend's origin, without a trailing slash. Empty means "this origin". */
export const API_BASE = String(env.VITE_API_BASE || '').trim().replace(/\/+$/, '')

/**
 * The gateway's shared key, sent as `X-Sukrim-Key`. It is compiled into the page, so anyone
 * who opens the page can read it: it keeps scanners out, it is not authentication.
 */
export const ACCESS_TOKEN = String(env.VITE_ACCESS_TOKEN || '').trim()

/** MapTiler key for the basemaps. Without one the maps use Esri's keyless tiles. */
export const MAPTILER_KEY = String(env.VITE_MAPTILER_KEY || '').trim()

export const apiUrl = (path) => `${API_BASE}${path}`

/** `fetch` against the backend: the base prepended and the key attached. */
export function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers || {})
  if (ACCESS_TOKEN) headers.set('X-Sukrim-Key', ACCESS_TOKEN)
  return fetch(apiUrl(path), { ...init, headers })
}

/** A plain link to the backend (a download), which cannot carry a header: key as a query. */
export function apiLink(path) {
  if (!ACCESS_TOKEN) return apiUrl(path)
  return apiUrl(path) + (path.includes('?') ? '&' : '?') + `key=${encodeURIComponent(ACCESS_TOKEN)}`
}
