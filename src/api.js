// The whole API surface, in one place. Every call returns parsed JSON or
// throws with the server's own message -- a fetch wrapper that swallows the
// reason is worse than no wrapper.

async function json(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { detail: text } }
  if (!response.ok) {
    throw new Error(body.detail || body.error || `${response.status} ${response.statusText}`)
  }
  return body
}

export const getHealth = () => fetch('/api/health').then(json)
export const getAgents = () => fetch('/api/agents').then(json)
export const getExamples = () => fetch('/api/examples').then(json)

export const postRoute = (prompt) =>
  fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  }).then(json)

export function postRun({ prompt = '', agent = '', example = '', files = [], answers = null }) {
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('agent', agent)
  form.append('example', example)
  if (answers) form.append('answers', JSON.stringify(answers))
  for (const file of files) form.append('files', file, file.name)
  return fetch('/api/run', { method: 'POST', body: form }).then(json)
}

export const getDiagram = (example, method = 'auto') =>
  fetch('/api/diagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ example, method }),
  }).then(json)

/* --- the workbench: a model somebody is editing ------------------------ */

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(json)

export const openSession = (example) => post('/api/session', { example })

/*
  Open a workbench on the user's own model.

  `webkitRelativePath` is sent as the filename rather than the bare name,
  because an OpenDSS feeder is a directory tree: the master `redirect`s at
  files beside and above it, and IEEE 13 in the official test suite redirects
  to `../IEEELineCodes.DSS`. Flattened into one folder those redirects do not
  resolve and the model either imports as a fragment or not at all. The server
  re-roots whatever arrives, so a path that tries to climb goes nowhere.
*/
export const uploadSession = (items) => {
  const form = new FormData()
  for (const { file, path } of items) {
    form.append('files', file, path || file.name)
  }
  return fetch('/api/session/upload', { method: 'POST', body: form }).then(json)
}
export const getSession = (id) => fetch(`/api/session/${id}`).then(json)
export const editSession = (id, edits) => post(`/api/session/${id}/edit`, { edits })
export const undoSession = (id) => post(`/api/session/${id}/undo`)
export const resetSession = (id) => post(`/api/session/${id}/reset`)
export const runSession = (id, body) => post(`/api/session/${id}/run`, body)
export const getElement = (id, collection, name) =>
  fetch(`/api/session/${id}/element/${collection}/${encodeURIComponent(name)}`).then(json)
