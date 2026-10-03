import { useState } from 'react'
import { BASEMAPS } from './Map.jsx'
import { VerdictStrip } from './charts.jsx'

/*
  The side panel's blocks in the Workbench's EV-charger mode.

  Each one sits in the slot the Workbench already has — Inspector, Needs attention, Display,
  Your changes — so the layout is the Workbench's and only the content is Pythia's. Every
  number shown is a field of a response, labelled with what it is; every explainer is the
  server's own sentence from `/v1/options`, carried on the control's title.
*/

const num = (v, d) => (v == null ? '—' : Number(v).toFixed(d))

function Facts({ rows }) {
  return (
    <dl className="wb-figures">
      {rows.filter(Boolean).map(([label, value, note]) => (
        <div key={label}><dt>{label}</dt><dd><b>{value}</b>{note && <> {note}</>}</dd></div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------- build */

export const DEFAULT_BUILD = {
  lat: '26.78', lon: '75.65', kv: '11.0', rating_mva: '4.0', n_buses: '100',
  load_allocation: 'uniform', head: 1.0, loading: 'arm100',
}

function Choice({ name, opt, value, onChange, fmt = (v) => String(v) }) {
  if (!opt) return null
  const labels = opt.labels || {}
  const title = [opt.explainer, opt.cost && `cost — ${opt.cost}`,
    opt.measured_consequence && `measured — ${opt.measured_consequence}`].filter(Boolean).join('\n\n')
  return (
    <div className="wb-f">
      <div className="wb-field-label"><label title={title}>{opt.label}</label></div>
      <div className="wb-row">
        {(opt.values || []).map((v) => (
          <button key={String(v)} type="button" data-opt={name}
                  className={`wb-chipbtn${String(v) === String(value) ? ' on' : ''}`}
                  onClick={() => onChange(v)}>{labels[v] ?? fmt(v)}</button>
        ))}
      </div>
    </div>
  )
}

/** Inspector slot, before a feeder exists: where to trace one from. */
export function BuildForm({ build, setBuild, options, busy, onBuild }) {
  const field = (k, label, unit) => (
    <div className="wb-f" key={k}>
      <div className="wb-field-label"><label>{label}</label></div>
      <div className="wb-field">
        <input value={build[k]} onChange={(e) => setBuild({ ...build, [k]: e.target.value })} />
        {unit && <span className="wb-unit">{unit}</span>}
      </div>
    </div>
  )
  return (
    <div className="wb-block">
      <span className="wb-kicker">New feeder</span>
      <span className="wb-ins-name">From a map pin</span>
      <p className="wb-small">The road network around the pin is traced into a radial feeder.
        The road fetch is an outside service, so its time is not promised.</p>
      <div className="py-grid2">
        {field('lat', 'Latitude', '°')}
        {field('lon', 'Longitude', '°')}
        {field('kv', 'Nominal voltage', 'kV')}
        {field('rating_mva', 'Transformer rating', 'MVA')}
        {field('n_buses', 'Target buses')}
      </div>
      {options && (
        <>
          <Choice name="load_allocation" opt={options.load_allocation} value={build.load_allocation}
                  onChange={(v) => setBuild({ ...build, load_allocation: v })} />
          <Choice name="heads" opt={options.heads} value={build.head} fmt={(v) => Number(v).toFixed(3)}
                  onChange={(v) => setBuild({ ...build, head: v })} />
          <Choice name="loadings" opt={options.loadings} value={build.loading}
                  onChange={(v) => setBuild({ ...build, loading: v })} />
        </>
      )}
      <button className="wb-btn wb-btn-dark" disabled={busy} onClick={onBuild}>Trace and build feeder</button>
    </div>
  )
}

/* ---------------------------------------------------------------- feeder */

/** Inspector slot with nothing selected: the feeder itself. */
export function FeederFacts({ feeder, options }) {
  const t = feeder.topology || {}
  const e = feeder.electrical || {}
  const b = feeder.acpf_breakdown || {}
  const sep = options?.feeder_separability
  return (
    <div className="wb-block">
      <span className="wb-kicker">Feeder</span>
      <span className="wb-ins-name">{feeder.name || feeder.feeder_id}</span>
      {feeder.request?.lat != null && (
        <span className="wb-small wb-mono">
          {num(feeder.request.lat, 4)}, {num(feeder.request.lon, 4)} · {num(feeder.request.kv, 1)} kV
          · {num(feeder.request.rating_mva, 1)} MVA
        </span>
      )}
      <Facts rows={[
        ['Buses', t.n_bus], ['Lines', t.n_line],
        ['Can host a station', feeder.geometry?.n_eligible],
        ['Mean path from the head', t.mean_path_km == null ? '—' : `${num(t.mean_path_km, 3)} km`],
        ['Longest path', t.longest_path_km == null ? '—' : `${num(t.longest_path_km, 3)} km`],
        ['Lowest voltage, no chargers', `${num(e.base_vmin, 5)} pu`],
        ['Voltage drop, no chargers', e.total_drop_pct == null ? '—' : `${num(e.total_drop_pct, 2)} %`],
        ['Connected load', e.load_p_mw_total == null ? '—' : `${num(e.load_p_mw_total, 3)} MW`],
        ['Power flows spent building it', feeder.acpf_solves_spent,
          b.init_worker != null ? `(${b.init_worker} bootstrap · ${b.base_block} base · ${b.sbp} ladder)` : null],
      ]} />
      {sep?.references?.length >= 2 && (
        <div className="py-sep" title={sep.note}>
          <span className="wb-kicker">{sep.label}</span>
          <div className="wb-table-scroll">
            <table>
              <thead><tr><th>feeder</th><th>drop %</th><th>path km</th></tr></thead>
              <tbody>
                <tr className="py-this"><td>this feeder</td><td>{num(e.total_drop_pct, 3)}</td><td>{num(t.mean_path_km, 3)}</td></tr>
                {sep.references.map((r) => (
                  <tr key={r.name}><td>{r.name}<br /><span className="wb-meta">{r.reads_as}</span></td>
                    <td>{num(r.total_drop_pct, 3)}</td><td>{num(r.mean_path_km, 3)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="wb-small">{sep.note}</p>
        </div>
      )}
    </div>
  )
}

/** Inspector slot with a bus selected: what each screened placement says about it. */
export function BusInspector({ feeder, bus, view, onClose }) {
  const g = (feeder?.geometry?.buses || []).find((b) => b.bus_id === bus)
  const rows = (view?.d?.rows || []).filter((r) => r.bus_id === bus)
  const inPlacements = (feeder?.placements || []).filter((p) => (p.buses || []).includes(bus))
  return (
    <div className="wb-block">
      <div className="wb-ins-head">
        <div><span className="wb-kicker">Bus</span><span className="wb-ins-name">{bus}</span></div>
        <button className="wb-chipbtn wb-pill" onClick={onClose}>Feeder</button>
      </div>
      {g && (
        <Facts rows={[
          ['Can host a station', g.eligible ? 'yes' : 'no'],
          ['Load', g.p_mw == null ? '—' : `${num(g.p_mw * 1000, 1)} kW`],
          ['In placements', inPlacements.length ? inPlacements.map((p) => p.pid).join(', ') : 'none'],
        ]} />
      )}
      {rows.length > 0 ? (
        <div className="wb-table-scroll">
          <table>
            <thead><tr><th>placement</th><th>q̂₀₅ pu</th><th>±σ</th><th>verdict</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pid}>
                  <td>{r.pid}</td><td>{num(r.q05_hat, 4)}</td><td>{num(r.sigma, 4)}</td>
                  <td><span className={`py-pill ${r.verdict}`}>{r.verdict}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="wb-small">Not screened yet — screen the feeder to see its verdicts here.</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- limit */

/**
 * The voltage limit. Moving it RE-COUNTS the stored numbers — no GPU, no model, no solver —
 * so it can follow the slider. The control's range is the API's (`/v1/options.vmin`), not one
 * this client chose; the screen's own interval span is drawn on the track as a separate fact.
 */
export function VoltageLimit({ view, options, pending, onVmin, run }) {
  const opt = options?.vmin
  if (!view || !opt?.min) return null
  const s = view.d.summary
  const rows = view.d.rows || []
  const lo = rows.reduce((m, r) => (r.lo != null && (m == null || r.lo < m) ? r.lo : m), null)
  const hi = rows.reduce((m, r) => (r.hi != null && (m == null || r.hi > m) ? r.hi : m), null)
  const w = opt.max - opt.min
  const at = (v) => `${Math.max(0, Math.min(100, (100 * (v - opt.min)) / w))}%`
  return (
    <div className="wb-block">
      <div className="wb-block-head">
        <span className="wb-h" title={opt.explainer}>Voltage limit</span>
        <span className="wb-mono">{num(pending ?? view.d.vmin, 4)} pu</span>
      </div>
      <VerdictStrip summary={s} />
      <div className="py-track">
        {lo != null && hi != null && <div className="py-span" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
                                         title="the span of every interval this screen returned" />}
        <input type="range" min={opt.min} max={opt.max} step={opt.step}
               value={pending ?? view.d.vmin} onChange={(e) => onVmin(Number(e.target.value))} />
      </div>
      <div className="py-track-ends wb-mono"><span>{num(opt.min, 3)}</span><span>{num(opt.max, 3)}</span></div>
      <div className="wb-result">
        <span>Undecided by screening</span>
        <b className="wb-mono">{(Number(s.frac_inconclusive) * 100).toFixed(1)} %</b>
      </div>
      <p className="wb-small">{s.inconclusive} of {s.n} rows the screen will not call. The run stays
        at {num(view.name === 'recount' ? view.d.run_vmin_unchanged : run?.vmin, 4)} pu — moving this asks a question, it does not change the run.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- placements */

/** "Your changes" slot: which stored placements to screen, which one to colour, and placing new ones. */
export function Placements({ feeder, pids, setPids, solvedPids, colour, setColour, screened,
                             placing, setPlacing, picked, setPicked, options, onAppend, busy }) {
  const all = feeder.placements || []
  const sel = pids === null ? null : new Set(pids)
  const toggle = (pid) => {
    const cur = new Set(pids === null ? all.map((p) => p.pid) : pids)
    if (cur.has(pid)) cur.delete(pid); else cur.add(pid)
    setPids(cur.size && cur.size < all.length ? [...cur].sort((a, b) => a - b) : (cur.size ? null : []))
  }
  const sizingOpt = options?.station_sizing
  return (
    <div className="wb-block">
      <div className="wb-block-head">
        <span className="wb-h">Placements</span>
        <span className="wb-mono wb-small">{pids === null ? `all ${all.length}` : `${pids.length} of ${all.length}`}</span>
      </div>
      <div className="wb-row">
        <button className={`wb-chipbtn${pids === null ? ' on' : ''}`} onClick={() => setPids(null)}>All</button>
        <button className={`wb-chipbtn${pids?.length === 0 ? ' on' : ''}`} onClick={() => setPids([])}>None</button>
      </div>
      <div className="py-picklist">
        {all.map((p) => {
          const on = pids === null || sel.has(p.pid)
          const isScreened = screened?.includes(p.pid)
          return (
            <div key={p.pid} className={`py-pickrow${colour === p.pid ? ' coloured' : ''}`}>
              <button className={`py-ck${on ? ' on' : ''}`} onClick={() => toggle(p.pid)}
                      title={on ? 'screened in the next run' : 'left out of the next run'} />
              <button className="py-pick-main" onClick={() => setColour(p.pid)}
                      title="draw this placement's stations, and its verdicts once screened">
                <b>P{p.pid}</b>
                <span className="wb-mono">{p.m} st · {num(p.ev_kw_total, 1)} kW</span>
                {p.origin === 'user' && <span className="py-pill feasible">yours</span>}
                {solvedPids?.has(p.pid) && <span className="py-pill solved">solved</span>}
                {isScreened && colour !== p.pid && <span className="wb-meta">screened</span>}
              </button>
            </div>
          )
        })}
      </div>

      {!placing ? (
        <button className="wb-btn" disabled={busy} onClick={() => { setPicked([]); setPlacing(true) }}>
          Place stations…
        </button>
      ) : (
        <div className="py-place">
          <span className="wb-kicker">Placing — click buses on the map</span>
          <span className="wb-mono wb-small">{picked.length ? picked.join(', ') : 'none yet'}</span>
          {picked.length === 1 && (
            <p className="wb-small">One station is a legitimate placement and a weak anchor — if you
              later solve it, the decision point says so with the measured figures.</p>
          )}
          {/* Station sizing is part of how the FEEDER was built (its request), not of a
              placement: every placement on it is sized the same way, and the stopping rule
              follows from it. Shown, not offered — a control here would change nothing. */}
          {feeder.request?.station_sizing && (
            <p className="wb-small" title={sizingOpt?.explainer}>Sized by <code>{feeder.request.station_sizing}</code>
              {sizingOpt?.recommended_k?.[feeder.request.station_sizing] != null
                && <> — the anchor loop recommends k = {sizingOpt.recommended_k[feeder.request.station_sizing]}</>}.</p>
          )}
          <div className="wb-row">
            <button className="wb-btn wb-btn-dark" disabled={!picked.length || busy} onClick={onAppend}
                    title="adds only the new placement — the feeder's own coordinate is already paid for">
              Add this placement</button>
            <button className="wb-btn" onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
            <button className="wb-btn" onClick={() => setPlacing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- display */

export function MapDisplay({ base, setBase, showVerdicts, setShowVerdicts, hasVerdicts, Toggle }) {
  return (
    <div className="wb-block">
      <span className="wb-h">Display</span>
      <Toggle label="Verdicts on buses" on={showVerdicts} disabled={!hasVerdicts}
              onClick={() => setShowVerdicts(!showVerdicts)} />
      <div className="wb-f">
        <div className="wb-field-label"><label title="the ground the feeder is drawn on — a preference, not a measurement">Basemap</label></div>
        <select className="wb-select" value={base} onChange={(e) => setBase(e.target.value)}>
          {BASEMAPS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- start lists */

export function BuiltFeeders({ feeders, current, onOpen, onRename, onDelete, busy }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [inUse, setInUse] = useState(null)
  const del = async (fid, force) => {
    setInUse(null)
    try { await onDelete(fid, force) } catch (e) { if (e?.code === 'FEEDER_IN_USE') setInUse({ fid, msg: e.detail?.message }) }
  }
  return (
    <div className="wb-block">
      <div className="wb-block-head">
        <span className="wb-h">Built feeders</span>
        <span className="wb-mono wb-small">{feeders?.length ?? 0}</span>
      </div>
      {!feeders?.length && <p className="wb-small">Nothing built on this server yet. Drop a pin and trace one.</p>}
      {(feeders || []).map((f) => (
        <div key={f.feeder_id} className={`wb-edit${current === f.feeder_id ? ' py-current' : ''}`}>
          {editing === f.feeder_id ? (
            <div className="wb-field" style={{ flex: 1 }}>
              <input autoFocus value={draft} placeholder="name this feeder"
                     onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') { onRename(f.feeder_id, draft); setEditing(null) }
                       if (e.key === 'Escape') setEditing(null)
                     }} />
            </div>
          ) : (
            <button className="py-feeder-open" disabled={busy} onClick={() => onOpen(f.feeder_id)}>
              <b>{f.label}</b>
              <span className="wb-mono wb-meta">{f.n_bus} buses · {f.n_eligible} can host · {f.n_placements} placements</span>
            </button>
          )}
          <div className="wb-row" style={{ flex: 'none' }}>
            <button className="wb-chipbtn wb-pill" title="a name is not part of its identity, so this cannot change its feeder_id"
                    onClick={() => { setDraft(f.name || ''); setEditing(f.feeder_id) }}>{f.name ? 'rename' : 'name'}</button>
            <button className="wb-chipbtn wb-pill" onClick={() => del(f.feeder_id, false)}>delete</button>
          </div>
          {inUse?.fid === f.feeder_id && (
            <div className="py-confirm">
              <p className="wb-small">{inUse.msg}</p>
              <div className="wb-row">
                <button className="wb-chipbtn wb-pill dark" onClick={() => del(f.feeder_id, true)}>delete it and its runs</button>
                <button className="wb-chipbtn wb-pill" onClick={() => setInUse(null)}>keep it</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- library */

/** Inspector slot in library mode: which feeder, which loading, which hold-out, which limit. */
export function LibraryPicker({ cat, sel, setSel, options, vmin, setVmin, topo, busy, onRun }) {
  const [seed, setSeed] = useState(() => (sel.feeder_id ? sel.feeder_id.split('__')[0] : null))
  if (cat === false) {
    return (
      <div className="wb-block">
        <span className="wb-kicker">Library</span>
        <p className="wb-small">The feeder library is not on this server, so no new study can run —
          the reason is under Needs attention. Studies already stored still open, below.</p>
      </div>
    )
  }
  if (!cat) return <div className="wb-block"><span className="wb-kicker">Library</span><p className="wb-small">Reading the library…</p></div>
  const s = cat.seeds.find((x) => x.seed === seed)
  const opt = options?.vmin
  return (
    <div className="wb-block">
      <span className="wb-kicker">Library study</span>
      <span className="wb-ins-name">Where the truth is known</span>
      <p className="wb-small">{cat.cost_note}</p>
      <div className="wb-f">
        <div className="wb-field-label"><label>Network ({cat.n_seeds})</label></div>
        <select className="wb-select" value={seed || ''} onChange={(e) => { setSeed(e.target.value); setSel({ ...sel, feeder_id: null, pids: null }) }}>
          <option value="">—</option>
          {cat.seeds.map((x) => <option key={x.seed} value={x.seed}>{x.seed} · {x.n_variants} variants</option>)}
        </select>
      </div>
      {s && (
        <div className="wb-f">
          <div className="wb-field-label"><label>Variant</label></div>
          <select className="wb-select" value={sel.feeder_id || ''} onChange={(e) => setSel({ ...sel, feeder_id: e.target.value || null, pids: null })}>
            <option value="">—</option>
            {s.variants.map((v) => <option key={v.feeder_id} value={v.feeder_id}>{v.variant}</option>)}
          </select>
        </div>
      )}
      <div className="wb-f">
        <div className="wb-field-label"><label title={options?.loadings?.explainer}>Loading</label></div>
        <div className="wb-row">
          {cat.arms.map((a) => (
            <button key={a} className={`wb-chipbtn${sel.arm === a ? ' on' : ''}`} onClick={() => setSel({ ...sel, arm: a })}>
              {options?.loadings?.labels?.[a] ?? a}</button>
          ))}
        </div>
      </div>
      <div className="wb-f">
        <div className="wb-field-label"><label>Hold out</label></div>
        {cat.hold_out_modes.map((m) => (
          <button key={m.id} className={`py-mode${sel.hold_out === m.id ? ' on' : ''}`} onClick={() => setSel({ ...sel, hold_out: m.id })}>
            <b>{m.name}</b><span>{m.claim}</span>
          </button>
        ))}
      </div>
      {opt?.min && (
        <div className="wb-f">
          <div className="wb-field-label"><label title={opt.explainer}>Voltage limit</label><span className="wb-mono">{num(vmin, 4)} pu</span></div>
          <input type="range" min={opt.min} max={opt.max} step={opt.step} value={vmin} onChange={(e) => setVmin(Number(e.target.value))} />
        </div>
      )}
      {topo && !topo.error && (
        <Facts rows={[
          ['Buses', topo.n_bus], ['Load buses', topo.n_load_buses],
          ['Total load', topo.total_p_mw == null ? '—' : `${num(topo.total_p_mw, 3)} MW`],
          ['Stored placements', (topo.placements || []).length,
            sel.pids?.length ? `(${sel.pids.length} chosen on the drawing)` : null],
          ...(topo.ops || []).map((o) => [`Variant op ${o.op}`, o.what]),
        ]} />
      )}
      <button className="wb-btn wb-btn-dark" disabled={!sel.feeder_id || busy} onClick={onRun}>
        Run leave-one-out study</button>
    </div>
  )
}

export function StoredStudies({ studies, onOpen }) {
  const list = studies?.studies || []
  return (
    <div className="wb-block">
      <div className="wb-block-head"><span className="wb-h">Stored studies</span><span className="wb-mono wb-small">{list.length}</span></div>
      {!list.length && <p className="wb-small">None yet. Every study this server runs is kept and can be reopened verbatim.</p>}
      {list.slice(0, 12).map((s) => (
        <div key={s.study_id} className="wb-edit">
          <span className="wb-mono">{s.feeder_id} · {s.hold_out} · {num(s.vmin, 3)} pu · MAE {num(s.mae_mpu, 3)} mpu</span>
          <button className="wb-chipbtn wb-pill" onClick={() => onOpen(s.study_id)}>Open</button>
        </div>
      ))}
    </div>
  )
}
