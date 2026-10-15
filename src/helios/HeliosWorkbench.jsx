import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Boundary from '../components/Boundary.jsx'
import { getHealth, postRoute } from '../api.js'
import { api } from './api.js'
import { ErrorCard, errorFinding } from '../pythia/errors.jsx'
import { NetworkGraph } from '../pythia/NetworkGraph.jsx'
import '../pythia/pythia.css'
import './helios.css'
import { useColumnResize } from '../workbench/ColumnResizer.jsx'

/*
  The Workbench's rooftop-solar mode — Helios. The mirror of the EV-charger mode, in the same
  frame: the top bar, the Assistant on the left, the stage in the middle with Network and
  Report tabs, the side panel on the right.

    stage      the library feeder as a network drawing, painted by verdict: one placement at a
               time, or one size of the hosting ladder at every bus screened
    Assistant  three studies: the hosting capacity of chosen buses, a screen of stated PV
               placements, and a check against the library's own solved placements
    side       the feeder, the conditions (source voltage, midday load, Vmax), what to screen,
               the answer tables, and the findings

  The two standing rules are Pythia's: THE CLIENT INVENTS NOTHING — every number is a response
  field — and THE USER SELECTS — nothing here ranks buses or picks which placement to solve.
  Moving Vmax re-counts the stored predictions on the server: no model, no solve.
*/

const STUDIES = {
  hosting: { agent: 'helios:hosting', label: 'Hosting capacity', ask: 'how much rooftop solar can these buses take',
             about: 'A ladder of PV sizes at each chosen bus: the largest called feasible, and the first it will not decide.' },
  screen: { agent: 'helios:screen', label: 'Screen my placements', ask: 'screen these rooftop PV placements',
            about: 'Feasible, infeasible or inconclusive for every bus, for the PV you place.' },
  library: { agent: 'helios:library', label: 'Check against the library', ask: 'how accurate is the screen on this feeder',
             about: 'Screens the library’s own solved placements with each held out, and scores the answer.' },
}
const COHORT_WORDS = {
  STANDARD: 'In the retrieval library', EXTERNAL: 'Published feeders never in the library',
  ROADNET: 'Traced from a road network, held out', INDIA: 'Indian feeders (Part A), held out',
}
const VERDICTS = ['feasible', 'inconclusive', 'infeasible']

export default function HeliosWorkbench({ entry, onExit, onOpenModel, shared }) {
  const { TopBar, Assistant, ReportView, NeedsAttention } = shared
  const cols = useColumnResize()
  const [options, setOptions] = useState(null)
  const [catalogue, setCatalogue] = useState(null)
  const [routerUp, setRouterUp] = useState(false)
  const [source, setSource] = useState(entry?.source || null)
  const [feeder, setFeeder] = useState(null)
  const [cond, setCond] = useState({ head: 1.0, arm: 'pv040', vmax: 1.05, method: 'screen' })
  const [mode, setMode] = useState('hosting')
  const [buses, setBuses] = useState([])
  const [allBuses, setAllBuses] = useState(false)
  const [places, setPlaces] = useState([[{ bus: '', kwp: '' }]])
  const [run, setRun] = useState(null)
  const [paint, setPaint] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('diagram')
  const [unread, setUnread] = useState(false)
  const [messages, setMessages] = useState([])
  const [errors, setErrors] = useState([])
  const recountTimer = useRef(null)

  const say = useCallback((role, text, extra = {}) =>
    setMessages((m) => [...m, { role, text, ...extra, at: Date.now() }]), [])
  const fail = useCallback((e) => {
    say('error', '', { node: <ErrorCard err={e} /> })
    setErrors((x) => [errorFinding(e), ...x].slice(0, 6))
  }, [say])

  useEffect(() => {
    api.options().then((o) => {
      setOptions(o)
      setCond((c) => ({ ...c, vmax: o.vmax.default }))
    }, fail)
    api.feeders().then(setCatalogue, fail)
    getHealth().then((h) => setRouterUp(Boolean(h?.router?.reachable)), () => setRouterUp(false))
    say('system', 'Rooftop-solar hosting screening. Pick a feeder, the conditions it runs at midday, '
      + 'and what to screen. Every answer is feasible, infeasible or **inconclusive** — the last means '
      + 'the model will not make the call and a real solve is the way to settle it.')
  }, [fail, say])

  useEffect(() => {
    if (!source) return
    setFeeder(null); setRun(null); setBuses([]); setPaint(null)
    api.feeder(source).then(setFeeder, fail)
  }, [source, fail])

  const graph = useMemo(() => {
    if (!feeder) return null
    const b = [{ bus_id: feeder.slack, is_slack: true },
      ...feeder.buses.map((x) => ({ bus_id: x.bus, has_load: x.load_kw > 0, p_kw: x.load_kw }))]
    return { buses: b, lines: feeder.lines }
  }, [feeder])

  /* ---------------------------------------------------------------- running */

  function request(kind) {
    const base = { feeder: feeder.source_id, head: cond.head, arm: cond.arm, vmax: cond.vmax,
                   method: kind === 'library' ? 'screen' : cond.method }
    if (kind === 'hosting') {
      return { ...base, mode: 'hosting', hosting: allBuses ? 'all' : buses }
    }
    if (kind === 'screen') {
      const pl = places.map((p) => ({ sites: p.filter((s) => s.bus !== '' && s.kwp !== '')
        .map((s) => ({ bus: Number(s.bus), kwp: Number(s.kwp) })) })).filter((p) => p.sites.length)
      return { ...base, mode: 'placements', placements: pl }
    }
    return { ...base, mode: 'library', pids: [], hold_out: 'placements' }
  }

  async function go(kind) {
    if (!feeder) { say('assistant', 'Pick a feeder in the side panel first.'); return }
    const req = request(kind)
    if (kind === 'hosting' && !allBuses && !buses.length) {
      say('assistant', 'Click the buses whose hosting capacity you want on the network, or tick **every load bus**.')
      return
    }
    if (kind === 'screen' && !req.placements.length) {
      say('assistant', 'Add at least one placement: a bus and a size in kWp.'); return
    }
    setMode(kind); setBusy(true)
    say('assistant', `Running **${STUDIES[kind].label.toLowerCase()}** on \`${feeder.source_id}\` — source `
      + `${cond.head.toFixed(2)} pu, midday load ${cond.arm}, limit ${cond.vmax} pu.`)
    try {
      const r = await api.createRun(req)
      setRun(r)
      afterRun(r, kind)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  function afterRun(r, kind) {
    setUnread(tab !== 'report')
    if (r.questions?.length) {
      say('assistant', 'The screen needs more before it can answer:\n\n'
        + r.questions.map((q) => `- **${q.key}** — ${q.why}`).join('\n'))
      return
    }
    if (!r.result) {
      say('assistant', `The study stopped at **${r.state}**: ${r.findings.map((f) => f.message).join(' ')}`)
      return
    }
    const s = r.result.summary
    let lead = `${s.feasible} feasible, ${s.infeasible} infeasible and **${s.inconclusive} inconclusive** `
      + `of ${s.n} bus × placement rows.`
    if (kind === 'hosting') {
      const lad = Object.entries(r.result.ladder)
      lead = lad.map(([b, e]) => `bus ${b}: feasible up to **${e.hosting_kwp} kWp**`
        + (e.undecided_kwp ? `, undecided at ${e.undecided_kwp}` : '')
        + (e.first_infeasible_kwp ? `, infeasible from ${e.first_infeasible_kwp}` : '')).slice(0, 8).join('; ')
        + (lad.length > 8 ? `; … ${lad.length - 8} more buses in the side panel.` : '.')
      setPaint({ kind: 'rung', value: 0 })
    } else {
      setPaint({ kind: 'pid', value: r.result.placements[0]?.pid ?? 0 })
    }
    const ff = r.result.false_feasible
    const tail = ff && ff.n_infeasible
      ? ` Against the library's own Monte-Carlo labels: ${ff.n_false_feasible} of ${ff.n_infeasible} truly-infeasible rows called feasible; MAE ${r.result.error.mae_mpu.toFixed(2)} mpu.`
      : ''
    say('assistant', lead + tail, { report: true })
  }

  function onVmax(v) {
    setCond((c) => ({ ...c, vmax: v }))
    if (!run?.result) return
    clearTimeout(recountTimer.current)
    recountTimer.current = setTimeout(async () => {
      try {
        const rc = await api.recount(run.run_id, { vmax: v })
        setRun((r) => ({ ...r, result: { ...r.result, ...rc } }))
      } catch (e) { fail(e) }
    }, 250)
  }

  async function solve(pid) {
    setBusy(true)
    say('assistant', `Spending a real Monte-Carlo solve on placement ${pid}…`)
    try {
      const a = await api.anchor(run.run_id, pid)
      const e = a.error
      say('assistant', `Measured on placement ${pid} (${a.n_mc} draws): MAE ${e.mae_mpu.toFixed(2)} mpu, `
        + `${Math.round(100 * e.inside_sigma)} % of buses within ±σ, ${e.n_false_feasible} of `
        + `${e.n_infeasible} truly-infeasible buses called feasible. Its rows now join the context — `
        + 'screen again to use them.', {
        node: <div className="wb-row"><button className="wb-btn wb-btn-dark wb-btn-sm" onClick={rescreen}>Screen again with the anchor</button></div>,
      })
    } catch (er) { fail(er) } finally { setBusy(false) }
  }

  async function rescreen() {
    setBusy(true)
    try {
      const r = await api.rescreen(run.run_id)
      setRun(r)
      afterRun(r, mode)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const DO = { 'helios:hosting': () => go('hosting'), 'helios:screen': () => go('screen'),
               'helios:library': () => go('library') }

  async function ask(text, agent = '') {
    if (agent && DO[agent]) { if (text) say('user', text); return DO[agent]() }
    say('user', text)
    if (!routerUp) { say('assistant', 'No language model is running, so I cannot route that. Pick a study under Studies.'); return undefined }
    setBusy(true)
    try {
      const r = await postRoute(text)
      setBusy(false)
      if (r.agent === 'helios') {
        say('assistant', `That is a rooftop-solar question — running **${STUDIES[mode].label.toLowerCase()}** with the `
          + 'buses, sizes and conditions set in the side panel. Helios does not read sizes from the sentence; '
          + 'put them in the panel so what is screened is exactly what you see.')
        return DO[STUDIES[mode].agent]()
      }
      say('assistant', r.agent
        ? `That is a question for another agent (${r.agent}), which works on an opened network model. Use **Open… → A network model**.`
        : `${r.reason || 'I could not tell which study you meant.'} Pick one under Studies.`)
    } catch (e) { fail(e) } finally { setBusy(false) }
    return undefined
  }

  /* ---------------------------------------------------------------- painting */

  const res = run?.result
  const rungs = useMemo(() => {
    if (!res?.ladder) return []
    const first = Object.values(res.ladder)[0]
    return first ? first.sizes_kwp : []
  }, [res])

  const verdictByBus = useMemo(() => {
    if (!res || !paint) return null
    const o = {}
    if (paint.kind === 'pid') {
      for (const r of res.rows) if (r.pid === paint.value) o[r.bus_id] = r.verdict
    } else {
      for (const [b, e] of Object.entries(res.ladder || {})) {
        const v = e.verdicts[paint.value]
        if (v) o[Number(b)] = v
      }
    }
    return Object.keys(o).length ? o : null
  }, [res, paint])

  const toggleBus = (id) => {
    if (mode !== 'hosting' && mode !== 'screen') return
    if (!feeder?.load_buses.includes(id)) return
    if (mode === 'hosting') setBuses((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id].sort((x, y) => x - y)))
    else setPlaces((p) => { const q = p.map((x) => [...x]); q[q.length - 1].push({ bus: id, kwp: '' }); return q })
  }

  const findings = [...(run?.findings || []), ...errors]
  const title = feeder ? feeder.source_id : 'Rooftop solar'
  const reports = run?.report ? [{ label: 'Helios', markdown: run.report }] : []

  return (
    <div className="wb wb-app py he">
      <TopBar title={title} ext="rooftop PV" badge={run ? `run ${run.run_id.slice(0, 8)}` : 'no run yet'}
              busy={busy} editing={false}
              menu={[
                { label: 'A network model…', about: 'Back to the model workbench and its studies', run: onOpenModel },
                { label: 'The start screen', about: 'Back to the list of examples and feeders', run: onExit },
              ]} />

      <div className="wb-cols" ref={cols.ref} style={cols.style}>
        <Assistant messages={messages} busy={busy} studies={Object.values(STUDIES)} online={routerUp}
                   onAsk={ask} onFollowUp={() => {}} onOpenReport={() => { setTab('report'); setUnread(false) }}
                   onAttach={onOpenModel} attachLabel="Open model" placeholder="Ask about rooftop solar…" />

        <section className="wb-stage">
          {cols.handles}
          <div className="wb-panehead wb-stagehead">
            <div role="tablist" className="wb-tabs">
              <button role="tab" aria-selected={tab === 'diagram'} className={tab === 'diagram' ? 'on' : ''}
                      onClick={() => setTab('diagram')}>Network</button>
              <button role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'on' : ''}
                      onClick={() => { setTab('report'); setUnread(false) }}>
                Report{unread && <span className="wb-dot" aria-label="new" />}
              </button>
            </div>
            {tab === 'diagram' && res && (
              <div className="wb-row">
                {res.ladder && Object.keys(res.ladder).length > 0 ? (
                  <label className="wb-paint" title="each screened bus painted by the verdict for PV of this size at that bus">
                    <span>Size</span>
                    <select value={paint?.kind === 'rung' ? paint.value : ''}
                            onChange={(e) => setPaint({ kind: 'rung', value: Number(e.target.value) })}>
                      {rungs.map((k, i) => <option key={k} value={i}>{k} kWp</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="wb-paint" title="a bus carries one verdict per placement, so one is drawn at a time">
                    <span>Placement</span>
                    <select value={paint?.kind === 'pid' ? paint.value : ''}
                            onChange={(e) => setPaint({ kind: 'pid', value: Number(e.target.value) })}>
                      {res.placements.map((p) => <option key={p.pid} value={p.pid}>P{p.pid} · {p.kwp_total} kWp</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          <div className="wb-canvas" hidden={tab !== 'diagram'}>
            <div className="wb-grid" />
            <Boundary label="The network">
              {graph
                ? <div className="py-graph"><NetworkGraph buses={graph.buses} lines={graph.lines} verdictByBus={verdictByBus}
                                                          picked={mode === 'hosting' ? buses : null}
                                                          onBus={toggleBus} clickable={new Set(feeder.load_buses)} /></div>
                : <div className="wb-diagram-empty">{source ? 'Drawing the network…' : 'Pick a feeder in the side panel.'}</div>}
            </Boundary>
            <Legend />
          </div>
          <div className="wb-report-pane" hidden={tab !== 'report'}>
            <Boundary label="The report"><ReportView docs={reports} title={title} /></Boundary>
          </div>
        </section>

        <aside className="wb-side">
          <Boundary label="The inspector">
            <FeederPicker catalogue={catalogue} source={source} setSource={setSource} feeder={feeder} />
            {feeder && (
              <Conditions options={options} cond={cond} setCond={setCond} onVmax={onVmax} feeder={feeder} />
            )}
            {feeder && (
              <WhatToScreen mode={mode} setMode={setMode} buses={buses} setBuses={setBuses} allBuses={allBuses}
                            setAllBuses={setAllBuses} places={places} setPlaces={setPlaces} feeder={feeder}
                            busy={busy} onRun={() => go(mode)} />
            )}
          </Boundary>
          {res && <Answer res={res} mode={mode} onSolve={solve} busy={busy} onPaint={setPaint} />}
          <NeedsAttention findings={findings} edits={[]} onShow={() => {}} onRevert={() => {}} />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ side panel pieces */

function FeederPicker({ catalogue, source, setSource, feeder }) {
  const groups = useMemo(() => {
    const g = {}
    for (const f of catalogue?.feeders || []) (g[f.cohort] ||= []).push(f)
    return g
  }, [catalogue])
  return (
    <div className="wb-block">
      <div className="wb-block-head"><span className="wb-h">Feeder</span>
        {feeder && <span className="wb-mono wb-small">{feeder.buses.length} buses · {Math.round(feeder.nominal_kw)} kW peak</span>}
      </div>
      {!catalogue && <p className="wb-small">Reading the PV library…</p>}
      <select className="he-select" value={source || ''} onChange={(e) => setSource(e.target.value || null)}>
        <option value="">Choose a network…</option>
        {Object.entries(groups).map(([c, list]) => (
          <optgroup key={c} label={COHORT_WORDS[c] || c}>
            {list.map((f) => <option key={f.source_id} value={f.source_id}>{f.source_id}</option>)}
          </optgroup>
        ))}
      </select>
      {feeder && <p className="wb-small">{COHORT_WORDS[feeder.cohort] || feeder.cohort}. Seed <span className="wb-mono">{feeder.seed}</span>.</p>}
    </div>
  )
}

function Conditions({ options, cond, setCond, onVmax }) {
  const arms = options ? Object.entries(options.arms) : []
  return (
    <div className="wb-block">
      <div className="wb-block-head"><span className="wb-h">Conditions at midday</span></div>
      <label className="he-field"><span>Source voltage</span>
        <select value={cond.head} onChange={(e) => setCond((c) => ({ ...c, head: Number(e.target.value) }))}>
          {(options?.heads || [1.0]).map((h) => <option key={h} value={h}>{h.toFixed(2)} pu</option>)}
        </select>
      </label>
      <label className="he-field"><span>Load while the sun is up</span>
        <select value={cond.arm} onChange={(e) => setCond((c) => ({ ...c, arm: e.target.value }))}>
          {arms.map(([a, m]) => <option key={a} value={a}>{Math.round(100 * m)} % of peak ({a})</option>)}
        </select>
      </label>
      <label className="he-field"><span>Upper limit V<sub>max</sub> — <b className="wb-mono">{cond.vmax.toFixed(3)} pu</b></span>
        <input type="range" min={options?.vmax.min ?? 1.0} max={options?.vmax.max ?? 1.2}
               step={options?.vmax.step ?? 0.005} value={cond.vmax}
               onChange={(e) => onVmax(Number(e.target.value))} />
      </label>
      <div className="wb-row">
        {(options?.vmax.presets || []).map((p) => (
          <button key={p.value} className={`wb-chipbtn${Math.abs(cond.vmax - p.value) < 1e-9 ? ' on' : ''}`}
                  title={p.name} onClick={() => onVmax(p.value)}>{p.value.toFixed(2)}</button>
        ))}
      </div>
      <label className="he-field"><span>How to answer</span>
        <select value={cond.method} onChange={(e) => setCond((c) => ({ ...c, method: e.target.value }))}>
          <option value="screen">Screen — the model, in seconds, with its own uncertainty</option>
          <option value="solve">Solve — the real Monte Carlo, 1,000 draws per size</option>
        </select>
      </label>
      <p className="wb-small">Moving the limit after a screen re-counts the stored predictions: no model, no solve.</p>
    </div>
  )
}

function WhatToScreen({ mode, setMode, buses, setBuses, allBuses, setAllBuses, places, setPlaces, feeder, busy, onRun }) {
  const set = (i, j, k, v) => setPlaces((p) => p.map((pl, a) => (a !== i ? pl : pl.map((s, b) => (b !== j ? s : { ...s, [k]: v })))))
  return (
    <div className="wb-block">
      <div className="wb-block-head"><span className="wb-h">What to screen</span></div>
      <div className="wb-row">
        {Object.entries(STUDIES).map(([k, s]) => (
          <button key={k} className={`wb-chipbtn${mode === k ? ' on' : ''}`} onClick={() => setMode(k)}>{s.label}</button>
        ))}
      </div>
      <p className="wb-small">{STUDIES[mode].about}</p>
      {mode === 'hosting' && (
        <>
          <label className="he-check"><input type="checkbox" checked={allBuses} onChange={(e) => setAllBuses(e.target.checked)} />
            every load bus ({feeder.load_buses.length})</label>
          {!allBuses && (
            <p className="wb-small">{buses.length ? <>Buses: <span className="wb-mono">{buses.join(', ')}</span> — </> : null}
              click load buses on the network to add or remove them.
              {buses.length > 0 && <button className="wb-linkbtn" onClick={() => setBuses([])}> clear</button>}</p>
          )}
          <p className="wb-small">Sizes screened at each bus: <span className="wb-mono">{feeder.ladder_kwp.join(', ')}</span> kWp
            (fractions of the feeder’s peak load).</p>
        </>
      )}
      {mode === 'screen' && (
        <>
          {places.map((pl, i) => (
            <div key={i} className="he-place">
              <span className="wb-mono wb-small">P{i}</span>
              {pl.map((s, j) => (
                <span key={j} className="he-site">
                  <input placeholder="bus" value={s.bus} onChange={(e) => set(i, j, 'bus', e.target.value)} />
                  <input placeholder="kWp" value={s.kwp} onChange={(e) => set(i, j, 'kwp', e.target.value)} />
                </span>
              ))}
              <button className="wb-linkbtn" onClick={() => setPlaces((p) => p.map((x, a) => (a === i ? [...x, { bus: '', kwp: '' }] : x)))}>+ site</button>
            </div>
          ))}
          <div className="wb-row">
            <button className="wb-btn wb-btn-sm" onClick={() => setPlaces((p) => [...p, [{ bus: '', kwp: '' }]])}>Add placement</button>
          </div>
          <p className="wb-small">Clicking a load bus adds it as a site of the last placement.</p>
        </>
      )}
      {mode === 'library' && (
        <p className="wb-small">Each of the library’s own placements on this network is screened with itself held out,
          then scored against the Monte-Carlo label the library stores. No power flow is run.</p>
      )}
      <div className="wb-row">
        <button className="wb-btn wb-btn-dark wb-btn-sm" disabled={busy} onClick={onRun}>{busy ? 'Screening…' : 'Screen'}</button>
      </div>
    </div>
  )
}

function Answer({ res, mode, onSolve, busy, onPaint }) {
  const s = res.summary
  return (
    <div className="wb-block">
      <div className="wb-block-head"><span className="wb-h">Answer</span>
        <span className="wb-mono wb-small">V<sub>max</sub> {res.vmax.toFixed(3)} · ±{res.z}σ</span></div>
      <div className="wb-row he-mix">
        {VERDICTS.map((v) => <span key={v} className={`py-pill ${v}`}>{s[v]} {v}</span>)}
      </div>
      {res.ladder && Object.keys(res.ladder).length > 0 && (
        <table className="he-table">
          <thead><tr><th>bus</th><th>feasible up to</th><th>undecided</th><th>infeasible from</th></tr></thead>
          <tbody>
            {Object.entries(res.ladder).sort((a, b) => Number(a[0]) - Number(b[0])).map(([b, e]) => (
              <tr key={b}>
                <td className="wb-mono">{b}</td><td><b>{e.hosting_kwp} kWp</b></td>
                <td>{e.undecided_kwp ?? '—'}</td><td>{e.first_infeasible_kwp ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {mode !== 'hosting' && (
        <table className="he-table">
          <thead><tr><th>placement</th><th>kWp</th><th>verdict</th><th /></tr></thead>
          <tbody>
            {res.placements.map((p) => (
              <tr key={p.pid}>
                <td><button className="wb-linkbtn" onClick={() => onPaint({ kind: 'pid', value: p.pid })}>P{p.pid}</button>
                  <span className="wb-small"> {p.buses.slice(0, 4).join(', ')}{p.buses.length > 4 ? '…' : ''}</span></td>
                <td>{p.kwp_total}</td>
                <td><span className={`py-pill ${p.verdict}`}>{p.verdict}</span></td>
                <td>{p.sites && p.verdict === 'inconclusive' && (
                  <button className="wb-btn wb-btn-sm" disabled={busy} title="A real Monte-Carlo solve of this placement"
                          onClick={() => onSolve(p.pid)}>Real solve</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {res.false_feasible && res.false_feasible.n_infeasible > 0 && (
        <p className="wb-small">Against the library’s labels: {res.false_feasible.n_false_feasible} of {res.false_feasible.n_infeasible} truly-infeasible
          rows called feasible; MAE {res.error.mae_mpu.toFixed(2)} mpu.</p>
      )}
      <p className="wb-small">{res.acpf_solves_spent} AC solves · {res.cost_note}</p>
    </div>
  )
}

function Legend() {
  return (
    <div className="wb-legend he-legend">
      <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" className="he-l feasible" /></svg> feasible</span>
      <span><svg width="12" height="12"><rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" className="he-l inconclusive" /></svg> inconclusive</span>
      <span><svg width="12" height="12"><rect x="1" y="1" width="10" height="10" className="he-l infeasible" /></svg> infeasible</span>
    </div>
  )
}
