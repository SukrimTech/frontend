import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAPTILER_KEY } from '../config.js'

/*
  The feeder on the ground — grid-yukti's two Leaflet maps (dropping the feeder head, and the
  feeder that came back), as one component that fills the Workbench's stage.

  Nothing here computes a quantity. A map is a projection of `geometry.buses[].lat/lon` onto
  the screen; every number beside it goes through the side panel like everywhere else.
  `eligible` is drawn as given — eligibility is physics, not a preference (U5) — so a bus that
  cannot host a station is not clickable, and a click is never relocated to a neighbour.

  Carried over because each one was paid for:
    * SHAPE carries the verdict, not colour alone: circle feasible, square infeasible, diamond
      inconclusive. The third verdict has equal weight and has to survive a projector.
    * The layer is built once per geometry and RESTYLED on selection, never rebuilt — a
      rebuild per click tore down every marker and left stale handles.
    * The click handler is read at click time through a ref, so deselecting a bus works.
    * Markers are sized from the zoom (`--bus`), because at the fitted view buses crowd and a
      fixed 10 px marker leaves half of them unreachable by pointer (P3-16).
    * `fitBounds` is never animated: an animated fit that outlives the component throws.
    * The wheel belongs to the page unless the map has focus — Leaflet's own answer.
    * Tiles are the one off-origin dependency and are allowed to fail: the basemap is dropped
      and says so, and the feeder stays drawn, because nothing that matters needs a tile.
*/

// ⚠ Checked from this machine on 2026-10-02: CARTO's free basemaps (grid-yukti's default) now
// answer every tile with an "API KEY REQUIRED" watermark, and tile.openstreetmap.org refuses
// tile requests from apps outside its usage policy.
//
// So: with a MapTiler key (VITE_MAPTILER_KEY, see .env.example) the maps use MapTiler's
// raster tiles — sharp on retina screens via {r} = "@2x", labelled, and a proper satellite
// layer. Without one they fall back to Esri's keyless tiles, which work but are coarser.
// A browser map key is public by nature: restrict it to your domains in MapTiler's dashboard.
const MAPTILER = (style, ext = 'png') =>
  `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}{r}.${ext}?key=${MAPTILER_KEY}`
const MAPTILER_ATTR = '© MapTiler © OpenStreetMap contributors'

const ESRI_BASEMAPS = [
  { id: 'light', label: 'Light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', maxZoom: 20, maxNativeZoom: 16,
    retina: 'split' },
  { id: 'streets', label: 'Streets',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', maxZoom: 20, maxNativeZoom: 19,
    retina: 'split' },
  { id: 'satellite', label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxZoom: 20, maxNativeZoom: 19,
    retina: 'split', dark: true },
]

const MAPTILER_BASEMAPS = [
  { id: 'light', label: 'Light', url: MAPTILER('dataviz-light'), attribution: MAPTILER_ATTR,
    maxZoom: 20, maxNativeZoom: 20, retina: 'url' },
  { id: 'streets', label: 'Streets', url: MAPTILER('streets-v2'), attribution: MAPTILER_ATTR,
    maxZoom: 20, maxNativeZoom: 20, retina: 'url' },
  { id: 'satellite', label: 'Satellite', url: MAPTILER('hybrid', 'jpg'), attribution: MAPTILER_ATTR,
    maxZoom: 20, maxNativeZoom: 20, retina: 'url', dark: true },
]

export const BASEMAPS = [
  ...(MAPTILER_KEY ? MAPTILER_BASEMAPS : ESRI_BASEMAPS),
  { id: 'none', label: 'Plain', url: null, attribution: null, maxZoom: 20 },
]

const BASEMAP_KEY = 'pythia-basemap'
export function storedBasemap() {
  try {
    const v = localStorage.getItem(BASEMAP_KEY)
    if (v && BASEMAPS.some((b) => b.id === v)) return v
  } catch { /* private mode: the default is a fine answer */ }
  return 'light'
}
export function rememberBasemap(id) {
  try { localStorage.setItem(BASEMAP_KEY, id) } catch { /* private mode */ }
}

// Not 1: a single tile can fail on a good connection. Not 50: the designed state should
// arrive while the user is still looking.
const TILE_FAILURES_BEFORE_GIVING_UP = 6

function sizeToZoom(map) {
  // Measured on the Jaipur 90-bus fixture at its fitted zoom: 6 px leaves 84 of 89 buses
  // reachable by pointer, 10 px leaves 43.
  const z = map.getZoom()
  const px = Math.min(15, 6 + Math.max(0, z - 14) * 2.2)
  map.getContainer().style.setProperty('--bus', `${px.toFixed(1)}px`)
}

function useLeaflet(ref, center, zoom, basemap) {
  const [map, setMap] = useState(null)
  const [tiles, setTiles] = useState('loading')
  const layerRef = useRef(null)

  // ⚠ `[]`, and it has to be: a dependency on a ref re-runs once, silently, and the cleanup
  // then removes the map that every later marker is added to.
  useEffect(() => {
    if (!ref.current) return undefined
    const m = L.map(ref.current, {
      center, zoom, zoomControl: true, zoomSnap: 0.25, attributionControl: true, maxZoom: 20,
      scrollWheelZoom: 'center',
    })
    m.scrollWheelZoom.disable()
    m.on('focus', () => m.scrollWheelZoom.enable())
    m.on('blur', () => m.scrollWheelZoom.disable())
    setMap(m)
    // The stage can change size (tabs, window) and Leaflet caches the container size.
    const ro = new ResizeObserver(() => m.invalidateSize({ animate: false }))
    ro.observe(ref.current)
    return () => { ro.disconnect(); try { m.stop() } catch { /* gone */ } m.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swapping the ground is a layer swap, never a map rebuild — a rebuild would throw away the
  // pan and zoom the user just set.
  useEffect(() => {
    if (!map) return undefined
    const spec = BASEMAPS.find((b) => b.id === basemap) || BASEMAPS[0]
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    if (!spec.url) { setTiles('plain'); return undefined }
    setTiles('loading')
    const layer = L.tileLayer(spec.url, {
      attribution: spec.attribution, maxZoom: spec.maxZoom, maxNativeZoom: spec.maxNativeZoom,
      crossOrigin: 'anonymous', detectRetina: spec.retina === 'split',
    })
    let bad = 0
    let good = 0
    layer.on('tileerror', () => {
      bad += 1
      if (bad >= TILE_FAILURES_BEFORE_GIVING_UP && good === 0) {
        setTiles('unavailable')
        if (map.hasLayer(layer)) map.removeLayer(layer)
      }
    })
    layer.on('tileload', () => { good += 1; if (good === 1) setTiles('ok') })
    layer.addTo(map)
    layerRef.current = layer
    map.getContainer().dataset.basemapDark = spec.dark ? 'yes' : 'no'
    return () => { if (map.hasLayer(layer)) map.removeLayer(layer) }
  }, [map, basemap])

  return [map, tiles]
}

function TileState({ tiles }) {
  if (tiles === 'ok' || tiles === 'plain') return null
  return (
    <div className="py-tilestate">
      {tiles === 'unavailable'
        ? 'No basemap — the tile service is unreachable. The feeder is drawn from this server’s own data and is unaffected.'
        : 'Loading basemap…'}
    </div>
  )
}

/** Drop the feeder head: click the map, or drag the pin. */
export function PinMap({ lat, lon, onPick, basemap }) {
  const ref = useRef(null)
  const marker = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const [map, tiles] = useLeaflet(ref, [Number(lat), Number(lon)], 13, basemap)

  useEffect(() => {
    if (!map) return undefined
    const click = (e) => onPickRef.current(e.latlng.lat, e.latlng.lng)
    map.on('click', click)
    return () => map.off('click', click)
  }, [map])

  useEffect(() => {
    if (!map) return
    const la = Number(lat)
    const lo = Number(lon)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return
    if (!marker.current) {
      marker.current = L.marker([la, lo], {
        draggable: true, keyboard: false,
        icon: L.divIcon({ className: 'py-pin', html: '<i></i>', iconSize: [18, 18], iconAnchor: [9, 18] }),
      }).addTo(map)
      marker.current.on('dragend', (ev) => {
        const p = ev.target.getLatLng()
        onPickRef.current(p.lat, p.lng)
      })
    } else {
      marker.current.setLatLng([la, lo])
    }
  }, [map, lat, lon])

  return (
    <div className="py-map">
      <div className="py-map-canvas" ref={ref} data-map="pin" />
      <TileState tiles={tiles} />
      <div className="py-maphint">Click the map, or drag the pin, to place the feeder head</div>
    </div>
  )
}

/**
 * The feeder that came back, on the ground.
 *
 *   verdictByBus  {bus_id: verdict} for ONE placement, or null — a bus carries one verdict
 *                 per placement, so the map is coloured only when one is chosen
 *   picked        bus ids of the placement being looked at or built (ringed, tagged EV)
 *   pickedStyle   'full' ring + EV tag, or 'ring' alone for a set too large to label
 *   onBus         click handler for eligible buses (place mode and inspection)
 *   selected      the bus the inspector is showing
 */
export function FeederMap({ geometry, verdictByBus = null, picked = null, pickedStyle = 'full',
                            onBus = null, selected = null, basemap }) {
  const ref = useRef(null)
  const marks = useRef({})
  const onBusRef = useRef(onBus)
  onBusRef.current = onBus
  const bb = geometry?.bbox
  const centre = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : [0, 0]
  const [map, tiles] = useLeaflet(ref, centre, 14, basemap)

  useEffect(() => {
    if (!map || !geometry) return undefined
    const layer = L.layerGroup().addTo(map)
    marks.current = {}
    const at = {}
    for (const b of geometry.buses || []) {
      if (b.lat != null && b.lon != null) at[b.bus_id] = [b.lat, b.lon]
    }
    for (const ln of geometry.lines || []) {
      const a = at[ln.from]
      const z = at[ln.to]
      if (a && z) L.polyline([a, z], { className: 'py-edge', weight: 3 }).addTo(layer)
    }
    for (const b of geometry.buses || []) {
      const p = at[b.bus_id]
      if (!p) continue
      const v = verdictByBus ? verdictByBus[b.bus_id] : null
      const cls = b.is_slack ? 'slack' : !b.eligible ? 'none' : (v || 'plain')
      // Neither iconSize nor iconAnchor: Leaflet writes both inline, which would freeze the
      // marker and stop `--bus` from sizing it with the zoom.
      const m = L.marker(p, {
        icon: L.divIcon({ className: `py-bus ${cls}`, html: `<i></i>${b.is_slack ? '<b>SUB</b>' : ''}` }),
        keyboard: false,
        interactive: Boolean(b.eligible && !b.is_slack),
      }).addTo(layer)
      const el = m.getElement?.()
      if (b.eligible && !b.is_slack) {
        marks.current[b.bus_id] = { m }
        m.on('click', () => onBusRef.current?.(b.bus_id))
        if (el) el.setAttribute('data-bus', String(b.bus_id))
        m.bindTooltip(`bus ${b.bus_id}${v ? ` · ${v}` : ''}`, { direction: 'top', offset: [0, -6] })
      } else if (el) {
        el.setAttribute('data-bus-ineligible', String(b.bus_id))
      }
    }
    map.invalidateSize(false)
    if (bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: [24, 24], animate: false })
    sizeToZoom(map)
    return () => { layer.remove(); marks.current = {} }
  }, [map, geometry, verdictByBus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return undefined
    const on = () => sizeToZoom(map)
    map.on('zoomend', on)
    return () => map.off('zoomend', on)
  }, [map])

  const pickedKey = (picked || []).join(',')
  useEffect(() => {
    if (!map) return
    const chosen = new Set(picked || [])
    for (const [id, rec] of Object.entries(marks.current)) {
      if (!rec.m._map) continue
      const el = rec.m.getElement?.()
      if (!el) continue
      const on = chosen.has(Number(id))
      // The ring is ADDED; the verdict shape underneath is not replaced.
      el.classList.toggle('on', on)
      el.classList.toggle('ringonly', on && pickedStyle === 'ring')
      el.classList.toggle('sel', Number(id) === selected)
      let tag = el.querySelector('b.ev')
      if (on && pickedStyle === 'full' && !tag) {
        tag = document.createElement('b')
        tag.className = 'ev'
        tag.textContent = 'EV'
        el.appendChild(tag)
      }
      if ((!on || pickedStyle !== 'full') && tag) tag.remove()
    }
  }, [map, pickedKey, pickedStyle, selected, verdictByBus]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="py-map">
      <div className="py-map-canvas" ref={ref} data-map="feeder" />
      <TileState tiles={tiles} />
    </div>
  )
}

/** The ground the feeder is drawn on. A preference, not a measurement, so it is remembered. */
export function useBasemap() {
  const [base, setBase] = useState(storedBasemap)
  const pick = useCallback((id) => { rememberBasemap(id); setBase(id) }, [])
  return [base, pick]
}
