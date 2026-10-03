import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Boundary from '../components/Boundary.jsx'
import { getHealth, postRoute } from '../api.js'
import { api, ApiError, exportUrl, pollJob } from './api.js'
import * as A from './answer.js'
import { ErrorCard, errorFinding } from './errors.jsx'
import { FeederMap, PinMap, useBasemap } from './Map.jsx'
import { NetworkGraph } from './NetworkGraph.jsx'
import {
  BuildForm, BuiltFeeders, BusInspector, DEFAULT_BUILD, FeederFacts, LibraryPicker, MapDisplay,
  Placements, StoredStudies, VoltageLimit,
} from './panels.jsx'
import { AccuracyReport, AfterReport, EnvelopeReport, LibraryReport } from './reports.jsx'
import './pythia.css'

/*
  The Workbench's EV-charger mode — grid-yukti's playground, in the Workbench's layout.

  Same frame as the model workbench, slot for slot: the top bar, the Assistant on the left,
  the stage in the middle with its Diagram and Report tabs, the side panel on the right. What
  changes is what fills them:

    stage      the feeder on a MAP (a traced feeder), or as a NETWORK drawing (a library
               feeder, which has no coordinates); dropping a pin when tracing a new one
    Assistant  each step is a study: screen, read the confidence, consider a real solve,
               read the accuracy, run a leave-one-out study on the library
    side       Inspector (a bus, the feeder, the build form or the library picker), Needs
               attention (the server's warnings), the voltage limit, Display, and the
               placements in the "Your changes" slot
    Report     the agent's markdown report and grid-yukti's report screens

  The order of the work is grid-yukti's, and so are its two standing rules: THE CLIENT
  INVENTS NOTHING — every number is a response field — and THE USER SELECTS — nothing here
  ranks placements or chooses which one to solve.

  `entry` is how the start screen opened this: {kind: 'build'} | {kind: 'feeder', fid} |
  {kind: 'library'}.
*/

const STUDIES = {
  build: { agent: 'pythia:build', label: 'Trace and build a feeder', ask: 'trace a feeder from the road network at this pin',
           about: 'Fetches the roads around the pin and builds a radial feeder from them.' },
  screen: { agent: 'pythia:screen', label: 'Screen EV chargers', ask: 'screen the EV charger placements on this feeder',
            about: 'Feasible, infeasible or inconclusive for every bus of every chosen placement.' },
  envelope: { agent: 'pythia:envelope', label: 'How confident is this screen?', ask: 'how confident is this screen',
              about: 'The model’s own uncertainty — free, and not measured error.' },
  decide: { agent: 'pythia:decide', label: 'Consider a real solve', ask: 'which placement could a real solve measure',
            about: 'A Monte-Carlo power flow on one placement you choose.' },
  accuracy: { agent: 'pythia:accuracy', label: 'Accuracy on this feeder', ask: 'how accurate is the screen on this feeder',
              about: 'Measured error, against the real solves this feeder has.' },
  library: { agent: 'pythia:library', label: 'Leave-one-out study', ask: 'run a leave-one-out study on this library feeder',
             about: 'Scored against labels the library already holds. No power flow is run.' },
}

const VERDICT_PAINT = 'verdicts'

export default function PythiaWorkbench({ entry, onExit, onOpenModel, shared }) {
  const { TopBar, Assistant, ReportView, Toggle, NeedsAttention } = shared
  const [mode, setMode] = useState(entry?.kind === 'library' ? 'library' : entry?.kind === 'feeder' ? 'feeder' : 'build')

  const [health, setHealth] = useState(null)
  const [options, setOptions] = useState(null)
  const [catalogue, setCatalogue] = useState(null)
  const [routerUp, setRouterUp] = useState(false)

  const [build, setBuild] = useState(DEFAULT_BUILD)
  const [feeder, setFeeder] = useState(null)
  const [run, setRun] = useState(null)
  const [scr, setScr] = useState(null)
  const [rec, setRec] = useState(null)
  const [pending, setPending] = useState(null)
  const [screenPids, setScreenPids] = useState(null)
  const [colour, setColour] = useState(null)
  const [justAdded, setJustAdded] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [picked, setPicked] = useState([])
  const [cand, setCand] = useState(null)
  const [chosen, setChosen] = useState(null)
  const [jobs, setJobs] = useState({})
  const setJob = useCallback((d) => d && setJobs((m) => ({ ...m, [d.job_id]: d })), [])
  const [selectedBus, setSelectedBus] = useState(null)
  const [showVerdicts, setShowVerdicts] = useState(true)
  const [base, setBase] = useBasemap()

  const [libCat, setLibCat] = useState(null)
  const [libStudies, setLibStudies] = useState(null)
  const [libSel, setLibSel] = useState({ feeder_id: null, arm: 'arm100', hold_out: 'placements', pids: null })
  const [libTopo, setLibTopo] = useState(null)
  const [libRes, setLibRes] = useState(null)
  const [libVmin, setLibVmin] = useState(null)

  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [reports, setReports] = useState([])
  const [tab, setTab] = useState('diagram')
  const [unread, setUnread] = useState(false)
  const seq = useRef(0)

  const say = useCallback((role, text, extra = {}) =>
    setMessages((m) => [...m, { role, text, ...extra, at: Date.now() }]), [])

  const fail = useCallback((e, retry) => {
    say('error', '', { node: <ErrorCard err={e} onRetry={retry} /> })
    setErrors((x) => [errorFinding(e), ...x].slice(0, 6))
  }, [say])

  const addReport = useCallback((doc) => {
    setReports((r) => [...r.filter((d) => d.label !== doc.label), doc])
    setUnread(true)
  }, [])

  /* ---------------------------------------------------------------- boot */

  const refreshFeeders = useCallback(async () => {
    const c = await api.feeders()
    setCatalogue(c)
    return c
  }, [])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [h, o] = await Promise.all([api.health(), api.options()])
        if (!live) return
        setHealth(h); setOptions(o)
        setLibVmin((v) => v ?? o?.vmin?.default ?? null)
        await refreshFeeders()
      } catch (e) { if (live) fail(e) }
      getHealth().then((h) => live && setRouterUp(Boolean(h?.router?.reachable)))
        .catch(() => {})
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- feeders */

  const resetRun = () => {
    setRun(null); setScr(null); setRec(null); setPending(null); setCand(null); setChosen(null)
    setJustAdded(null); setScreenPids(null); setColour(null); setPlacing(false); setPicked([])
    setSelectedBus(null); setReports([]); setTab('diagram'); setUnread(false); setErrors([])
  }

  const openFeeder = useCallback(async (fid, { quiet = false } = {}) => {
    setBusy(true)
    try {
      const f = await api.feeder(fid)
      if (!feeder || feeder.feeder_id !== fid) resetRun()
      setFeeder(f)
      setMode('feeder')
      if (!quiet) say('assistant', '', { answer: A.opened(f), label: 'Feeder' })
      return f
    } catch (e) { fail(e) } finally { setBusy(false) }
    return null
  }, [feeder, say, fail])

  // Once per mount, even under StrictMode's double effect in development — opening twice
  // printed the "Opened feeder" message twice.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (entry?.kind === 'feeder' && entry.fid) openFeeder(entry.fid)
    else if (entry?.kind === 'library') openLibrary()
    else say('system', 'Drop a pin on the map where the feeder head (the substation) should go, set the '
      + 'feeder in the side panel, then **Trace and build feeder**. Or open one this server has already built.')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function doBuild() {
    const req = {
      lat: parseFloat(build.lat), lon: parseFloat(build.lon), kv: parseFloat(build.kv),
      rating_mva: parseFloat(build.rating_mva), n_buses: parseInt(build.n_buses, 10),
      load_allocation: build.load_allocation, heads: [Number(build.head)],
      loadings: [build.loading], allow_osm: true,
    }
    setBusy(true)
    say('user', `Trace a feeder at ${build.lat}, ${build.lon}`)
    try {
      const j = await api.buildFeeder(req)
      setJob({ job_id: j.job_id, state: 'queued', phases: [] })
      say('assistant', '', { live: 'job', jobId: j.job_id, label: 'Building' })
      const done = await pollJob(j.job_id, setJob, 500)
      if (done.state === 'failed') { fail(new ApiError(null, done.error, `/v1/jobs/${j.job_id}`)); return }
      await refreshFeeders()
      const f = await api.feeder(j.feeder_id)
      resetRun(); setFeeder(f); setMode('feeder')
      say('assistant', '', { answer: A.built(f), label: 'Feeder built' })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  async function renameFeeder(fid, name) {
    try {
      await api.renameFeeder(fid, name)
      await refreshFeeders()
      if (feeder?.feeder_id === fid) setFeeder(await api.feeder(fid))
    } catch (e) { fail(e) }
  }

  async function deleteFeeder(fid, force) {
    await api.deleteFeeder(fid, force)        // FEEDER_IN_USE is handled by the list itself
    await refreshFeeders()
    if (feeder?.feeder_id === fid) { setFeeder(null); resetRun(); setMode('build') }
  }

  /* ---------------------------------------------------------------- placing */

  async function doAppend() {
    setBusy(true)
    say('user', `Add a placement at buses ${picked.join(', ')}`)
    try {
      const j = await api.appendPlacements(feeder.feeder_id, [{ buses: picked }])
      setJob({ job_id: j.job_id, state: 'queued', phases: [] })
      say('assistant', '', { live: 'job', jobId: j.job_id, label: 'Placing' })
      const done = await pollJob(j.job_id, setJob, 400)
      if (done.state === 'failed') { fail(new ApiError(null, done.error, `/v1/jobs/${j.job_id}`)); return }
      const pids = done.result?.appended_pids || []
      setFeeder(await api.feeder(feeder.feeder_id))
      setJustAdded(pids.length ? pids[pids.length - 1] : null)
      if (pids.length) { setScreenPids(pids.slice()); setColour(pids[pids.length - 1]) }
      setPlacing(false)
      say('assistant', `Placement **${pids.join(', ')}** is on the feeder now — only it was built; the `
        + 'feeder’s own coordinate was already paid for. It is selected for the next screen.', { label: 'Placed' })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const toggleBus = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].sort((a, b) => a - b)))

  /* ---------------------------------------------------------------- screen */

  const view = useMemo(() => (rec ? { name: 'recount', d: rec } : scr ? { name: 'screen', d: scr } : null), [rec, scr])

  const loadRunReport = useCallback(async (rid, vmin) => {
    try {
      const r = await api.report(rid, vmin)
      addReport({ label: 'Screen', markdown: r.markdown })
    } catch { /* the report is a view; the screen already succeeded */ }
  }, [addReport])

  async function doScreen() {
    if (!feeder) { say('assistant', 'Open or build a feeder first — screening needs one.'); return }
    if (screenPids && screenPids.length === 0) { say('assistant', 'Pick at least one placement to screen, in the side panel.'); return }
    setBusy(true)
    try {
      const r = await api.createRun({ feeder_id: feeder.feeder_id })
      setRun(r)
      const s = await api.screen(r.run_id, { pids: screenPids, random_state: 42 })
      setScr(s); setRec(null); setPending(s.vmin); setCand(null)
      const sp = s.screened_pids || []
      setColour(justAdded !== null && sp.includes(justAdded) ? justAdded : (sp.length ? sp[0] : null))
      setShowVerdicts(true)
      say('assistant', '', { answer: A.screened(s), label: 'Screen', report: true,
                             node: <ExportLink run={r} view={{ d: s }} /> })
      loadRunReport(r.run_id, s.vmin)
    } catch (e) { fail(e, e?.detail?.remedy === 'retry' ? doScreen : undefined) } finally { setBusy(false) }
  }

  const onVmin = useCallback(async (v) => {
    setPending(v)
    const mine = ++seq.current
    try {
      const d = await api.recount(run.run_id, { vmin: v })
      if (mine === seq.current) setRec(d)
    } catch (e) { fail(e) }
  }, [run, fail])

  // The Report tab shows the screen at the limit ON SCREEN, so it is re-read when opened.
  useEffect(() => {
    if (tab === 'report' && run && view) loadRunReport(run.run_id, view.d.vmin)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- envelope */

  async function openEnvelope() {
    if (!run) { say('assistant', 'Screen the feeder first — the confidence report reads a screen that has already run.'); return }
    setBusy(true)
    try {
      const env = await api.envelope(run.run_id, view?.d?.vmin)
      addReport({ label: 'Confidence', node: <EnvelopeReport env={env} /> })
      say('assistant', '', { answer: A.envelope(env), label: 'Confidence', report: true })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  /* ---------------------------------------------------------------- decide and solve */

  async function openDecide() {
    if (!run) { say('assistant', 'Screen the feeder first — the decision point lists what a screen left undecided.'); return }
    setBusy(true)
    try {
      const c = await api.candidates(run.run_id)
      setCand(c)
      const offered = (c.candidates || []).map((x) => x.pid)
      setChosen(colour !== null && offered.includes(colour) ? colour : null)
      say('assistant', '', { answer: A.candidates(c), label: 'Decide', live: 'decide' })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  async function doValidate(pid) {
    setBusy(true)
    const beforeView = view
    try {
      const j = await api.validate(run.run_id, pid)
      setJob({ job_id: j.job_id, state: 'queued', phases: [] })
      say('assistant', '', { live: 'job', jobId: j.job_id, label: 'Solving' })
      const done = await pollJob(j.job_id, setJob, 500)
      if (done.state === 'failed') { fail(new ApiError(null, done.error, `/v1/jobs/${j.job_id}`)); return }
      const solve = done.result
      // the baseline is re-taken on the SAME placements the after-screen will cover, before
      // the anchor is promoted — two screens, one population, one thing changed between them
      const bp = (beforeView?.d?.screened_pids || []).filter((p) => p !== pid)
      const cmp = bp.length ? bp : null
      let before = beforeView?.d || null
      try { before = await api.screen(run.run_id, { pids: cmp, random_state: 42 }) } catch { /* keep */ }
      const a = await api.promote(run.run_id, pid)
      setJob({ job_id: a.job_id, state: 'queued', phases: [] })
      const adone = await pollJob(a.job_id, setJob, 500)
      if (adone.state === 'failed') { fail(new ApiError(null, adone.error, `/v1/jobs/${a.job_id}`)); return }
      const anchor = adone.result
      const after = await api.screen(run.run_id, { pids: cmp, random_state: 42 })
      setScr(after); setRec(null); setPending(after.vmin)
      setColour((after.screened_pids || [])[0] ?? null)
      setCand(await api.candidates(run.run_id))
      addReport({ label: 'Solve', node: <AfterReport before={before} after={after} anchor={anchor} solve={solve} feeder={feeder} /> })
      say('assistant', '', { answer: A.solved(solve, anchor), label: 'Solved', report: true })
      loadRunReport(run.run_id, after.vmin)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  async function openAccuracy() {
    if (!run) { say('assistant', 'Screen the feeder first — accuracy is measured against the solves a run holds.'); return }
    setBusy(true)
    try {
      const lopo = await api.lopo(run.run_id)
      let hist = null
      try { hist = await api.runs(feeder?.feeder_id) } catch { /* the report is still a report */ }
      addReport({ label: 'Accuracy', node: <AccuracyReport lopo={lopo} runsHist={hist} /> })
      say('assistant', '', { answer: A.accuracy(lopo), label: 'Accuracy', report: true })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  /* ---------------------------------------------------------------- library */

  async function openLibrary() {
    resetRun(); setMode('library'); setLibRes(null)
    say('system', 'A leave-one-out study on a feeder the library already holds — the one place accuracy is '
      + 'free, because every row carries its own solved answer. Pick a network and a variant in the side panel.')
    // Stored studies are kept verbatim on disk, so they open even where the library itself is
    // absent; the catalogue needs the library. Two requests, so one failing cannot hide the other.
    api.libStudies().then(setLibStudies, () => {})
    if (!libCat) {
      try { setLibCat(await api.libFeeders()) } catch (e) { setLibCat(false); fail(e) }
    }
  }

  useEffect(() => {
    const fid = libSel.feeder_id
    if (mode !== 'library' || !fid) { setLibTopo(null); return undefined }
    let live = true
    setLibTopo(null)
    api.libFeeder(fid, libSel.arm).then((t) => live && setLibTopo(t), (e) => live && setLibTopo({ error: e }))
    return () => { live = false }
  }, [mode, libSel.feeder_id, libSel.arm])

  async function runLibrary() {
    if (!libSel.feeder_id) { say('assistant', 'Pick a library network and variant in the side panel first.'); return }
    setBusy(true)
    say('user', `Leave-one-out on ${libSel.feeder_id} (${libSel.hold_out}, ${libSel.arm})`)
    try {
      const body = { ...libSel }
      if (libVmin !== null) body.vmin = libVmin
      const res = await api.libScreen(body)
      showStudy(res)
      setLibStudies(await api.libStudies())
    } catch (e) { fail(e, e?.detail?.remedy === 'retry' ? runLibrary : undefined) } finally { setBusy(false) }
  }

  async function showStudy(res) {
    setLibRes(res)
    setColour(res.pids?.[0] ?? null)
    setShowVerdicts(true)
    addReport({ label: 'Library study', node: <LibraryReport res={res} /> })
    say('assistant', '', { answer: A.library(res), label: 'Library study', report: true })
    if (res.study_id) {
      try { addReport({ label: 'Study report', markdown: (await api.libStudyReport(res.study_id)).markdown }) } catch { /* view only */ }
    }
  }

  async function openStudy(sid) {
    setBusy(true)
    try {
      const d = await api.libStudy(sid)
      setLibSel({ feeder_id: d.feeder_id, arm: d.arm || 'arm100', hold_out: d.hold_out || 'placements', pids: d.requested_pids || null })
      await showStudy(d)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  /* ---------------------------------------------------------------- the assistant */

  const DO = {
    'pythia:build': doBuild, 'pythia:screen': doScreen, 'pythia:envelope': openEnvelope,
    'pythia:decide': openDecide, 'pythia:accuracy': openAccuracy, 'pythia:library': runLibrary,
  }

  const studies = mode === 'library' ? [STUDIES.library]
    : mode === 'build' ? [STUDIES.build]
      : [STUDIES.screen, STUDIES.envelope, STUDIES.decide, STUDIES.accuracy]

  /*
    Typed text goes to Hermes, the same router the model workbench uses. If it names Pythia,
    the step run is this mode's main one — the screen, a build, or a library study — and the
    reply says which; Pythia's other steps are offered as studies, never guessed from keywords.
  */
  async function ask(text, agent = '') {
    if (agent && DO[agent]) {
      if (text) say('user', text)
      return DO[agent]()
    }
    say('user', text)
    if (!routerUp) {
      say('assistant', 'No language model is running, so I cannot route that. Pick a step:', { offerStudies: true })
      return undefined
    }
    setBusy(true)
    try {
      const r = await postRoute(text)
      if (r.agent === 'pythia') {
        setBusy(false)
        const step = mode === 'library' ? STUDIES.library : mode === 'build' ? STUDIES.build : STUDIES.screen
        say('assistant', `That is an EV-siting question — running **${step.label.toLowerCase()}**. `
          + 'The other steps are under Studies.')
        return DO[step.agent]()
      }
      if (r.agent) {
        say('assistant', `That is a question for another study (${r.agent}), which works on an opened network `
          + 'model rather than on Pythia’s feeders. Use **Open model** to load one.', { offerStudies: true })
      } else {
        say('assistant', `${r.reason || 'I could not tell which step you meant.'} Pick one:`, { offerStudies: true })
      }
    } catch (e) { say('error', e.message) } finally { setBusy(false) }
    return undefined
  }

  /* ---------------------------------------------------------------- derived */

  const solvedPids = useMemo(() => (cand ? new Set((cand.solved || []).map((r) => r.pid)) : null), [cand])
  const screened = view?.d?.screened_pids || []

  const verdictByBus = useMemo(() => {
    if (!showVerdicts || colour === null) return null
    const rows = mode === 'library' ? libRes?.rows : view?.d?.rows
    if (!rows) return null
    const o = {}
    for (const r of rows) if (r.pid === colour) o[r.bus_id] = r.verdict
    return Object.keys(o).length ? o : null
  }, [showVerdicts, colour, mode, libRes, view])

  const colourBuses = useMemo(() => {
    if (colour === null) return null
    const list = mode === 'library' ? libTopo?.placements : feeder?.placements
    return (list || []).find((p) => p.pid === colour)?.buses || null
  }, [colour, mode, libTopo, feeder])

  const findings = useMemo(() => {
    const out = [...errors]
    const ws = [...(feeder?.warnings || []), ...(run?.warnings || []), ...(scr?.warnings || [])]
    const seen = new Set()
    for (const w of ws) {
      const key = `${w.kind}|${w.message}`
      if (seen.has(key) || w.severity === 'info') continue
      seen.add(key)
      out.push({ severity: w.severity === 'hard' ? 'error' : 'warning', code: w.kind, element: 'circuit.run', message: w.message })
    }
    for (const c of cand?.candidates || []) {
      for (const w of c.warnings || []) {
        out.push({ severity: 'warning', code: w.kind, element: `placement.${c.pid}`, message: w.message })
      }
    }
    const t = health?.tiers
    if (t && !t.predict?.ready) {
      out.push({ severity: 'warning', code: 'predict tier', element: 'circuit.server',
        message: 'Screening is unavailable on this server: it needs the library, the retrieval cache, a checkpoint and a GPU. `python -m agents.Pythia.harness status` says which is missing.' })
    }
    if (t && !t.onboard?.ready) {
      out.push({ severity: 'warning', code: 'onboard tier', element: 'circuit.server', message: t.onboard?.reason || 'Building a feeder from a pin is unavailable.' })
    }
    return out
  }, [errors, feeder, run, scr, cand, health])

  const live = messages.map((m) => {
    if (m.live === 'job') return { ...m, node: <JobProgress job={jobs[m.jobId]} /> }
    if (m.live === 'decide' && cand) {
      return { ...m, node: <CandidateList cand={cand} chosen={chosen} setChosen={(p) => { setChosen(p); setColour(p) }}
                                        busy={busy} onSolve={() => doValidate(chosen)} /> }
    }
    return m
  })

  /* ---------------------------------------------------------------- layout */

  const title = mode === 'library' ? (libSel.feeder_id || 'Library study')
    : mode === 'feeder' && feeder ? (feeder.name || feeder.label || feeder.feeder_id) : 'New feeder'
  const stageLabel = mode === 'library' ? 'Network' : 'Map'
  const pids = mode === 'library' ? (libRes?.pids || []) : screened
  const hasVerdicts = mode === 'library' ? Boolean(libRes) : Boolean(view)

  return (
    <div className="wb wb-app py">
      <TopBar title={title} ext="EV siting" badge={mode === 'library' ? 'library · no solves' : run ? `run ${run.run_id.slice(0, 8)}` : 'no run yet'}
              busy={busy} editing={false}
              menu={[
                { label: 'A new feeder…', about: 'Drop a pin and trace one from the road network', run: () => { setFeeder(null); resetRun(); setMode('build') } },
                { label: 'A library study…', about: 'Leave-one-out where the truth is already known', run: openLibrary },
                { label: 'A network model…', about: 'Back to the model workbench and its studies', run: onOpenModel },
                { label: 'The start screen', about: 'Back to the list of examples and feeders', run: onExit },
              ]} />

      <div className="wb-cols">
        <Assistant messages={live} busy={busy} studies={studies} online={routerUp}
                   onAsk={ask} onFollowUp={() => {}} onOpenReport={() => { setTab('report'); setUnread(false) }}
                   onAttach={onOpenModel} attachLabel="Open model" placeholder="Ask about EV charger siting…" />

        <section className="wb-stage">
          <div className="wb-panehead wb-stagehead">
            <div role="tablist" className="wb-tabs">
              <button role="tab" aria-selected={tab === 'diagram'} className={tab === 'diagram' ? 'on' : ''}
                      onClick={() => setTab('diagram')}>{stageLabel}</button>
              <button role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'on' : ''}
                      onClick={() => { setTab('report'); setUnread(false) }}>
                Report{unread && <span className="wb-dot" aria-label="new" />}
              </button>
            </div>
            {tab === 'diagram' && mode !== 'build' && (
              <div className="wb-row">
                <label className="wb-paint">
                  <span>Paint</span>
                  <select value={showVerdicts && hasVerdicts ? VERDICT_PAINT : 'none'}
                          onChange={(e) => setShowVerdicts(e.target.value === VERDICT_PAINT)}>
                    <option value="none">Nothing</option>
                    <option value={VERDICT_PAINT} disabled={!hasVerdicts}>{hasVerdicts ? 'Verdicts' : 'Verdicts — screen it first'}</option>
                  </select>
                </label>
                <label className="wb-paint" title="a bus carries one verdict per placement, so one placement is drawn at a time">
                  <span>Placement</span>
                  <select value={colour ?? ''} onChange={(e) => setColour(e.target.value === '' ? null : Number(e.target.value))}>
                    <option value="">None</option>
                    {(mode === 'library' ? (libTopo?.placements || []).map((p) => p.pid) : (feeder?.placements || []).map((p) => p.pid))
                      .map((p) => <option key={p} value={p}>P{p}{pids.includes(p) ? '' : ' — not screened'}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="wb-canvas" hidden={tab !== 'diagram'}>
            <div className="wb-grid" />
            <Boundary label="The map">
              {mode === 'build' && (
                <PinMap lat={build.lat} lon={build.lon} basemap={base}
                        onPick={(la, lo) => setBuild((b) => ({ ...b, lat: la.toFixed(5), lon: lo.toFixed(5) }))} />
              )}
              {mode === 'feeder' && feeder?.geometry && (
                <FeederMap geometry={feeder.geometry} basemap={base} verdictByBus={verdictByBus}
                           picked={placing ? picked : colourBuses}
                           pickedStyle={!placing && (colourBuses || []).length > 14 ? 'ring' : 'full'}
                           selected={selectedBus}
                           onBus={placing ? toggleBus : (id) => setSelectedBus(id)} />
              )}
              {mode === 'library' && (
                libTopo && !libTopo.error
                  ? <div className="py-graph"><NetworkGraph buses={libTopo.buses} lines={libTopo.lines} verdictByBus={verdictByBus}
                                                            picked={colourBuses} selected={selectedBus}
                                                            onBus={(id) => setSelectedBus(id)} /></div>
                  : <div className="wb-diagram-empty">{libTopo?.error ? <ErrorCard err={libTopo.error} />
                    : libSel.feeder_id ? 'Drawing the network…' : 'Pick a library network in the side panel.'}</div>
              )}
            </Boundary>
            <PythiaLegend verdicts={Boolean(verdictByBus)} placing={placing} library={mode === 'library'} build={mode === 'build'} />
          </div>
          <div className="wb-report-pane" hidden={tab !== 'report'}>
            <Boundary label="The report"><ReportView docs={reports} title={title} /></Boundary>
          </div>
        </section>

        <aside className="wb-side">
          <Boundary label="The inspector">
            {mode === 'build' && <BuildForm build={build} setBuild={setBuild} options={options} busy={busy} onBuild={doBuild} />}
            {mode === 'feeder' && feeder && (selectedBus !== null
              ? <BusInspector feeder={feeder} bus={selectedBus} view={view} onClose={() => setSelectedBus(null)} />
              : <FeederFacts feeder={feeder} options={options} />)}
            {mode === 'library' && (
              <LibraryPicker cat={libCat} sel={libSel} setSel={setLibSel} options={options} topo={libTopo}
                             vmin={libVmin ?? options?.vmin?.default ?? 0.95} setVmin={setLibVmin} busy={busy} onRun={runLibrary} />
            )}
          </Boundary>
          <NeedsAttention findings={findings} edits={[]} onShow={(el) => {
            const m = /^placement\.(\d+)$/.exec(el || '')
            if (m) setColour(Number(m[1]))
          }} onRevert={() => {}} />
          {mode === 'feeder' && <VoltageLimit view={view} options={options} pending={pending} onVmin={onVmin} run={run} />}
          {mode !== 'library' && (
            <MapDisplay base={base} setBase={setBase} showVerdicts={showVerdicts} setShowVerdicts={setShowVerdicts}
                        hasVerdicts={hasVerdicts} Toggle={Toggle} />
          )}
          {mode === 'feeder' && feeder && (
            <Placements feeder={feeder} pids={screenPids} setPids={setScreenPids} solvedPids={solvedPids}
                        colour={colour} setColour={setColour} screened={screened}
                        placing={placing} setPlacing={setPlacing} picked={picked} setPicked={setPicked}
                        options={options} onAppend={doAppend} busy={busy} />
          )}
          {mode !== 'library' && (
            <BuiltFeeders feeders={catalogue?.feeders} current={feeder?.feeder_id} busy={busy}
                          onOpen={(fid) => openFeeder(fid)} onRename={renameFeeder} onDelete={deleteFeeder} />
          )}
          {mode === 'library' && <StoredStudies studies={libStudies} onOpen={openStudy} />}
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ chat pieces */

/** A job's phases, as the server reports them: elapsed is measured, an ETA only where earned. */
function JobProgress({ job }) {
  if (!job) return null
  const phases = job.phases || []
  return (
    <div className="py-job">
      <div className="py-job-head">
        <span className="wb-mono">{job.state}</span>
        {job.eta_total_s && <span className="wb-meta" title={job.eta_note}>about {job.eta_total_s.toFixed(0)} s, measured here</span>}
      </div>
      {!phases.length && <span className="wb-small">Waiting for the worker to report its first phase…</span>}
      {phases.map((p) => (
        <div key={p.name} className={`py-phase ${p.state}`}>
          <span className="py-phase-mark">{p.state === 'done' ? '✓' : p.state === 'skipped' ? '–' : p.state === 'failed' ? '!' : ''}</span>
          <span className="py-phase-label">{p.label || p.name}</span>
          <span className="wb-mono wb-meta">
            {p.state === 'queued' ? 'queued' : `${p.elapsed_s != null ? p.elapsed_s.toFixed(1) : '—'} s`}
            {p.state === 'running' && p.eta_s ? ` · ~${p.eta_s.toFixed(0)} s expected` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The decision point: unranked candidates, in the feeder's own order. The user chooses. */
function CandidateList({ cand, chosen, setChosen, busy, onSolve }) {
  const list = cand.candidates || []
  const prior = new Set((cand.solved_elsewhere || []).map((r) => r.pid))
  return (
    <div className="py-cands">
      {(cand.solved || []).length > 0 && (
        <p className="wb-small">Already solved on this run: {cand.solved.map((r) => `P${r.pid} (${r.row_role})`).join(', ')} — no need to spend again.</p>
      )}
      {list.map((c) => (
        <button key={c.pid} className={`py-cand${chosen === c.pid ? ' on' : ''}`} onClick={() => setChosen(c.pid)}>
          <span className="py-cand-head">
            <b>Placement {c.pid}</b>
            <span className="wb-mono wb-meta">{c.m} station{c.m === 1 ? '' : 's'}{c.ev_kw_total ? ` · ${c.ev_kw_total.toFixed(1)} kW` : ''}</span>
            {c.origin === 'user' && <span className="py-pill feasible">yours</span>}
            {prior.has(c.pid) && <span className="py-pill solved">solved earlier</span>}
            {(c.warnings || []).length > 0 && <span className="py-pill infeasible">poor use of a solve</span>}
          </span>
          {(c.warnings || []).map((w, i) => <span key={i} className="wb-small">{w.message}</span>)}
        </button>
      ))}
      <div className="wb-row">
        <button className="wb-btn wb-btn-dark wb-btn-sm" disabled={chosen === null || busy} onClick={onSolve}
                title={cand.solve_method ? `${cand.solve_method.name} — ${cand.solve_method.engine}; cost: ${cand.solve_method.cost}` : undefined}>
          Solve this placement</button>
        <span className="wb-small">You can stop here — verdicts already decided stay decided.</span>
      </div>
    </div>
  )
}

function ExportLink({ run, view }) {
  if (!run || !view) return null
  return (
    <div className="wb-row">
      <a className="wb-btn wb-btn-sm py-link" download href={exportUrl(run.run_id, view.d.vmin, view.d.z)}
         title="every sheet is built from the same responses these panels render; it spends no solves">Export to Excel</a>
    </div>
  )
}

function PythiaLegend({ verdicts, placing, library, build }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="wb-legend">
      <button className="wb-legend-head" onClick={() => setOpen(!open)}>
        <span>Legend · {build ? 'Site' : verdicts ? 'Verdicts' : 'Feeder'}</span><span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        build ? <span>The pin is the feeder head — the substation the feeder is traced from.</span> : (
          <div className="wb-legend-rows">
            <span><i className="py-lg sub" />Substation — the feeder head</span>
            <span><i className="py-lg host" />Load bus — can host a station</span>
            <span><i className="py-lg junction" />Junction — cannot host</span>
            <span><i className="py-lg picked" />{placing ? 'Chosen for the new placement' : 'Station of the drawn placement'}</span>
            {verdicts && <>
              <span><i className="py-lg feasible" />Feasible</span>
              <span><i className="py-lg inconclusive" />Inconclusive — a real solve settles it</span>
              <span><i className="py-lg infeasible" />Infeasible</span>
            </>}
            <span className="wb-legend-foot">{placing ? 'Click buses that can host a station; click again to remove.'
              : library ? 'Click a bus to inspect it.' : 'Click a bus to see what each placement says about it.'}</span>
          </div>
        )
      )}
    </div>
  )
}
