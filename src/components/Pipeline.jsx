import { motion, useReducedMotion } from 'framer-motion'

/*
  The one diagram the project actually needs: many formats in, one shared
  description in the middle, many engines out. Animated because the flow is the
  point -- but the particles carry meaning rather than decoration, since each
  one is a model crossing the boundary where things get lost.
*/

const SOURCES = [
  { label: '.dss', sub: 'OpenDSS', y: 46 },
  { label: '.m', sub: 'MATPOWER', y: 106 },
  { label: '.raw', sub: 'PSS®E', y: 166 },
  { label: 'sheet', sub: 'spreadsheet', y: 226 },
]

const ENGINES = [
  { label: 'OpenDSS', y: 76 },
  { label: 'PyPSA', y: 136 },
  { label: 'pandapower', y: 196 },
]

const IN = (y) => `M 150 ${y} C 250 ${y}, 300 136, 392 136`
const OUT = (y) => `M 508 136 C 600 136, 650 ${y}, 742 ${y}`

export default function Pipeline() {
  const still = useReducedMotion()

  return (
    <svg viewBox="0 0 900 272" className="pipeline" role="img"
         aria-label="Model files are read by deterministic importers into one shared Feeder IR, then emitted to solver engines.">
      <defs>
        <linearGradient id="flow" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent)" stopOpacity=".55" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* the wires */}
      {SOURCES.map((s, i) => (
        <g key={s.label}>
          <motion.path
            d={IN(s.y)} className="wire"
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.15 * i, ease: 'easeInOut' }}
          />
          {!still && (
            <circle r="3" className="spark">
              <animateMotion dur={`${3.2 + i * 0.35}s`} repeatCount="indefinite"
                             begin={`${i * 0.55}s`} path={IN(s.y)} />
            </circle>
          )}
        </g>
      ))}

      {ENGINES.map((e, i) => (
        <g key={e.label}>
          <motion.path
            d={OUT(e.y)} className="wire"
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.6 + 0.15 * i, ease: 'easeInOut' }}
          />
          {!still && (
            <circle r="3" className="spark">
              <animateMotion dur={`${3.4 + i * 0.4}s`} repeatCount="indefinite"
                             begin={`${1.2 + i * 0.6}s`} path={OUT(e.y)} />
            </circle>
          )}
        </g>
      ))}

      {/* the sources */}
      {SOURCES.map((s, i) => (
        <motion.g key={s.label}
                  initial={still ? false : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.08 * i }}>
          <rect x="16" y={s.y - 19} width="134" height="38" rx="7" className="node" />
          <text x="34" y={s.y + 1} className="node-label">{s.label}</text>
          <text x="142" y={s.y + 1} className="node-sub" textAnchor="end">{s.sub}</text>
        </motion.g>
      ))}

      {/* the middle, which is the whole argument */}
      <motion.g initial={still ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                style={{ transformOrigin: '450px 136px' }}>
        {!still && (
          <motion.rect
            x="392" y="104" width="116" height="64" rx="10" className="core-halo"
            animate={{ opacity: [0.16, 0.42, 0.16] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <rect x="392" y="104" width="116" height="64" rx="10" className="core" />
        <text x="450" y="129" className="core-label" textAnchor="middle">Feeder IR</text>
        <text x="450" y="150" className="core-sub" textAnchor="middle">value · unit · source · ref</text>
      </motion.g>

      {/* the engines */}
      {ENGINES.map((e, i) => (
        <motion.g key={e.label}
                  initial={still ? false : { opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.75 + 0.08 * i }}>
          <rect x="742" y={e.y - 19} width="142" height="38" rx="7" className="node" />
          <text x="813" y={e.y + 1} className="node-label" textAnchor="middle">{e.label}</text>
        </motion.g>
      ))}

      <text x="83" y="262" className="axis" textAnchor="middle">deterministic importers</text>
      <text x="813" y="262" className="axis" textAnchor="middle">validated engines</text>
    </svg>
  )
}
