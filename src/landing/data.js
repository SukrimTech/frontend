/*
 * The landing page's copy, lifted verbatim from `Sukrim Landing v2.dc.html`.
 *
 * The design repeats one row of markup ten times — five products, five
 * commercial-and-industrial offerings — changing only the words. Keeping the
 * words here and the markup in one component means a copy change is a one-line
 * edit rather than a hunt through near-identical blocks, and makes it obvious
 * when two rows have drifted apart in markup when they should not have.
 */

export const PRODUCTS = [
  {
    n: '01',
    art: 'assets/art-p1.svg',
    title: 'Technical Loss Estimation',
    tag: 'Losses',
    body: 'Separates what a feeder loses to physics from what it loses to everything else — conductor by conductor, transformer by transformer.',
  },
  {
    n: '02',
    art: 'assets/art-p2.svg',
    title: 'DERMS: Monitoring First',
    tag: 'Distributed energy',
    body: 'See every rooftop, battery and inverter on the feeder before trying to control any of them.',
  },
  {
    n: '03',
    art: 'assets/art-p3.svg',
    title: 'Short-Term Load Forecasting',
    tag: 'Forecasting',
    body: 'Hours-to-days demand per feeder and substation, with every assumption behind the curve written down beside it.',
  },
  {
    n: '04',
    art: 'assets/art-p4.svg',
    title: 'Distribution Transformer Health',
    tag: 'Assets',
    body: 'Loading, temperature and ageing for the thousands of transformers nobody has time to visit.',
  },
  {
    n: '05',
    art: 'assets/art-p5.svg',
    title: 'Theft & Non-Technical Loss Detection',
    tag: 'Revenue protection',
    body: 'Flags meters whose consumption does not reconcile with the energy that actually reached them.',
  },
]

export const COMMERCIAL = [
  {
    n: '01',
    art: 'assets/art-c1.svg',
    title: 'Building Energy Management',
    tag: 'Buildings',
    body: 'HVAC, lighting and plant metered floor by floor, with every saving traced back to the reading that shows it.',
  },
  {
    n: '02',
    art: 'assets/art-c2.svg',
    title: 'Peak Demand Management',
    tag: 'Demand charges',
    body: 'Keeps a site under its contracted maximum demand by shifting the loads that can wait.',
  },
  {
    n: '03',
    art: 'assets/art-c3.svg',
    title: 'Rooftop Solar & Storage Optimisation',
    tag: 'On-site energy',
    body: 'Decides when the battery charges, discharges or holds — against the tariff the site actually pays.',
  },
  {
    n: '04',
    art: 'assets/art-c4.svg',
    title: 'Power Quality Monitoring',
    tag: 'Power quality',
    body: 'Harmonics, sags and power factor at the incomer, caught before they become penalties or failed equipment.',
  },
  {
    n: '05',
    art: 'assets/art-c5.svg',
    title: 'Energy Bill & Tariff Analytics',
    tag: 'Billing',
    body: 'Reconciles every bill against the meter, and finds the tariff that fits how the site really runs.',
  },
]

export const FAILURES = [
  {
    letter: 'A.',
    title: 'A cable read in the wrong unit',
    body: 'A conductor table written in ohms per 1000 feet, read as ohms per kilometre. The network converged.',
    note: 'The usual sanity check — X/R ratio — is scale-invariant and cannot see it.',
  },
  {
    letter: 'B.',
    title: 'A generator quietly changed',
    body: 'Machines holding a voltage setpoint imported as fixed injections. The case solved.',
    note: 'Neither the emitter nor the importer read the control mode, so the round trip agreed with itself.',
  },
  {
    letter: 'C.',
    title: 'A solver that stopped early',
    body: 'An iteration limit left at its default. The case needed more than it was given.',
    note: 'Nothing in the output said the answer had not settled.',
  },
]

export const AGENTS = [
  {
    id: '01',
    name: 'Ariadne',
    tag: 'Power flow',
    body: 'Spreadsheets, .dss, .raw or .m in; a solved network, a violations report and an assumptions ledger out.',
    refuses: 'hosting capacity, time series, protection coordination, harmonics.',
  },
  {
    id: '02',
    name: 'Argus',
    tag: 'Fault analysis',
    body: 'IEC 60909 initial symmetrical and peak currents, at one bus or every bus, with the Thévenin impedances behind them.',
    refuses: 'relay grading, arc flash, series faults, transient stability.',
  },
  {
    id: '03',
    name: 'Themis',
    tag: 'Economic dispatch',
    body: 'Least-cost output of each machine, one period or many, with technical minima, ramp limits and optional unit commitment.',
    refuses: 'anything where the network binds. That is a different question.',
  },
  {
    id: '04',
    name: 'Ananke',
    tag: 'DC flow & linear OPF',
    body: 'Dispatch the network can actually carry — it keeps the network that Themis deliberately collapses to a single bus.',
    refuses: 'AC optimal power flow, security-constrained dispatch.',
  },
  {
    id: '05',
    name: 'Iris',
    tag: 'The diagram',
    body: 'Draws a network and paints any other agent’s answer onto it — the only agent that consumes another’s output.',
    refuses: 'producing an answer of its own.',
  },
  {
    id: '06',
    name: 'Hermes',
    tag: 'Routing',
    body: 'Decides which agent a request belongs to, and says so when none of them can serve it.',
    refuses: 'answering anything itself.',
  },
]

export const MARQUEE_TOP = [
  'Technical Loss Estimation',
  'DERMS: Monitoring First',
  'Short-Term Load Forecasting',
  'Distribution Transformer Health',
  'Theft & Non-Technical Loss Detection',
]

export const MARQUEE_BOTTOM = [
  'Ariadne · power flow',
  'Argus · fault analysis',
  'Themis · dispatch',
  'Ananke · linear OPF',
  'Iris · diagram',
  'Hermes · routing',
]
