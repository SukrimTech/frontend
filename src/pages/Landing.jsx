import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '../landing/landing.css'
import { s } from '../landing/css.js'
import { startMotion } from '../landing/motion.js'
import Carousel from '../landing/Carousel.jsx'
import {
  AGENTS, COMMERCIAL, FAILURES, MARQUEE_BOTTOM, MARQUEE_TOP, PRODUCTS,
} from '../landing/data.js'

/*
 * The Sukrim landing page, from `Sukrim Landing v2.dc.html`.
 *
 * The style strings are copied across verbatim and parsed by `s()` rather than
 * hand-converted to objects, so this file stays diffable against the design.
 * Motion lives in `../landing/motion.js` and is driven by the same data
 * attributes the design uses, so the markup here reads as the design does.
 *
 * Two deliberate departures from the file, both because this is an app and not
 * a static page: the design's `Workbench.dc.html` links become router links to
 * /workbench, and the page renders its own nav, so App hides the global header
 * on this route.
 */

const SHELL = "font-family:'Archivo',Helvetica,Arial,sans-serif;background:#FFFFFF;color:#111111;min-height:100vh;overflow-x:clip"
const WRAP = 'max-width:1440px;margin:0 auto;padding:0 clamp(20px,4vw,56px)'
const MONO = "font-family:'JetBrains Mono',monospace"
const H2 = 'grid-column:span 2;margin:0;font-weight:700;font-size:clamp(36px,5vw,76px);line-height:1;letter-spacing:-.035em;text-wrap:balance'
const HEAD_GRID = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(24px,4vw,64px);align-items:start'
const MARK = 'background-image:linear-gradient(#C6EBC5,#C6EBC5);background-repeat:no-repeat;background-size:100% 100%;padding:0 .06em'
const ROW = 'display:grid;grid-template-columns:48px minmax(0,6fr) minmax(0,4fr) 48px;gap:clamp(12px,2.5vw,40px);align-items:center;padding:clamp(24px,2.6vw,40px) 12px;border-bottom:1px solid #111111;transition:background .4s,padding .5s cubic-bezier(.2,.75,.2,1)'
const PILL_DARK = 'display:inline-flex;align-items:center;gap:12px;height:54px;padding:0 26px;border-radius:999px;background:#111111;color:#FFFFFF;font-weight:600;font-size:15px'
const PILL_OPEN = 'display:inline-flex;align-items:center;height:54px;padding:0 26px;border-radius:999px;border:1px solid #111111;font-weight:600;font-size:15px'
const MASK_WORD = 'display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em'

/** One word of a masked heading — the unit the `mask` reveal slides up. */
function Word({ children, style }) {
  return (
    <span style={s(MASK_WORD)}>
      <span data-w="1" style={s(style || 'display:inline-block')}>{children}</span>
    </span>
  )
}

/** A product / commercial row. Identical markup for both lists, by design. */
function Row({ item }) {
  return (
    <a href="#" className="sk-row" data-pv={item.art} data-hover="1" style={s(ROW)}
       style-hover="background:#C6EBC5;padding-left:28px">
      <span style={s(`${MONO};font-size:13px`)}>{item.n}</span>
      <span style={s('display:flex;flex-direction:column;gap:8px')}>
        <span style={s('font-size:clamp(28px,3.6vw,56px);font-weight:700;letter-spacing:-.035em;line-height:1')}>
          {item.title}
        </span>
        <span style={s(`${MONO};font-size:12px;text-transform:uppercase;letter-spacing:.05em`)}>
          {item.tag}
        </span>
      </span>
      <span style={s('display:flex;flex-direction:column;gap:14px')}>
        <span style={s('font-size:15px;line-height:1.55;text-wrap:pretty')}>{item.body}</span>
        <img data-thumb="1" src={item.art} alt="" style={s('display:none;width:100%;max-width:240px')} />
      </span>
      <span className="sk-row-arrow" style={s(`width:44px;height:44px;border-radius:50%;border:1px solid #111111;display:flex;align-items:center;justify-content:center;${MONO}`)}>
        →
      </span>
    </a>
  )
}

export default function Landing() {
  const root = useRef(null)
  useEffect(() => startMotion(root.current), [])
  // Below tablet width the section links fold into a menu; the design's single
  // row of six links does not fit a phone.
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])
  const SECTIONS = [
    ['#products', 'Utilities'], ['#ci', 'Buildings & industry'], ['#invariants', 'Invariants'],
    ['#method', 'Method'], ['#agents', 'Agents'],
  ]

  return (
    <div className="sk" ref={root} style={s(SHELL)}>

      {/* NAV */}
      <header data-nav="1" style={s('position:sticky;top:0;z-index:40;background:#FFFFFF;border-bottom:1px solid #111111;transition:transform .5s cubic-bezier(.2,.75,.2,1)')}>
        <div style={s(`${WRAP};height:72px;display:flex;align-items:center;justify-content:space-between;gap:24px`)}>
          <a href="#top" data-hover="1" style={s('display:flex;align-items:center;gap:12px')}>
            <img src="assets/sukrim-icon.svg" alt="" style={s('width:40px;height:40px;display:block;margin:-4px')} />
            <img src="assets/sukrim-wordmark.svg" alt="SUKRIM" style={s('height:22px;display:block')} />
          </a>
          <nav style={s("display:flex;align-items:center;gap:clamp(14px,2.4vw,36px);font-size:14px;font-weight:500;letter-spacing:.02em")}>
            {SECTIONS.map(([href, label]) => (
              <a key={href} href={href} className="sk-nav-link" data-hover="1" style-hover="text-decoration:underline">{label}</a>
            ))}
            <button type="button" className="sk-menu-btn" aria-expanded={menu} aria-controls="sk-menu"
                    onClick={() => setMenu(!menu)}>{menu ? 'Close' : 'Menu'}</button>
            <Link to="/workbench" data-mag="1" data-hover="1"
                  style={s('display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 18px;border-radius:999px;background:#111111;color:#FFFFFF')}
                  style-hover="background:#C6EBC5;color:#111111">
              Workbench <span style={s(MONO)}>→</span>
            </Link>
          </nav>
        </div>
        {menu && (
          <div id="sk-menu" className="sk-menu">
            {SECTIONS.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>
            ))}
          </div>
        )}
        <div data-progress="1" style={s('position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#111111;transform-origin:left center;transform:scaleX(0)')} />
      </header>

      {/* HERO */}
      <section id="top" style={s('position:relative')}>
        <div style={s('position:relative;max-width:1440px;margin:0 auto;padding:clamp(40px,6vw,88px) clamp(20px,4vw,56px) 0')}>
          <h1 data-rv="mask" style={s('margin:0;font-weight:800;font-size:clamp(52px,10.4vw,168px);line-height:.92;letter-spacing:-.045em')}>
            <Word>The</Word> <Word>dangerous</Word><br />
            <Word>failures</Word>{' '}
            <Word style="display:inline-block;background:#C6EBC5;padding:0 .08em">don’t</Word>{' '}
            <Word>crash.</Word>
          </h1>
          <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:clamp(24px,4vw,64px);margin-top:clamp(36px,5vw,72px);align-items:end')}>
            <p data-rv="up" data-d="500" style={s('margin:0;font-size:clamp(17px,1.4vw,21px);line-height:1.5;max-width:46ch;text-wrap:pretty')}>
              A units error converges. A generator silently demoted from voltage control to fixed injection converges. Both produce a document with the shape of an answer.
            </p>
            <p data-rv="up" data-d="620" style={s('margin:0;font-size:clamp(17px,1.4vw,21px);line-height:1.5;max-width:46ch;text-wrap:pretty')}>
              SUKRIM builds agents and products for the grid where every number in a report can be walked back to the line of the file it came from.
            </p>
            <div data-rv="up" data-d="740" style={s('display:flex;gap:12px;flex-wrap:wrap')}>
              <Link to="/workbench" data-mag="1" data-hover="1" style={s(PILL_DARK)}
                    style-hover="background:#C6EBC5;color:#111111">
                Open the workbench <span style={s(MONO)}>→</span>
              </Link>
              <a href="#products" data-mag="1" data-hover="1" style={s(PILL_OPEN)} style-hover="background:#C6EBC5">
                See products
              </a>
            </div>
          </div>
        </div>
        <div style={s('position:relative;margin-top:clamp(40px,5vw,72px);aspect-ratio:16/9;max-width:1600px;margin-left:auto;margin-right:auto;overflow:hidden')}>
          {/* 13% larger than the box. The sketch has a blank margin of at
              least 6.8% on every side (measured from the rendered file), and
              the overflow trims 5.8% -- so only blank paper is cut, never the
              drawing. The lens measures this frame, so it stays in register. */}
          <div data-lens="1" style={s('position:absolute;inset:-6.5%')}>
            <img data-lens-base="1" src="assets/art-hero.svg"
                 alt="Concept sketch: transmission towers feeding a substation, with a green wash tracing the day’s load"
                 style={s('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;opacity:.4')} />
            <img data-lens-clear="1" src="assets/art-hero.svg" alt="" aria-hidden="true"
                 style={s('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;clip-path:circle(0px at 50% 50%)')} />
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div data-marquee="1" data-dir="1" style={s('border-top:1px solid #111111;border-bottom:1px solid #111111;overflow:hidden;white-space:nowrap;padding:22px 0')}>
        <div style={s('display:inline-flex;align-items:center;gap:40px;will-change:transform;font-size:clamp(28px,4vw,60px);font-weight:700;letter-spacing:-.03em')}>
          {[...MARQUEE_TOP, ...MARQUEE_TOP].map((label, i) => (
            <span key={`${label}-${i}`} style={s('display:inline-flex;align-items:center;gap:40px')}>
              <span>{label}</span>
              <span style={s('width:.4em;height:.4em;border-radius:50%;background:#C6EBC5;border:1px solid #111111;flex:none')} />
            </span>
          ))}
        </div>
      </div>

      {/* PROBLEM */}
      <section id="problem">
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px)`)}>
          <div style={s(HEAD_GRID)}>
            <div className="sk-spacer" aria-hidden="true" />
            <h2 data-rv="up" style={s(H2)}>
              Every one of these solved, and every one was <span data-rv="mark" style={s(MARK)}>wrong.</span>
            </h2>
          </div>
          <div style={s('margin-top:clamp(56px,7vw,104px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:clamp(32px,4vw,64px)')}>
            {FAILURES.map((f, i) => (
              <article key={f.letter} data-rv="up" data-d={i ? i * 120 : undefined}
                       style={s('display:flex;flex-direction:column;gap:18px')}>
                <div data-rv="line" data-d={i ? i * 120 : undefined} style={s('height:1px;background:#111111')} />
                <span style={s(`${MONO};font-size:13px`)}>{f.letter}</span>
                <h3 style={s('margin:0;font-size:clamp(24px,2.2vw,30px);font-weight:600;letter-spacing:-.02em;line-height:1.15')}>{f.title}</h3>
                <p style={s('margin:0;font-size:16px;line-height:1.6;text-wrap:pretty')}>{f.body}</p>
                <p style={s('margin:0;font-size:14px;line-height:1.55;font-style:italic')}>{f.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section id="products">
        <div style={s('max-width:1440px;margin:0 auto;padding:0 clamp(20px,4vw,56px) clamp(72px,9vw,144px)')}>
          <div style={s(HEAD_GRID)}>
            <div className="sk-spacer" aria-hidden="true" />
            <h2 data-rv="up" style={s(H2)}>
              Grid intelligence, built on one <span data-rv="mark" style={s(MARK)}>honest</span> description of the network.
            </h2>
          </div>
          <div style={s('margin-top:clamp(48px,6vw,88px);display:flex;flex-direction:column')}>
            <div data-rv="line" style={s('height:1px;background:#111111')} />
            {PRODUCTS.map((p) => <Row key={p.n} item={p} />)}
          </div>
        </div>
      </section>

      {/* INVARIANTS */}
      <section id="invariants" style={s('background:#111111;color:#FFFFFF')}>
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px)`)}>
          <div style={s(HEAD_GRID)}>
            <div className="sk-spacer" aria-hidden="true" />
            <h2 data-rv="up" style={s(H2)}>Not guidelines. Enforced by types, schemas and a state machine.</h2>
          </div>
          <div style={s('margin-top:clamp(56px,7vw,104px);display:flex;flex-direction:column')}>
            <div data-rv="line" style={s('height:1px;background:#FFFFFF')} />
            {[
              ['I1', 'The model never computes an electrical quantity.',
                <>It maps a spreadsheet column to a field. It does not multiply, convert units, or estimate an impedance.</>],
              ['I2', 'The model never writes a model file.',
                <>Emitters are deterministic. A generated <span style={s(MONO)}>.dss</span> that is almost right is worse than one that fails to compile.</>],
              ['I3', 'Missing data raises a question, never a default.',
                <>If a value is needed and absent, the run stops and asks. A default is an assumption wearing a fact’s clothes.</>],
              ['I4', 'Every model is round-tripped.',
                <>Import, emit, re-import. The two must describe the same network. This is how loss gets caught.</>],
            ].map(([id, head, body]) => (
              <div key={id} style={s('display:contents')}>
                <div data-rv="up" className="sk-inv" style={s('display:grid;grid-template-columns:minmax(64px,1fr) minmax(0,5fr) minmax(0,4fr);gap:clamp(16px,3vw,48px);padding:clamp(28px,3vw,44px) 0;align-items:baseline')}>
                  <span style={s(`${MONO};font-size:14px;color:#C6EBC5`)}>{id}</span>
                  <h3 style={s('margin:0;font-size:clamp(22px,2.4vw,36px);font-weight:600;letter-spacing:-.02em;line-height:1.1')}>{head}</h3>
                  <p style={s('margin:0;font-size:16px;line-height:1.6;text-wrap:pretty')}>{body}</p>
                </div>
                <div data-rv="line" style={s('height:1px;background:#FFFFFF')} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* C&I */}
      <section id="ci">
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px) clamp(40px,5vw,72px)`)}>
          <div style={s(HEAD_GRID)}>
            <div className="sk-spacer" aria-hidden="true" />
            <div style={s('grid-column:span 2;display:flex;flex-direction:column;gap:28px')}>
              <h2 data-rv="up" style={s('margin:0;font-weight:700;font-size:clamp(36px,5vw,76px);line-height:1;letter-spacing:-.035em;text-wrap:balance')}>
                Behind the meter, the same <span data-rv="mark" style={s(MARK)}>honest</span> arithmetic.
              </h2>
              <p data-rv="up" data-d="120" style={s('margin:0;max-width:52ch;font-size:clamp(17px,1.4vw,20px);line-height:1.55;text-wrap:pretty')}>
                Offices, campuses and factories run their own small grids — rooftop solar, a battery, chillers, chargers and a contract with the utility. SUKRIM models the site the way it models a feeder, so every saving it reports can be checked.
              </p>
            </div>
          </div>
        </div>
        <div data-rv="fade" style={s('position:relative;aspect-ratio:16/9;max-width:1600px;margin:0 auto;overflow:hidden')}>
          {/* 11% larger: this sketch's narrowest blank margin is 5.5% (left
              and right), and the overflow trims 5.0%. */}
          <div data-lens="1" style={s('position:absolute;inset:-5.5%')}>
            <img data-replay="1" data-lens-base="1" src="assets/art-ci.svg"
                 alt="Concept sketch: an office building with rooftop solar, a factory, a battery container and EV chargers sharing one connection"
                 style={s('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;opacity:.4')} />
            <img data-replay="1" data-lens-clear="1" src="assets/art-ci.svg" alt="" aria-hidden="true"
                 style={s('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;clip-path:circle(0px at 50% 50%)')} />
          </div>
        </div>
        {/* The design lists these as rows, like the utilities above. They are
            a 3D carousel instead, so the two product families do not read as
            the same list twice. */}
        <div style={s('margin-top:clamp(48px,6vw,88px);border-top:1px solid #111111')}>
          <Carousel items={COMMERCIAL} figure={{
            src: 'assets/art-ci.svg',
            alt: 'Concept sketch: an office building with rooftop solar, a factory, a battery container and EV chargers sharing one connection',
          }} />
        </div>
      </section>

      {/* METHOD */}
      <section id="method">
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px)`)}>
          <div style={s(HEAD_GRID)}>
            <div className="sk-spacer" aria-hidden="true" />
            <h2 data-rv="up" style={s(H2)}>
              Many formats in. <span data-rv="mark" style={s(MARK)}>One description</span> in the middle. Many engines out.
            </h2>
          </div>
          <div data-rv="fade" style={s('margin-top:clamp(48px,6vw,88px)')}>
            <img data-replay="1" src="assets/art-flow.svg"
                 alt="Importers read .dss, .m, .raw and spreadsheets into the Feeder IR, which is emitted to OpenDSS, PyPSA, pandapower and HiGHS"
                 style={s('width:100%;height:auto;display:block')} />
          </div>
          <div style={s('margin-top:clamp(56px,7vw,104px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(32px,4vw,64px);align-items:start')}>
            <div data-rv="up" style={s('display:flex;flex-direction:column;gap:16px')}>
              <div data-rv="line" style={s('height:1px;background:#111111')} />
              <span style={s(`${MONO};font-size:12px;letter-spacing:.04em;text-transform:uppercase`)}>IEEE13Nodeckt.dss</span>
              <pre style={s(`margin:0;${MONO};font-size:14px;line-height:1.75;overflow:auto`)}>{`New Line.650632
  Bus1=RG60.1.2.3
  Bus2=632.1.2.3
  LineCode=mtx601
  Length=2000 units=ft`}</pre>
            </div>
            <div data-rv="up" data-d="120" style={s('display:flex;flex-direction:column;gap:16px')}>
              <div data-rv="line" data-d="120" style={s('height:1px;background:#111111')} />
              <span style={s(`${MONO};font-size:12px;letter-spacing:.04em;text-transform:uppercase`)}>The Feeder IR</span>
              <pre style={s(`margin:0;${MONO};font-size:14px;line-height:1.75;overflow:auto`)}>
{`"length": {
  "value":  2000.0,
  `}<span style={s('background:#C6EBC5')}>{'"unit":   "ft",'}</span>{`
  "source": "imported",
  "ref":    "line.650632.length"
}`}
              </pre>
            </div>
            <p data-rv="up" data-d="240" style={s('margin:0;font-size:17px;line-height:1.65;text-wrap:pretty')}>
              <b style={s(`${MONO};font-weight:500`)}>unit</b> makes a scale error visible.{' '}
              <b style={s(`${MONO};font-weight:500`)}>source</b> lets a report say <em>this was assumed, not measured</em>.{' '}
              <b style={s(`${MONO};font-weight:500`)}>ref</b> walks you back to the line of the file. Units are recorded, never normalised — each emitter converts at its own boundary.
            </p>
          </div>
        </div>
      </section>

      {/* AGENTS */}
      <section id="agents" style={s('border-top:1px solid #111111')}>
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:clamp(40px,6vw,120px);align-items:start`)}>
          <div style={s('position:sticky;top:120px;display:flex;flex-direction:column;gap:28px')}>
            <h2 data-rv="up" style={s('margin:0;font-weight:700;font-size:clamp(36px,4.4vw,68px);line-height:1;letter-spacing:-.035em;text-wrap:balance')}>
              What each one refuses is as important as what it solves.
            </h2>
            <div data-rv="up" data-d="150" style={s('display:flex;align-items:baseline;gap:14px')}>
              <span data-agent-idx="1" style={s('font-size:clamp(88px,10vw,160px);font-weight:800;letter-spacing:-.06em;line-height:.85;background:#C6EBC5;padding:0 .06em')}>01</span>
              <span style={s(`${MONO};font-size:14px`)}>/ 06</span>
            </div>
          </div>
          <div style={s('display:flex;flex-direction:column;gap:clamp(48px,6vw,88px)')}>
            {AGENTS.map((a) => (
              <article key={a.id} data-agent={a.id} data-rv="up" style={s('display:flex;flex-direction:column;gap:14px')}>
                <div data-rv="line" style={s('height:1px;background:#111111')} />
                <div style={s('display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap')}>
                  <h3 style={s('margin:0;font-size:clamp(36px,4vw,60px);font-weight:700;letter-spacing:-.04em;line-height:1')}>{a.name}</h3>
                  <span style={s(`${MONO};font-size:12px;text-transform:uppercase;letter-spacing:.05em`)}>{a.tag}</span>
                </div>
                <p style={s('margin:0;font-size:16px;line-height:1.6;text-wrap:pretty')}>{a.body}</p>
                <p style={s('margin:0;font-size:14px;line-height:1.55')}>
                  <b style={s('font-weight:600')}>Refuses —</b> {a.refuses}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TRACEABILITY */}
      <section style={s('border-top:1px solid #111111')}>
        <div style={s(`${WRAP};padding:clamp(72px,9vw,144px) clamp(20px,4vw,56px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:clamp(40px,6vw,120px);align-items:center`)}>
          <div data-rv="wipe" style={s('position:relative')}>
            <div data-lens="1" style={s('position:relative')}>
              <img data-replay="1" data-lens-base="1" src="assets/art-plan.svg"
                   alt="Concept site plan: a feeder running along roads to parcels, one route traced in green to a single meter"
                   style={s('width:100%;height:auto;display:block;opacity:.4')} />
              <img data-replay="1" data-lens-clear="1" src="assets/art-plan.svg" alt="" aria-hidden="true"
                   style={s('position:absolute;inset:0;width:100%;height:100%;display:block;clip-path:circle(0px at 50% 50%)')} />
            </div>
          </div>
          <div style={s('display:flex;flex-direction:column;gap:32px')}>
            <h2 data-rv="up" style={s('margin:0;font-weight:700;font-size:clamp(34px,4.2vw,64px);line-height:1;letter-spacing:-.035em;text-wrap:balance')}>
              Drawn like a plan. Every line has somewhere it <span data-rv="mark" style={s(MARK)}>came from.</span>
            </h2>
            <p data-rv="up" data-d="120" style={s('margin:0;max-width:46ch;font-size:17px;line-height:1.6;text-wrap:pretty')}>
              A units error, a demoted generator, an earthed star point that was never earthed — each converges. The shared description exists so every one of them has somewhere to be caught, and every figure can be followed home.
            </p>
            <div data-rv="up" data-d="220" style={s('display:flex;gap:12px;flex-wrap:wrap')}>
              <Link to="/docs" data-mag="1" data-hover="1" style={s(PILL_OPEN)} style-hover="background:#C6EBC5">
                Read the IR spec
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={s('background:#C6EBC5;border-top:1px solid #111111;overflow:hidden')}>
        <div style={s('max-width:1440px;margin:0 auto;padding:clamp(80px,10vw,160px) clamp(20px,4vw,56px) clamp(48px,6vw,80px);display:flex;flex-direction:column;gap:clamp(32px,4vw,56px)')}>
          <h2 data-rv="mask" style={s('margin:0;font-weight:800;font-size:clamp(52px,9vw,148px);line-height:.92;letter-spacing:-.045em')}>
            <Word>Hand</Word> <Word>an</Word> <Word>agent</Word><br />
            <Word>a</Word> <Word>network.</Word>
          </h2>
          <div style={s('display:flex;justify-content:space-between;align-items:end;gap:32px;flex-wrap:wrap')}>
            <p data-rv="up" style={s('margin:0;max-width:44ch;font-size:clamp(17px,1.4vw,20px);line-height:1.5;text-wrap:pretty')}>
              Upload a model, ask a question, read a report where every figure walks back to its source — and every assumption is named as one.
            </p>
            <Link to="/workbench" data-mag="1" data-hover="1" data-rv="up" data-d="120"
                  style={s('display:inline-flex;align-items:center;gap:12px;height:64px;padding:0 32px;border-radius:999px;background:#111111;color:#FFFFFF;font-weight:600;font-size:16px')}
                  style-hover="background:#FFFFFF;color:#111111">
              Run a study <span style={s(MONO)}>→</span>
            </Link>
          </div>
        </div>
        <div data-marquee="1" data-dir="-1" style={s('border-top:1px solid #111111;overflow:hidden;white-space:nowrap;padding:18px 0')}>
          <div style={s(`display:inline-flex;align-items:center;gap:32px;will-change:transform;${MONO};font-size:clamp(14px,1.2vw,18px);text-transform:uppercase;letter-spacing:.06em`)}>
            {[...MARQUEE_BOTTOM, ...MARQUEE_BOTTOM].map((label, i) => (
              <span key={`${label}-${i}`} style={s('display:inline-flex;align-items:center;gap:32px')}>
                <span>{label}</span><span>✕</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={s('background:#111111;color:#FFFFFF')}>
        <div style={s(`${WRAP};padding:clamp(56px,7vw,96px) clamp(20px,4vw,56px) 32px`)}>
          <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:40px;align-items:start')}>
            <div style={s('display:flex;flex-direction:column;gap:18px')}>
              <img src="assets/sukrim-icon.svg" alt="SUKRIM" style={s('width:64px;height:64px;display:block;margin:-6px')} />
              <p style={s('margin:0;font-size:15px;line-height:1.55;max-width:28ch')}>
                Agentic systems and grid intelligence for power engineering.
              </p>
            </div>
            <div style={s('display:flex;flex-direction:column;gap:10px;font-size:15px')}>
              <span style={s(`${MONO};font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#C6EBC5;margin-bottom:6px`)}>Products</span>
              <a href="#products" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">Loss estimation</a>
              <a href="#products" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">DERMS</a>
              <a href="#products" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">Load forecasting</a>
            </div>
            <div style={s('display:flex;flex-direction:column;gap:10px;font-size:15px')}>
              <span style={s(`${MONO};font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#C6EBC5;margin-bottom:6px`)}>Read</span>
              <Link to="/docs" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">Documentation</Link>
              <a href="#invariants" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">Invariants</a>
              <a href="#" data-hover="1" style={s('color:#FFFFFF')} style-hover="text-decoration:underline">Contact</a>
            </div>
          </div>
          <div data-rv="mask" style={s('margin-top:clamp(56px,8vw,112px);overflow:hidden')}>
            <img data-w="1" src="assets/sukrim-wordmark.svg" alt="SUKRIM"
                 style={s('display:block;width:100%;height:auto;filter:brightness(0) invert(1)')} />
          </div>
          <div style={s(`margin-top:32px;padding-top:20px;border-top:1px solid #FFFFFF;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;${MONO};font-size:12px;letter-spacing:.04em;text-transform:uppercase`)}>
            <span>© 2026 SUKRIM</span>
            <span>Every figure traceable</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
