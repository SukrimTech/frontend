/*
  Apollo's API — the only place the Load forecast page talks to the server.

  Two routes, both on the main API (backend/apollo.py):
    GET  /api/apollo/snapshot   everything the page draws, as the hourly service last wrote it

  The page computes no forecast and no score. Every number on it is a field of the snapshot, so
  a refusal is typed: a 503 means "nothing has been issued on this machine yet", which the page
  says in words, and a network failure is a different thing from the server saying no.
*/

import { apiFetch } from '../config.js'

export class ApolloError extends Error {
  constructor(message, { status = null, offline = false } = {}) {
    super(message)
    this.name = 'ApolloError'
    this.status = status
    this.offline = offline
  }
}

async function call(path, init) {
  let res
  try {
    res = await apiFetch(path, init)
  } catch (e) {
    throw new ApolloError(`cannot reach the API (${e.message})`, { offline: true })
  }
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { detail: text } }
  if (!res.ok) {
    throw new ApolloError(body.detail || body.error || `${res.status} ${res.statusText}`,
      { status: res.status })
  }
  return body
}

export const getSnapshot = () => call('/api/apollo/snapshot')

