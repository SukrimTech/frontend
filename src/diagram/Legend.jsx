import { BINDING, RAMPS } from './tokens.js'

/*
  The legend, and the one thing it must not omit.

  The fault ramp is logarithmic — IEEE 13 runs 2.3 kA to 2,311 kA — and a
  reader who assumes it is linear misjudges by a factor of a hundred. So the
  scale says so, on the strip, not in a tooltip.
*/

const OVERLAYS = [
  { id: 'flow', name: 'power flow', what: 'bus voltage pu · branch loading %' },
  { id: 'fault', name: 'fault levels', what: 'bus fault current kA · source-to-fault path' },
  { id: 'network', name: 'network flows', what: 'nodal price · signed MW and % loading' },
  { id: 'dispatch', name: 'dispatch', what: 'which machines are running' },
]

export default function Legend({ overlay, available = [], onChoose = () => {}, theme = 'light' }) {
  return (
    <div className="legend">
      <div className="legend-switch">
        {OVERLAYS.map((o) => {
          const enabled = available.includes(o.id)
          return (
            <button key={o.id} className={`chip ${overlay?.id === o.id ? 'on' : ''}`}
                    disabled={!enabled} onClick={() => onChoose(o.id)}
                    title={enabled ? o.what : 'run the study that produces this first'}>
              {o.name}
            </button>
          )
        })}
      </div>

      {overlay?.busRamp && (
        <Scale kind={overlay.busRamp} theme={theme} label="bus" />
      )}
      {overlay?.branchRamp && (
        <Scale kind={overlay.branchRamp} theme={theme} label="branch"
               extra={[{ hex: BINDING[theme] || BINDING.light, label: 'binding' }]} />
      )}

      <div className="legend-note">
        A branch that states no rating is drawn faint and never coloured by
        loading — <em>unrated</em> is not <em>lightly loaded</em>.
      </div>
    </div>
  )
}

function Scale({ kind, theme, label, extra = [] }) {
  const ramp = RAMPS[kind]
  if (!ramp) return null
  const stops = (ramp[theme] || ramp.light).slice(0, kind === 'load' ? 5 : undefined)
  return (
    <div className="scale">
      <div className="scale-head mono">
        {label} · {kind}{ramp.log && <span className="scale-log"> log₁₀</span>}
      </div>
      <div className="scale-strip">
        {stops.map((hex, i) => <i key={i} style={{ background: hex }} />)}
        {extra.map((e, i) => <i key={`x${i}`} style={{ background: e.hex }} className="scale-extra" />)}
      </div>
      <div className="scale-ticks mono">
        {ramp.labels.slice(0, stops.length).map((t, i) => <span key={i}>{t}</span>)}
        {extra.map((e, i) => <span key={`x${i}`}>{e.label}</span>)}
      </div>
    </div>
  )
}
