import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  editSession, getElement, getExamples, getHealth, openSession,
  resetSession, runSession, undoSession, uploadSession,
} from '../api.js'
import Boundary from '../components/Boundary.jsx'
import { composeAnswer, followUps } from '../chat/answer.js'
import Diagram from '../diagram/Diagram.jsx'
import { overlayFrom } from '../diagram/overlays.js'
import { RAMPS } from '../diagram/tokens.js'
import PythiaWorkbench from '../pythia/PythiaWorkbench.jsx'
import { api as pythiaApi } from '../pythia/api.js'
import '../workbench/workbench.css'

/*
  The workbench, in the layout of the "Workbench" design: an assistant on the
  left, the network in the middle, and an inspector on the right that edits
  whatever was clicked.

  Two things are deliberate and carried over from the previous version.

  **The edit log is the state.** Every change is a row the server replays over
  a fresh import, so undo is removing a row and reset is emptying the list.
  Reverting one change from the middle of the log is the same idea: reset,
  then replay every other row. Nothing here holds a mutated copy of the model.

  **An agent's question becomes a chat message.** The harnesses stop at
  ASK_USER with a list of things they will not assume; the answer goes back
  through the same run call rather than through a separate form.

  **EV charger screening is a second mode of the same frame.** Pythia does not
  open a network model: it screens feeders from its own library, or one traced
  from the road network around a map pin, through its own server. So it gets
  the same layout with its own contents (`pythia/PythiaWorkbench.jsx`), and the
  pieces below are handed to it rather than copied.
*/

/*
  What a study is called to the person asking for it. The agent id travels to
  the server -- it is how work is dispatched -- but it is not shown, because
  naming agents makes the user learn the architecture before asking for a
  fault level.
*/
const STUDIES = [
  { agent: 'ariadne', label: 'Voltages and losses',
    ask: 'solve the power flow and show me voltages and losses',
    about: 'Solves the network as it stands.' },
  { agent: 'argus', label: 'Fault levels',
    ask: 'what are the fault levels here',
    about: 'Short-circuit currents to IEC 60909.' },
  { agent: 'themis', label: 'Cheapest dispatch',
    ask: 'what is the cheapest way to meet this demand',
    about: 'Least cost to meet demand, ignoring the network.' },
  { agent: 'ananke', label: 'Network limits and prices',
    ask: 'which lines are congested and what are the nodal prices',
    about: 'The cheapest dispatch the network can actually carry.' },
  { agent: 'iris', label: 'Redraw the diagram',
    ask: 'draw this feeder',
    about: 'Lays the network out again from its topology.' },
]

// What can be painted, and which study produces it. An option whose study has
// not run is offered disabled, so the menu says what is possible.
const PAINTS = [
  { id: 'flow', label: 'Power flow', legend: 'Power flow' },
  { id: 'fault', label: 'Fault levels', legend: 'Fault levels' },
  { id: 'network', label: 'Network flows', legend: 'Network flows' },
  { id: 'dispatch', label: 'Dispatch', legend: 'Dispatch' },
]

/*
  A summary is written for a log, not for a person: "reached REPORT; 0
  error(s); 0 question(s); worst three-phase 2311.85 kA at 650". The clause
  after the counts is the answer, so that is what is kept.
*/
const NOISE = /^(reached|stopped at|solved on)\s|^\d+\s(error|question|warning)/i
const readSummary = (summary) => String(summary || '').split(';')
  .map((s) => s.trim()).filter((p) => p && !NOISE.test(p)).join('; ')

const studyLabel = (agent) => STUDIES.find((s) => s.agent === agent)?.label ?? 'Study'

// X1 is the cross-validation code: its presence means both engines ran.
const crossChecked = (r) => (r.findings ?? []).some((f) => f.code === 'X1')

const clock = (at) => new Date(at).toLocaleTimeString([],
  { hour: '2-digit', minute: '2-digit' })

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Findings name elements in the singular ("bus.675.v_pu"); the session's
// collections are plural ("buses").
const collectionOf = (kind) => (kind === 'bus' ? 'buses' : `${kind}s`)

export default function Workbench() {
  const [examples, setExamples] = useState([])
  const [health, setHealth] = useState(null)
  const [session, setSession] = useState(null)
  const [diagram, setDiagram] = useState(null)
  const [modelFindings, setModelFindings] = useState([])
  const [studyFindings, setStudyFindings] = useState([])
  const [edits, setEdits] = useState([])
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detailTick, setDetailTick] = useState(0)

  // Every overlay any study has produced, by id, and which one is painted.
  const [layers, setLayers] = useState({})
  const [paint, setPaint] = useState('none')
  // Which study painted each layer, and the edit log it was solved against.
  const [layerAgent, setLayerAgent] = useState({})
  const [solvedAgainst, setSolvedAgainst] = useState(null)

  const [reports, setReports] = useState([])
  const [tab, setTab] = useState('diagram')
  const [unread, setUnread] = useState(false)
  const [display, setDisplay] = useState({ names: true, values: true, loadings: true })
  const [startError, setStartError] = useState(null)
  // EV charger screening: which way the start screen opened it, or null for the
  // model workbench. The Pythia server's feeders are listed on the start screen.
  const [pythia, setPythia] = useState(null)
  const [pythiaFeeders, setPythiaFeeders] = useState(undefined)

  const filePick = useRef(null)
  const dirPick = useRef(null)

  const studies = health?.runnable
    ? STUDIES.filter((s) => health.runnable.includes(s.agent))
    : STUDIES

  useEffect(() => {
    getExamples().then((d) => setExamples(d.examples)).catch(() => {})
    getHealth().then(setHealth).catch(() => {})
  }, [])

  // null means the Pythia server did not answer, which the start screen says.
  useEffect(() => {
    if (session || pythia) return
    pythiaApi.feeders().then((d) => setPythiaFeeders(d.feeders || []), () => setPythiaFeeders(null))
  }, [session, pythia])

  const absorb = useCallback((state) => {
    if (state.session) setSession(state.session)
    if (state.diagram) setDiagram(state.diagram)
    if (state.findings) setModelFindings(state.findings)
    if (state.edits) setEdits(state.edits)
    setDetailTick((t) => t + 1)
    return state
  }, [])

  const say = (role, text, extra = {}) =>
    setMessages((m) => [...m, { role, text, ...extra, at: Date.now() }])

  function clearResults() {
    setLayers({}); setLayerAgent({}); setPaint('none'); setSolvedAgainst(null)
    setStudyFindings([]); setReports([]); setTab('diagram'); setUnread(false)
    setSelected(null)
  }

  async function start(example) {
    setBusy(true); setStartError(null)
    setMessages([]); clearResults()
    try {
      const state = absorb(await openSession(example))
      const name = examples.find((e) => e.id === example)?.name ?? state.session?.circuit
      say('system', `Opened ${name}. Click anything in the diagram to change it, `
        + 'then ask for a study. Results appear here and in full on the Report tab.')
    } catch (e) { setStartError(e.message) } finally { setBusy(false) }
  }

  /*
    Open the user's own model. A feeder that redirects at a file the user did
    not include imports as a fragment or not at all, and the server's message
    names the exact file -- so it is repeated verbatim.
  */
  async function upload(items) {
    const list = items ?? []
    if (!list.length) return
    setBusy(true); setStartError(null)
    try {
      const state = await uploadSession(list)
      setMessages([]); clearResults()
      absorb(state)
      say('system', `Opened ${state.opened} from ${list.length === 1
        ? 'your file' : `your ${list.length} files`}. It is yours to change — `
        + 'click anything in the diagram, then ask for a study.')
    } catch (e) {
      if (session) say('error', `That model could not be opened.\n\n${e.message}`)
      else setStartError(e.message)
    } finally { setBusy(false) }
  }

  async function applyEdit(edit) {
    const state = absorb(await editSession(session.id, [edit]))
    // The server refuses an invalid edit and stays on its last good model.
    if (!state.ok) say('error', `That edit was refused: ${state.error}`)
    return state
  }

  /*
    Take one or more rows out of the middle of the log.

    There is no endpoint for that, and none is needed: the log is the state,
    so reset and replay everything else. If the remainder no longer validates
    -- a later edit depended on the one removed -- the server says so and the
    model is left as imported, which the message reports.
  */
  async function replaceEdits(keep) {
    setBusy(true)
    try {
      let state = await resetSession(session.id)
      if (keep.length) state = await editSession(session.id, keep)
      absorb(state)
      if (!state.ok) {
        say('error', `The remaining changes no longer apply together: ${state.error}`)
      }
    } catch (e) { say('error', e.message) } finally { setBusy(false) }
  }

  const sameField = (a, b) => a.element === b.element && a.name === b.name && a.field === b.field
  const revertEdit = (index) => replaceEdits(edits.filter((_, i) => i !== index))
  const revertField = (edit) => replaceEdits(edits.filter((e) => !sameField(e, edit)))
  const revertElement = (collection, name) =>
    replaceEdits(edits.filter((e) => !(e.element === collection && String(e.name) === String(name))))

  async function ask(text, agent = '', answers = null, opts = {}) {
    if (!session) return
    setBusy(true)
    if (text) say('user', text)
    try {
      const reply = await runSession(session.id, {
        prompt: text || '', agent, answers: answers || {},
        cross_validate: Boolean(opts.crossValidate),
      })

      if (reply.needs_agent) {
        say('assistant', 'I could not tell which study you meant. Pick one, or '
          + 'say it another way.', { offerStudies: true })
        return
      }

      // One request can need two studies; each gets its own message, in the
      // order the router named them.
      const ran = reply.results
        ?? (reply.result ? [{ agent: reply.result.agent, result: reply.result }] : [])
      if (!ran.length) { say('assistant', 'Nothing came back from that.'); return }

      const nextLayers = {}
      const nextAgents = {}
      const docs = []
      const found = []
      let firstPaint = null

      for (const study of ran) {
        const r = study.result
        const layer = overlayFrom(r.agent, r.data, r.findings ?? [])
        if (layer) {
          nextLayers[layer.id] = layer
          nextAgents[layer.id] = r.agent
          firstPaint ??= layer.id
        }
        for (const f of r.findings ?? []) {
          if (f.severity === 'error' || f.severity === 'warning') found.push(f)
        }

        const answer = composeAnswer(r.agent, r)
        const doc = r.report_markdown
          ? { markdown: r.report_markdown, label: studyLabel(r.agent) } : null
        if (doc) docs.push(doc)

        say('assistant', answer ? '' : (readSummary(r.summary)
          || (r.ok ? 'Done — the full report is on the Report tab.' : '')), {
          result: r,
          agent: r.agent,
          label: ran.length > 1 || opts.label ? (opts.label ?? studyLabel(r.agent)) : null,
          answer,
          follow: answer ? followUps(r.agent, r) : [],
          report: doc,
          questions: r.questions?.length ? r.questions : null,
        })
      }

      if (firstPaint) {
        setLayers((l) => ({ ...l, ...nextLayers }))
        setLayerAgent((a) => ({ ...a, ...nextAgents }))
        setPaint(firstPaint)
        setSolvedAgainst(JSON.stringify(edits))
      }
      if (found.length || firstPaint) setStudyFindings(found)
      if (docs.length) { setReports(docs); setUnread(tab !== 'report') }
      if (ran.some((s) => s.result?.data?.handoff === 'pythia')) {
        say('assistant', 'EV charger siting runs on its own feeders — from its library, or traced '
          + 'from a map pin — not on the model open here.', {
          node: (
            <div className="wb-row">
              <button className="wb-btn wb-btn-dark wb-btn-sm" onClick={() => setPythia({ kind: 'build' })}>
                Open EV charger screening</button>
            </div>
          ),
        })
      }
    } catch (e) { say('error', e.message) } finally { setBusy(false) }
  }

  const askFollowUp = (f) => { say('user', f.label); say('assistant', '', { table: f }) }

  const openReport = () => { setTab('report'); setUnread(false) }

  /*
    Select whatever a finding names. The finding says "line.632670.normal_amps"
    and the diagram knows edges, buses and shunts by name, so the kind picks
    which list to look in and the rest is matched by name -- longest first,
    because a name may itself contain a dot.
  */
  function showOnDiagram(element) {
    const text = String(element || '')
    const dot = text.indexOf('.')
    if (dot < 0 || !diagram) return
    const kind = text.slice(0, dot), rest = text.slice(dot + 1)
    const matches = (name) => rest === String(name) || rest.startsWith(`${name}.`)
    if (kind === 'bus') {
      const node = diagram.nodes.find((n) => matches(n.name))
      if (node) setSelected({ kind: 'bus', name: node.name, node })
    } else {
      const edge = diagram.edges.find((e) => matches(e.name))
      if (edge) { setSelected({ kind: 'edge', name: edge.name, edge }); setTab('diagram'); return }
      const shunt = diagram.shunts.find((s) => matches(s.name))
      if (shunt) setSelected({ kind: 'shunt', name: shunt.name, shunt })
    }
    setTab('diagram')
  }

  const pickFiles = (e) => (e?.shiftKey ? dirPick : filePick).current?.click()

  const pickers = (
    <>
      <input ref={filePick} type="file" hidden multiple
             accept=".dss,.DSS,.m,.raw,.RAW,.csv"
             onChange={(e) => { upload(fromInput(e.target.files)); e.target.value = '' }} />
      <input ref={dirPick} type="file" hidden multiple webkitdirectory=""
             onChange={(e) => { upload(fromInput(e.target.files)); e.target.value = '' }} />
    </>
  )

  if (pythia) {
    return (
      <PythiaWorkbench key={JSON.stringify(pythia)} entry={pythia} shared={SHARED}
                       onExit={() => setPythia(null)}
                       onOpenModel={() => { setPythia(null); setSession(null) }} />
    )
  }

  if (!session) {
    return (
      <div className="wb">
        {pickers}
        <StartScreen examples={examples} busy={busy} error={startError}
                     onDismiss={() => setStartError(null)} onStart={start}
                     onFiles={upload} onPickFiles={() => filePick.current?.click()}
                     onPickFolder={() => dirPick.current?.click()}
                     pythiaFeeders={pythiaFeeders} onPythia={setPythia} />
      </div>
    )
  }

  const example = examples.find((e) => e.id === session.origin)
  const title = example?.name ?? session.circuit ?? session.origin
  const ext = (example?.filename ?? session.origin ?? '').match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ''
  const overlay = paint !== 'none' ? layers[paint] ?? null : null
  const stale = solvedAgainst !== null && solvedAgainst !== JSON.stringify(edits)

  return (
    <div className="wb wb-app">
      {pickers}
      <TopBar title={title} ext={ext} edits={edits.length} busy={busy}
              onUndo={async () => absorb(await undoSession(session.id))}
              onReset={async () => absorb(await resetSession(session.id))}
              onFiles={() => filePick.current?.click()}
              onFolder={() => dirPick.current?.click()}
              onExamples={() => { setSession(null); setMessages([]); clearResults() }}
              onPythia={() => setPythia({ kind: 'build' })} />

      <div className="wb-cols">
        <Assistant messages={messages} busy={busy} studies={studies}
                   online={Boolean(health?.router?.reachable)}
                   onAsk={ask} onFollowUp={askFollowUp} onOpenReport={openReport}
                   onAttach={pickFiles} />

        <section className="wb-stage">
          <div className="wb-panehead wb-stagehead">
            <div role="tablist" className="wb-tabs">
              <button role="tab" aria-selected={tab === 'diagram'}
                      className={tab === 'diagram' ? 'on' : ''}
                      onClick={() => setTab('diagram')}>Diagram</button>
              <button role="tab" aria-selected={tab === 'report'}
                      className={tab === 'report' ? 'on' : ''} onClick={openReport}>
                Report{unread && <span className="wb-dot" aria-label="new" />}
              </button>
            </div>
            {tab === 'diagram' && (
              <label className="wb-paint">
                <span>Paint</span>
                <select value={paint} onChange={(e) => setPaint(e.target.value)}
                        title="Which study result to draw on the network">
                  <option value="none">Nothing</option>
                  {PAINTS.map((p) => (
                    <option key={p.id} value={p.id} disabled={!layers[p.id]}>
                      {layers[p.id] ? p.label : `${p.label} — run it first`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Both stay mounted, so switching tabs keeps the pan, the zoom and
              every bus the user dragged. */}
          <div className="wb-canvas" hidden={tab !== 'diagram'}>
            <div className="wb-grid" />
            {stale && overlay && (
              <div className="wb-stale">
                <span>The model changed since this was solved.</span>
                <button className="wb-btn-dark wb-pill" disabled={busy}
                        onClick={() => ask('', layerAgent[paint], null,
                          { label: studyLabel(layerAgent[paint]) })}>Solve again</button>
              </div>
            )}
            <Boundary label="The diagram">
              <Diagram diagram={diagram} overlay={overlay} selected={selected}
                       onSelect={setSelected}
                       showNames={display.names} showValues={display.values}
                       showLoadings={display.loadings} />
            </Boundary>
            <LegendCard overlay={overlay} />
          </div>
          <div className="wb-report-pane" hidden={tab !== 'report'}>
            <Boundary label="The report">
              <ReportView docs={reports} title={title} />
            </Boundary>
          </div>
        </section>

        <aside className="wb-side">
          <Boundary label="The inspector">
            <Inspector session={session} selected={selected} edits={edits}
                       overlay={overlay} tick={detailTick} busy={busy}
                       onEdit={applyEdit} onRevertField={revertField} />
          </Boundary>
          <NeedsAttention findings={[...studyFindings, ...modelFindings]} edits={edits}
                          onShow={showOnDiagram} onRevert={revertElement} />
          <div className="wb-block">
            <span className="wb-h">Display</span>
            {[['names', 'Bus names'], ['values', 'Values on buses'],
              ['loadings', 'Loading on busy lines']].map(([key, label]) => (
              <Toggle key={key} label={label} on={display[key]}
                      onClick={() => setDisplay((d) => ({ ...d, [key]: !d[key] }))} />
            ))}
          </div>
          <YourChanges edits={edits} busy={busy} onRevert={revertEdit} />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* top bar                                                             */

function TopBar({ title, ext, edits, busy, onUndo, onReset, onFiles, onFolder, onExamples,
                  onPythia, badge, editing = true, menu: items }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setMenu(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  return (
    <header className="wb-top">
      <Link to="/" className="wb-brand">
        <img src="/assets/sukrim-icon.svg" alt="SUKRIM" />
        <span>Workbench</span>
      </Link>
      <span className="wb-sep" />
      <div className="wb-title">
        <span className="wb-title-name">{title}</span>
        {ext && <span className="wb-mono wb-title-ext">{ext}</span>}
        <span className={`wb-badge wb-mono${edits ? ' on' : ''}`}>
          {badge ?? (edits ? `${plural(edits, 'unsaved change')}` : 'unchanged')}
        </span>
      </div>
      <div className="wb-top-actions" ref={ref}>
        {editing && (
          <>
            <button className="wb-btn" disabled={!edits || busy} onClick={onUndo}
                    title="Undo the last change">Undo</button>
            <button className="wb-btn" disabled={!edits || busy} onClick={onReset}
                    title="Put the model back as imported">Reset</button>
          </>
        )}
        <button className="wb-btn wb-btn-dark" disabled={busy} aria-expanded={menu}
                onClick={() => setMenu(!menu)}
                title={items ? 'Open something else' : 'Open another model — a file or a folder'}>
          {items ? 'Open…' : 'Open model'}</button>
        {menu && items && (
          <div className="wb-menu">
            {items.map((it) => (
              <button key={it.label} onClick={() => { setMenu(false); it.run() }}>
                <b>{it.label}</b><span>{it.about}</span>
              </button>
            ))}
          </div>
        )}
        {menu && !items && (
          <div className="wb-menu">
            <button onClick={() => { setMenu(false); onFiles() }}>
              <b>Files…</b><span>A MATPOWER .m, PSS/E .raw, or single .dss</span>
            </button>
            <button onClick={() => { setMenu(false); onFolder() }}>
              <b>A folder…</b><span>An OpenDSS feeder, with the files it redirects to</span>
            </button>
            <button onClick={() => { setMenu(false); onExamples() }}>
              <b>An example</b><span>Back to the list of test networks</span>
            </button>
            {onPythia && (
              <button onClick={() => { setMenu(false); onPythia() }}>
                <b>EV charger screening</b><span>Pythia’s feeders: its library, or one traced from a map pin</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* start screen                                                        */

function StartScreen({ examples, busy, error, onDismiss, onStart, onFiles,
                       onPickFiles, onPickFolder, pythiaFeeders, onPythia }) {
  const [over, setOver] = useState(false)
  return (
    <div className="wb-start">
      <header className="wb-top">
        <Link to="/" className="wb-brand">
          <img src="/assets/sukrim-icon.svg" alt="SUKRIM" />
          <span>Workbench</span>
        </Link>
      </header>
      <div className="wb-start-body">
        <span className="wb-eyebrow">Workbench</span>
        <h1>Pick something to work on.</h1>
        <p className="wb-lede">You can change any element and run a study on what you changed it to.</p>

        <div className={`wb-drop${over ? ' over' : ''}`}
             onDragOver={(e) => { e.preventDefault(); setOver(true) }}
             onDragLeave={() => setOver(false)}
             onDrop={async (e) => {
               e.preventDefault(); setOver(false)
               if (!busy) onFiles(await filesFromDrop(e.dataTransfer))
             }}>
          <p><b>Bring your own model.</b> Drop it here, or choose below.</p>
          <div className="wb-row">
            <button className="wb-btn wb-btn-dark" disabled={busy} onClick={onPickFiles}>Choose files</button>
            <button className="wb-btn" disabled={busy} onClick={onPickFolder}>Choose a folder</button>
          </div>
          <p className="wb-small">
            OpenDSS <code>.dss</code>, MATPOWER <code>.m</code>, PSS/E <code>.raw</code>.
            An OpenDSS feeder redirects at its neighbours, so give it the whole
            folder — the master alone will not import.
          </p>
          {error && (
            <div className="wb-drop-error">
              <button onClick={onDismiss} aria-label="Dismiss">×</button>
              <b>That model could not be opened.</b>
              <pre>{error}</pre>
            </div>
          )}
        </div>

        <span className="wb-eyebrow">Or start from one of these</span>
        <div className="wb-examples">
          {examples.map((ex) => (
            <button key={ex.id} disabled={!ex.available || busy} onClick={() => onStart(ex.id)}>
              <span className="wb-ex-name">{ex.name}</span>
              <span className="wb-mono wb-ex-fmt">{ex.format}</span>
              <span className="wb-ex-about">{ex.about}</span>
            </button>
          ))}
        </div>

        {/* EV charger screening (Pythia) works on its own feeders, not on a model,
            so it is its own way in: a traced feeder, a new one, or the library. */}
        <span className="wb-eyebrow">Or screen EV charger sites</span>
        {pythiaFeeders === null && (
          <p className="wb-small">The Pythia server is not answering — start it with
            <code> .venv/Pythia/bin/python -m backend.Pythia.routes</code> (port 8001).</p>
        )}
        <div className="wb-examples">
          <button disabled={busy} onClick={() => onPythia({ kind: 'build' })}>
            <span className="wb-ex-name">A feeder from a map pin</span>
            <span className="wb-mono wb-ex-fmt">OpenStreetMap</span>
            <span className="wb-ex-about">Trace the road network around a point into a radial feeder, then screen EV charger placements on it.</span>
          </button>
          <button disabled={busy} onClick={() => onPythia({ kind: 'library' })}>
            <span className="wb-ex-name">A library feeder</span>
            <span className="wb-mono wb-ex-fmt">leave-one-out</span>
            <span className="wb-ex-about">Where the truth is already known: screen a solved test network and score it against its own labels.</span>
          </button>
          {(pythiaFeeders || []).map((f) => (
            <button key={f.feeder_id} disabled={busy} onClick={() => onPythia({ kind: 'feeder', fid: f.feeder_id })}>
              <span className="wb-ex-name">{f.label}</span>
              <span className="wb-mono wb-ex-fmt">{f.n_bus} buses · {f.n_placements} placements</span>
              <span className="wb-ex-about">Already built on this server — opening it costs nothing.</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* assistant                                                           */

function Assistant({ messages, busy, studies, online, onAsk, onFollowUp, onOpenReport, onAttach,
                    attachLabel = 'Attach model', placeholder = 'Ask about this network…' }) {
  const [draft, setDraft] = useState('')
  const [studiesOpen, setStudiesOpen] = useState(false)
  const feed = useRef(null)

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = () => {
    const v = draft.trim()
    if (v && !busy) { setDraft(''); onAsk(v) }
  }

  return (
    <section className="wb-assist">
      <div className="wb-panehead">
        <span className="wb-h">Assistant</span>
        <span className="wb-status" title={online ? 'The language model is reachable'
          : 'No language model is running. Pick a study from Studies instead of typing.'}>
          <span className={`wb-status-dot${online ? ' on' : ''}`} />
          {online ? 'Connected' : 'Studies only'}
        </span>
      </div>

      <div className="wb-feed" ref={feed}>
        {messages.map((m, i) => (
          <Message key={i} m={m} studies={studies} onAsk={onAsk}
                   onFollowUp={onFollowUp} onOpenReport={onOpenReport} />
        ))}
        {busy && (
          <div className="wb-working" aria-live="polite">
            <img src="/assets/sukrim-icon.svg" alt="" />
            <span>Working</span>
            <span className="wb-dots"><i /><i /><i /></span>
          </div>
        )}
      </div>

      <div className="wb-composer">
        {studiesOpen && (
          <div className="wb-studies">
            <span className="wb-kicker">Run a study</span>
            {studies.map((s) => (
              <button key={s.agent} disabled={busy}
                      onClick={() => { setStudiesOpen(false); onAsk(s.ask, s.agent) }}>
                <b>{s.label}</b><span>{s.about}</span>
              </button>
            ))}
          </div>
        )}
        <div className="wb-compose-box">
          <textarea rows={2} value={draft}
                    placeholder={online ? placeholder
                      : 'No language model running — choose from Studies'}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                    }} />
          <div className="wb-compose-row">
            <button className={`wb-chipbtn${studiesOpen ? ' on' : ''}`}
                    aria-expanded={studiesOpen}
                    onClick={() => setStudiesOpen(!studiesOpen)}>
              Studies <span className="wb-mono">{studiesOpen ? '▾' : '▴'}</span>
            </button>
            <button className="wb-chipbtn" disabled={busy} onClick={onAttach}
                    title="Open another model — a file, or Shift-click for a folder">
              {attachLabel}
            </button>
            <button className="wb-send" disabled={busy || !draft.trim()} onClick={send}
                    aria-label="Send">Send</button>
          </div>
        </div>
        <span className="wb-hint">Enter to send · Shift+Enter for a new line</span>
      </div>
    </section>
  )
}

const md = (text) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>

function Message({ m, studies, onAsk, onFollowUp, onOpenReport }) {
  if (m.role === 'system') {
    return (
      <div className="wb-msg-system">
        <span className="wb-kicker">Session · {clock(m.at)}</span>
        <div className="wb-md">{md(m.text)}</div>
      </div>
    )
  }
  if (m.role === 'user') {
    return (
      <div className="wb-msg-user">
        <span className="wb-meta">You · {clock(m.at)}</span>
        <div className="wb-bubble">{m.text}</div>
      </div>
    )
  }

  const r = m.result
  return (
    <div className="wb-msg-assistant">
      <div className="wb-msg-head">
        <img src="/assets/sukrim-icon.svg" alt="" />
        <b>SUKRIM</b>
        <span className="wb-meta">· {clock(m.at)}</span>
        {m.role === 'error' && <span className="wb-tag wb-tag-dark">Something went wrong</span>}
        {m.label && <span className="wb-tag">{m.label}</span>}
      </div>

      {m.answer?.caveat && <div className="wb-caveat-box wb-md">{md(m.answer.caveat)}</div>}
      {m.answer?.lead && <div className="wb-md wb-lead">{md(m.answer.lead)}</div>}
      {m.text && <div className="wb-md wb-lead">{md(m.text)}</div>}

      {m.answer?.figures?.length > 0 && (
        <dl className="wb-figures">
          {m.answer.figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd><b>{f.value}</b>{f.note && <> {f.note}</>}</dd>
            </div>
          ))}
        </dl>
      )}

      {m.table && <FollowTable t={m.table} />}

      {m.node}

      {r && !r.ok && !m.answer && (
        <p className="wb-small"><b>The study stopped before it could answer.</b> It will
          not return a number it cannot stand behind, so nothing was guessed.</p>
      )}

      {r && <Flags findings={r.findings ?? []} />}

      {!r && m.report && (
        <div className="wb-row">
          <button className="wb-btn wb-btn-dark wb-btn-sm" onClick={onOpenReport}>Open report</button>
        </div>
      )}

      {r && (m.report || (r.agent === 'ariadne' && !crossChecked(r))) && (
        <div className="wb-row">
          {m.report && (
            <button className="wb-btn wb-btn-dark wb-btn-sm" onClick={onOpenReport}>Open report</button>
          )}
          {r.agent === 'ariadne' && !crossChecked(r) && (
            <button className="wb-btn wb-btn-sm"
                    title="Solve it again in the other engine, and compare"
                    onClick={() => onAsk('', 'ariadne', {}, { crossValidate: true, label: 'Compare engines' })}>
              Compare engines
            </button>
          )}
        </div>
      )}

      {m.questions && <Questions questions={m.questions} agent={m.agent} onAnswer={onAsk} />}

      {m.follow?.length > 0 && (
        <div className="wb-follow">
          <span className="wb-meta">Follow up</span>
          {m.follow.map((f) => (
            <button key={f.key} onClick={() => onFollowUp(f)}>
              <span>{f.label}</span><span className="wb-mono">→</span>
            </button>
          ))}
        </div>
      )}

      {m.offerStudies && (
        <div className="wb-follow">
          {studies.map((s) => (
            <button key={s.agent} title={s.about} onClick={() => onAsk(s.ask, s.agent)}>
              <span>{s.label}</span><span className="wb-mono">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A result's errors and warnings, collapsed to a count until asked for. */
function Flags({ findings }) {
  const [open, setOpen] = useState(false)
  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity === 'warning')
  const notable = [...errors, ...warnings]
  if (!notable.length) return null
  const parts = [errors.length && plural(errors.length, 'error'),
    warnings.length && plural(warnings.length, 'warning')].filter(Boolean)
  return (
    <div className="wb-flags">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="wb-flag-dot" />
        <span><b>{parts.join(', ')}</b> — {open ? 'hide' : 'show details'}</span>
      </button>
      {open && (
        <ul>
          {notable.map((f, i) => (
            <li key={i}><span className="wb-mono">{f.code}</span><span>{f.message}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A follow-up answered from the result already in hand — nothing re-ran. */
function FollowTable({ t }) {
  return (
    <div className="wb-followtable">
      {t.caveat && <div className="wb-caveat-box"><p>{t.caveat}</p></div>}
      <p className="wb-lead">{t.lead}</p>
      <div className="wb-table-scroll">
        <table>
          <thead><tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/*
  An agent's ASK_USER questions, as the design's "One value needed" card.

  The answer goes back to the study that asked it, and a bad value is caught
  before it is sent: a round trip that says `'5 $/MWh' is not a number` is a
  slow way to learn that the unit goes beside the box.
*/
function Questions({ questions, agent, onAnswer }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(null)

  const check = (q, raw) => {
    const text = String(raw ?? '').trim()
    if (!text) return 'needs a value'
    if (q.expects === 'number') {
      // Strict on purpose: accepting "5 kV" would mean guessing which unit.
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
        return q.unit ? `Just the number — ${q.unit} is assumed.` : 'Must be a number.'
      }
      const value = Number(text)
      if (!Number.isFinite(value)) return 'Must be a number.'
      if (q.minimum != null && value < q.minimum) return `Must be at least ${q.minimum}.`
      return null
    }
    if (q.expects === 'mapping') {
      try {
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return 'Must be an object, like {"bus1": [0, 0]}.'
        }
        return null
      } catch { return 'Must be valid JSON, like {"bus1": [0, 0]}.' }
    }
    return null   // names: a comma-separated list, checked by the agent
  }

  const submit = () => {
    const found = {}
    for (const q of questions) {
      const problem = check(q, values[q.key])
      if (problem) found[q.key] = problem
    }
    setErrors(found)
    if (Object.keys(found).length) return
    const answers = {}
    for (const q of questions) {
      const text = String(values[q.key]).trim()
      answers[q.key] = q.expects === 'number' ? Number(text) : text
    }
    setSent(answers)
    onAnswer('', agent || '', answers)
  }

  return (
    <div className="wb-question">
      <div>
        <b>{questions.length === 1 ? 'One value needed' : `${questions.length} values needed`}</b>
        <span>It stopped rather than assume {questions.length === 1 ? 'this' : 'these'}. Nothing was assumed.</span>
      </div>
      {sent ? (
        <span>Answered: {questions.map((q) => (
          <b key={q.key} className="wb-mono">{q.key} = {String(sent[q.key])}{q.unit ? ` ${q.unit}` : ''} </b>
        ))}</span>
      ) : (
        <>
          {questions.map((q) => (
            <div key={q.key} className="wb-q">
              <label className="wb-mono" htmlFor={`q-${q.key}`}>{q.key}</label>
              {q.why && <span className="wb-small">{q.why}</span>}
              <div className={`wb-field${errors[q.key] ? ' bad' : ''}`}>
                <input id={`q-${q.key}`}
                       inputMode={q.expects === 'number' ? 'decimal' : 'text'}
                       placeholder={q.expects === 'mapping' ? '{"bus1": [0, 0]}'
                         : q.expects === 'names' ? 'name, name, name' : 'a number'}
                       value={values[q.key] ?? ''}
                       onChange={(e) => {
                         const next = e.target.value
                         setValues((v) => ({ ...v, [q.key]: next }))
                         setErrors((v) => ({ ...v, [q.key]: null }))
                       }}
                       onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
                {q.unit && <span className="wb-unit">{q.unit}</span>}
              </div>
              {q.options?.length > 0 && (
                <div className="wb-row">
                  {q.options.map((o) => (
                    <button key={o} className="wb-chipbtn" type="button"
                            onClick={() => setValues((v) => ({
                              ...v, [q.key]: v[q.key] ? `${v[q.key]}, ${o}` : o }))}>{o}</button>
                  ))}
                </div>
              )}
              <span className="wb-small">{errors[q.key] || q.typical || ''}</span>
            </div>
          ))}
          <button className="wb-btn wb-btn-dark" onClick={submit}>Answer and run</button>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* stage                                                               */

function LegendCard({ overlay }) {
  const [open, setOpen] = useState(true)
  const title = overlay ? (PAINTS.find((p) => p.id === overlay.id)?.legend ?? overlay.id) : 'Plain'
  return (
    <div className="wb-legend">
      <button className="wb-legend-head" onClick={() => setOpen(!open)}>
        <span>Legend · {title}</span><span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {!overlay && <span>Run a study to paint results onto the network.</span>}
          {overlay?.id === 'flow' && (
            <div className="wb-legend-rows">
              <span><i className="wb-sw" style={{ background: '#C6EBC5' }} />Inside the study’s voltage limits</span>
              <span><i className="wb-sw" style={{ background: '#111111' }} />Outside limits</span>
              <span><i className="wb-sw" />Not studied</span>
            </div>
          )}
          {overlay?.busRamp && overlay.id !== 'flow' && <Scale kind={overlay.busRamp} />}
          {overlay && overlay.id !== 'dispatch' && (
            <div className="wb-legend-rows">
              {(overlay.id === 'network') && (
                <span><i className="wb-sw-line" style={{ height: 5 }} />Heavier line = higher loading</span>
              )}
              {overlay.binding?.length > 0 && (
                <span><i className="wb-sw-line" style={{ height: 6 }} />At its limit (binding)</span>
              )}
              {overlay.path && (
                <span><i className="wb-sw-line" style={{ height: 3 }} />Source-to-fault path</span>
              )}
              <span><i className="wb-sw-dash" />No rating — never weighted by loading</span>
            </div>
          )}
          {overlay?.id === 'dispatch' && (
            <span>Machines are filled by how much of the peak they are producing.</span>
          )}
          <span className="wb-legend-foot">Click any bus, line or load to edit it.</span>
        </>
      )}
    </div>
  )
}

/*
  A ramp strip. The fault ramp is logarithmic -- IEEE 13 runs 2.3 kA to
  2,311 kA -- and a reader who assumes linear misjudges by a factor of a
  hundred, so the strip says so.
*/
function Scale({ kind }) {
  const ramp = RAMPS[kind]
  if (!ramp) return null
  const stops = ramp.light
  return (
    <div className="wb-scale">
      <div className="wb-scale-strip">
        {stops.map((hex, i) => <i key={i} style={{ background: hex }} />)}
      </div>
      <div className="wb-scale-ticks wb-mono">
        {ramp.labels.slice(0, stops.length).map((t, i) => <span key={i}>{t}</span>)}
      </div>
      <span className="wb-mono wb-small">{ramp.unit}{ramp.log && ' · log scale'}</span>
    </div>
  )
}

const REPORT_COMPONENTS = {
  table: ({ node, ...props }) => <div className="wb-table-scroll"><table {...props} /></div>,
}

function ReportView({ docs, title }) {
  const [open, setOpen] = useState(0)
  const list = docs ?? []
  const index = Math.min(open, list.length - 1)
  const shown = list[index]

  if (!list.length) {
    return (
      <article className="wb-report">
        <span className="wb-kicker">Report</span>
        <h1>No report yet.</h1>
        <p>Ask for a study and the full document appears here.</p>
      </article>
    )
  }

  return (
    <article className="wb-report" key={index}>
      <span className="wb-kicker">Report · {shown.label}</span>
      <h1>{title}</h1>
      {/* One request can produce two studies; two reports in one scroll is a
          document that contradicts its own heading. */}
      {list.length > 1 && (
        <div className="wb-row">
          {list.map((d, i) => (
            <button key={d.label ?? i} className={`wb-chipbtn${i === index ? ' on' : ''}`}
                    onClick={() => setOpen(i)}>{d.label ?? `Report ${i + 1}`}</button>
          ))}
        </div>
      )}
      {shown.node}
      {shown.markdown && (
        <div className="wb-md wb-report-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={REPORT_COMPONENTS}>
            {shown.markdown}
          </ReactMarkdown>
        </div>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* inspector                                                           */

// Readable names for the fields people edit most. Anything not listed falls
// back to its own key with underscores spaced out; the key is always the title.
const FIELD_LABEL = {
  kw: 'Real power', kvar: 'Reactive power', kv: 'Rated voltage', kva: 'Rating',
  connection: 'Connection', model: 'Load model', length: 'Length', linecode: 'Line code',
  normal_amps: 'Normal rating', emergency_amps: 'Emergency rating', in_service: 'In service',
  closed: 'Closed', base_kv: 'Base voltage', bus: 'Bus', bus1: 'From bus', bus2: 'To bus',
  pf: 'Power factor', kvar_rated: 'Rating', on: 'Switched on',
}
const labelFor = (f) => FIELD_LABEL[f.field.split('.').pop()]
  ?? String(f.label ?? f.field).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const KIND_LABEL = {
  buses: 'Bus', lines: 'Line', transformers: 'Transformer', loads: 'Load',
  capacitors: 'Capacitor', generators: 'Generator', pvsystems: 'PV system',
  regulators: 'Voltage regulator',
}

function collectionFor(selected) {
  if (!selected) return null
  if (selected.kind === 'bus') return 'buses'
  if (selected.kind === 'shunt') return `${selected.shunt.kind}s`
  if (selected.kind === 'edge') {
    const k = selected.edge.kind
    return k === 'transformer' || k === 'regulator' ? 'transformers' : 'lines'
  }
  return null
}

function Inspector({ session, selected, edits, overlay, tick, busy, onEdit, onRevertField }) {
  const [detail, setDetail] = useState(null)
  const [pending, setPending] = useState(null)
  const collection = collectionFor(selected)

  useEffect(() => {
    setPending(null)
    if (!selected || !collection) { setDetail(null); return undefined }
    let live = true
    getElement(session.id, collection, selected.name)
      .then((d) => { if (live) setDetail(d) })
      .catch(() => { if (live) setDetail({ error: 'This element is not editable here.' }) })
    return () => { live = false }
    // `tick` refetches after every change to the model, so the panel always
    // shows what the server rebuilt rather than what was typed.
  }, [selected, collection, session.id, tick])

  // What the last study says about this element.
  const result = useMemo(() => {
    if (!selected || !overlay) return null
    const bus = selected.kind === 'bus' ? selected.name
      : selected.kind === 'shunt' ? selected.shunt.bus : null
    if (bus && overlay.bus?.[bus] !== undefined) {
      const v = overlay.bus[bus]
      if (overlay.id === 'flow') {
        return { label: selected.kind === 'bus' ? 'Voltage' : 'Voltage at its bus',
          value: `${v.toFixed(3)} pu`,
          status: overlay.outside?.includes(bus) ? 'outside limits' : 'ok' }
      }
      if (overlay.id === 'fault') return { label: 'Three-phase fault', value: `${v.toFixed(1)} kA` }
      if (overlay.id === 'network') return { label: 'Nodal price', value: v.toFixed(2) }
    }
    if (selected.kind === 'edge' && overlay.branch?.[selected.name] !== undefined) {
      const pct = overlay.branch[selected.name]
      return { label: 'Loading', value: `${pct.toFixed(0)} %`,
        status: overlay.binding?.includes(selected.name) ? 'binding' : null }
    }
    return null
  }, [selected, overlay])

  if (!selected) {
    return (
      <div className="wb-block">
        <span className="wb-kicker">Inspector</span>
        <span className="wb-ins-name">Nothing selected</span>
        <p className="wb-small">Click a bus, a line, or anything hanging off a bus to change it.</p>
      </div>
    )
  }

  const kind = KIND_LABEL[collection] ?? collection
  const head = (
    <div className="wb-ins-head">
      <div>
        <span className="wb-kicker">{selected.kind === 'edge' && selected.edge.kind === 'switch' ? 'Switch' : kind}</span>
        <span className="wb-ins-name">{selected.name}</span>
      </div>
      {result?.status && (
        <span className={`wb-badge wb-mono${result.status === 'ok' ? ' on' : ' dark'}`}>{result.status}</span>
      )}
    </div>
  )

  if (!detail) return <div className="wb-block">{head}<p className="wb-small">Loading…</p></div>
  if (detail.error) return <div className="wb-block">{head}<p className="wb-small">{detail.error}</p></div>

  /*
    Grouped by the nested value's own name -- `impedance`, `windings 1` -- so
    the sections match the structure of the model rather than an invented order.
  */
  const groups = []
  for (const f of detail.fields.filter((x) => x.editable)) {
    const key = f.group ?? ''
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.fields.push(f)
    else groups.push({ key, fields: [f] })
  }

  const send = (field, value, unit) => onEdit({
    op: 'set', element: detail.collection, name: detail.name, field, value, unit,
  })
  const myEdit = (field) => edits.find((e) => e.element === detail.collection
    && String(e.name) === String(detail.name) && e.field === field)
  const toggles = []

  return (
    <div className="wb-block">
      {head}
      {result && (
        <div className="wb-result">
          <span>{result.label}</span><b className="wb-mono">{result.value}</b>
        </div>
      )}
      {detail.shared && (
        <p className="wb-shared">This is a shared definition — changing it changes every element that points at it.</p>
      )}
      {selected.kind === 'edge' && selected.edge.rating_a === null && selected.edge.mva === null
        && selected.edge.kind !== 'transformer' && (
        <p className="wb-shared">This line states no rating, so it is drawn dashed and never
          weighted by loading. Unrated is not the same as lightly loaded.</p>
      )}

      <div className="wb-fields">
        {groups.map((group) => {
          /*
            A nested value the model never stated cannot be written one leaf at
            a time: an Impedance needs its `basis` first. IEEE 13's lines take
            impedance from a linecode, so the thing to edit is the linecode.
          */
          const parent = group.fields[0]?.parent
          const missing = parent && valueAt(detail.element, parent) == null
          const via = detail.element.linecode?.value ?? detail.element.geometry?.value
          const rows = group.fields.map((f) => {
            const current = valueAt(detail.element, f.field)
            const value = current?.value
            const unit = current?.unit ?? (f.units?.[0] ?? 'none')
            const edit = myEdit(f.field)
            const isOwn = current?.source === 'user_text' || Boolean(edit)
            if (value !== null && typeof value === 'object') return null

            if (f.hint === 'boolean') {
              toggles.push(
                <Toggle key={f.field} label={labelFor(f)} on={Boolean(value)} disabled={busy}
                        onClick={() => send(f.field, !value, 'none')} />)
              return null
            }

            const label = (
              <div className="wb-field-label">
                <label title={f.field}>{labelFor(f)}{f.required && <em>*</em>}</label>
                {isOwn && edit && (
                  <button className="wb-yours" onClick={() => onRevertField(edit)}
                          title="Put back the imported value">yours · revert</button>
                )}
              </div>
            )

            if (f.enum) {
              return (
                <div key={f.field} className="wb-f">
                  {label}
                  <select className={`wb-select${isOwn ? ' own' : ''}`} value={String(value ?? '')}
                          disabled={busy} onChange={(e) => send(f.field, e.target.value, 'none')}>
                    {value == null && <option value="">—</option>}
                    {f.enum.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              )
            }

            const shown = pending?.field === f.field ? pending.value : (value ?? '')
            const numeric = f.units?.some((u) => u !== 'none')
            return (
              <div key={f.field} className="wb-f">
                {label}
                <div className={`wb-field${isOwn ? ' own' : ''}`}>
                  <input value={shown} disabled={busy}
                         onChange={(e) => setPending({ field: f.field, value: e.target.value })}
                         onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                         onBlur={(e) => {
                           setPending(null)
                           const raw = e.target.value
                           if (raw === String(value ?? '')) return
                           const next = numeric ? Number(raw) : raw
                           if (numeric && (raw.trim() === '' || Number.isNaN(next))) return
                           send(f.field, next, unit)
                         }} />
                  {f.units?.length > 1 ? (
                    <select className="wb-unit" value={unit} disabled={busy}
                            onChange={(e) => send(f.field, value, e.target.value)}>
                      {f.units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  ) : unit !== 'none' && <span className="wb-unit">{unit}</span>}
                </div>
              </div>
            )
          })
          return (
            <div key={group.key || 'top'} className="wb-group">
              {group.key && <span className="wb-kicker">{group.key}</span>}
              {missing && (
                <p className="wb-small">
                  Not stated on this {kind.toLowerCase()}
                  {via ? <> — it comes from <code>{via}</code>, which is what to edit</>
                       : <> — set <code>basis</code> first, then the rest</>}.
                </p>
              )}
              {rows}
            </div>
          )
        })}
      </div>
      {toggles.length > 0 && <div className="wb-toggles">{toggles}</div>}
    </div>
  )
}

/*
  Read a dotted path out of an element: `impedance.x1`, `windings.0.kv`.
  Returns undefined rather than throwing when anything on the way is missing,
  because an optional nested value the model never stated is the normal case.
*/
function valueAt(root, path) {
  let node = root
  for (const segment of String(path).split('.')) {
    if (node === null || node === undefined) return undefined
    node = Array.isArray(node) ? node[Number(segment)] : node[segment]
  }
  return node
}

function Toggle({ label, about, on, disabled, onClick }) {
  return (
    <button className="wb-toggle" onClick={onClick} disabled={disabled}
            role="switch" aria-checked={on}>
      <span className="wb-toggle-text"><span>{label}</span>{about && <small>{about}</small>}</span>
      <span className={`wb-switch${on ? ' on' : ''}`}><i /></span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* needs attention, your changes                                       */

function NeedsAttention({ findings, edits, onShow, onRevert }) {
  const [all, setAll] = useState(false)
  // A finding the model check and a study both raised is one problem.
  const seen = new Set()
  const list = findings.filter((f) => {
    if (f.severity !== 'error' && f.severity !== 'warning') return false
    const key = `${f.code}|${f.element}|${f.message}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const shown = all ? list : list.slice(0, 5)

  return (
    <div className="wb-block">
      <div className="wb-block-head">
        <span className="wb-h">Needs attention</span>
        <span className="wb-mono wb-small">{list.length} open</span>
      </div>
      {!list.length && <p className="wb-ok">Nothing outside its limits in the model or the last study.</p>}
      {shown.map((f, i) => {
        const [kind, ...parts] = String(f.element || '').split('.')
        const rest = parts.join('.')
        const collection = collectionOf(kind)
        const name = edits.find((e) => e.element === collection
          && (rest === String(e.name) || rest.startsWith(`${e.name}.`)))?.name
        const mine = name !== undefined
        return (
          <div key={i} className={`wb-finding${f.severity === 'error' ? ' err' : ''}`}>
            <div>
              <span className={`wb-sev${f.severity === 'error' ? ' dark' : ''}`}>{f.severity}</span>
              <span><span className="wb-mono">{f.element}</span> — {f.message}</span>
            </div>
            <div className="wb-row">
              {kind !== 'circuit' && (
                <button className="wb-chipbtn wb-pill" onClick={() => onShow(f.element)}>Show on diagram</button>
              )}
              {mine && (
                <button className="wb-chipbtn wb-pill dark" onClick={() => onRevert(collection, name)}>
                  Revert my change
                </button>
              )}
            </div>
          </div>
        )
      })}
      {list.length > 5 && (
        <button className="wb-linkbtn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  )
}

function YourChanges({ edits, busy, onRevert }) {
  return (
    <div className="wb-block">
      <div className="wb-block-head">
        <span className="wb-h">Your changes</span>
        <span className="wb-mono wb-small">{edits.length}</span>
      </div>
      {!edits.length && <p className="wb-small">The model is exactly as imported.</p>}
      {edits.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
        <div key={i} className="wb-edit">
          <span className="wb-mono">
            {e.op} {e.element === 'buses' ? 'bus' : String(e.element ?? '').replace(/s$/, '')} {e.name}
            {e.field ? ` · ${e.field}` : ''}
            {e.value !== undefined ? ` ${typeof e.value === 'boolean' ? (e.value ? 'on' : 'off') : e.value}` : ''}
            {e.unit && e.unit !== 'none' ? ` ${e.unit}` : ''}
          </span>
          <button className="wb-chipbtn wb-pill" disabled={busy} onClick={() => onRevert(i)}>Revert</button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* files                                                               */

/*
  A picked file already knows where it came from. An input with
  `webkitdirectory` fills in `webkitRelativePath`; a plain one leaves it empty.
  The path matters because an OpenDSS master redirects at its neighbours.
*/
const fromInput = (list) => [...(list ?? [])].map((file) =>
  ({ file, path: file.webkitRelativePath || file.name }))

/*
  Everything in a drop, including what is inside dropped folders.
  `dataTransfer.files` is flat and loses the directory structure; the entry API
  keeps it, so each file travels with its path relative to what was dropped.
*/
async function filesFromDrop(dt) {
  const entries = [...(dt.items ?? [])]
    .map((i) => i.webkitGetAsEntry?.())
    .filter(Boolean)
  if (!entries.length) return fromInput(dt.files)

  const out = []
  const walk = (entry, prefix) => new Promise((done) => {
    if (entry.isFile) {
      entry.file((file) => { out.push({ file, path: prefix + entry.name }); done() }, done)
      return
    }
    const reader = entry.createReader()
    const batch = () => reader.readEntries(async (found) => {
      if (!found.length) { done(); return }
      for (const child of found) await walk(child, `${prefix + entry.name}/`)
      batch()
    }, done)
    batch()
  })

  for (const entry of entries) await walk(entry, '')
  return out
}

/*
  The pieces the EV-charger mode lays out in this same frame. Handed over as a
  prop rather than imported there, so the two files do not import each other.
*/
const SHARED = { TopBar, Assistant, ReportView, Toggle, NeedsAttention }
