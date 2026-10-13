/*
  Ask Apollo — the agent, from the page.

  The agent reads the stored forecasts; it never computes one for a request, and the language
  model only names the country, the window and the quantity from the request's words. When the
  model cannot be reached, nothing is guessed: the agent asks which country, and the options come
  back as buttons. The quick buttons send the slots directly, so the box works with no language
  model at all.
*/

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ask } from './api.js'

const QUICK = [
  { label: 'France, tomorrow', answers: { country: 'FR', window: 'tomorrow' } },
  { label: 'GB, next 24 h', answers: { country: 'GB', window: 'next_24h' } },
  { label: 'Switzerland, peak in 48 h', answers: { country: 'CH', window: 'next_48h', quantity: 'peak' } },
  { label: 'How accurate, France', answers: { country: 'FR', quantity: 'accuracy' } },
]
const COUNTRY = { FR: 'France', GB: 'Great Britain', CH: 'Switzerland' }

export default function AskApollo() {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [last, setLast] = useState({ prompt: '', answers: {} })

  const send = async (p, answers = {}) => {
    setBusy(true); setErr(null)
    setLast({ prompt: p, answers })
    try {
      const out = await ask(p, answers)
      setRes(out.result)
    } catch (e) {
      setErr(e.message); setRes(null)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (prompt.trim()) send(prompt.trim())
  }

  return (
    <section className="ap-card ap-ask">
      <header className="ap-card-head">
        <div><p className="ap-kicker">The agent</p><h2>Ask Apollo</h2></div>
      </header>
      <form onSubmit={submit} className="ap-ask-form">
        <label htmlFor="ap-ask-input" className="sr">Your question</label>
        <input id="ap-ask-input" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
               placeholder="e.g. what will Great Britain’s demand peak be tomorrow?" maxLength={400} />
        <button type="submit" className="ap-pill dark" disabled={busy || !prompt.trim()}>{busy ? 'Asking…' : 'Ask'}</button>
      </form>
      <div className="ap-quick" role="group" aria-label="Quick questions">
        {QUICK.map((q) => (
          <button key={q.label} type="button" className="ap-chip" disabled={busy}
                  onClick={() => send(q.label, q.answers)}>{q.label}</button>
        ))}
      </div>
      {err && <p className="ap-fail">{err}</p>}
      {res && (
        <div className="ap-answer" aria-live="polite">
          <p className="ap-small mono">{res.summary}{res.elapsed_s != null ? ` · ${res.elapsed_s.toFixed(2)} s` : ''}</p>
          {res.questions?.length > 0 && (
            <div className="ap-questions">
              {res.questions.map((q) => (
                <div key={q.key}>
                  <p>{q.why}</p>
                  <div className="ap-quick">
                    {(q.options || []).map((o) => (
                      <button key={o} type="button" className="ap-chip on" disabled={busy}
                              onClick={() => send(last.prompt, { ...last.answers, [q.key]: o })}>
                        {COUNTRY[o] || o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {res.findings?.length > 0 && (
            <ul className="ap-findings">
              {res.findings.map((f, i) => (
                <li key={i}><span className={`sev sev-${f.severity}`}>{f.severity}</span> {f.message}</li>
              ))}
            </ul>
          )}
          {res.error && <p className="ap-fail">{res.error}</p>}
          {res.report_markdown && res.state === 'report' && (
            <div className="ap-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{res.report_markdown}</ReactMarkdown></div>
          )}
        </div>
      )}
    </section>
  )
}
