import { useEffect, useMemo, useRef, useState } from 'react'
import type { EclipseKind } from 'astronomy-engine'
import { buildCatalog, nextEclipse, type EclipseEntry } from './lib/catalog'
import { localCircumstances } from './lib/local'
import { coverageImage, magnitudeGrid, shadowImage } from './lib/coverage'
import { centralPath, footprint, haversineKm, polarClose, unwrapLngs, type LngLat } from './lib/shadow'
import { cloudColor, cloudsAlongLine, forecastAvailable } from './lib/weather'
import { HeroPanel } from './components/HeroPanel'
import { MapView } from './components/MapView'
import { ObserverEmpty, ObserverPanel } from './components/ObserverPanel'
import { TimeSlider } from './components/TimeSlider'

export interface MarkerPos {
  lat: number
  lng: number
}

export interface Home extends MarkerPos {
  city: string | null
}

/** What each catalog eclipse looks like from one reference point, by id. */
export interface LocalView {
  kind: EclipseKind
  obscuration: number
  /** Length of totality/annularity at the point, seconds; null for partial views. */
  durationSec: number | null
}
export type Visibility = Record<string, LocalView>

/** Where the catalog visibility is computed from, with a display label. */
export interface VisibleFrom {
  point: MarkerPos
  label: string | null
}

export interface CloudSegment {
  from: LngLat
  to: LngLat
  color: string
}

/** AstroTime.ut (days since J2000 noon UT) to a JS Date. */
const utToDate = (ut: number) => new Date(Date.UTC(2000, 0, 1, 12) + ut * 86_400_000)

/** Slider range around the eclipse peak, in minutes. */
export const WINDOW_MIN = 180
const PLAY_SPEED = 600 // simulated seconds per real second

function parseHash(catalog: EclipseEntry[]): { id: string; marker: MarkerPos | null } {
  const m = window.location.hash.match(/^#(\d{4}-\d{2}-\d{2})(?:\/(-?[\d.]+),(-?[\d.]+))?$/)
  if (m && catalog.some((e) => e.id === m[1])) {
    return {
      id: m[1],
      marker: m[2] ? { lat: parseFloat(m[2]), lng: parseFloat(m[3]) } : null,
    }
  }
  return { id: nextEclipse(catalog).id, marker: null }
}

export function App() {
  const catalog = useMemo(() => buildCatalog(), [])
  const initial = useMemo(() => parseHash(catalog), [catalog])

  const [eclipseId, setEclipseId] = useState(initial.id)
  const [marker, setMarker] = useState<MarkerPos | null>(initial.marker)
  const [offsetMin, setOffsetMin] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [home, setHome] = useState<Home | null>(null)
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  const [cloudLine, setCloudLine] = useState<CloudSegment[] | null>(null)

  // Coarse edge geolocation: personalizes the forecast with no permission
  // prompt. Fails silently outside the deployed Worker (e.g. vite dev).
  useEffect(() => {
    fetch('/api/whereami')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lat: number | null; lng: number | null; city: string | null } | null) => {
        if (!d || d.lat === null || d.lng === null) return
        setHome({ lat: d.lat, lng: d.lng, city: d.city })
        setMarker((m) => m ?? { lat: d.lat!, lng: d.lng! })
      })
      .catch(() => {})
  }, [])

  // The catalog visibility list follows the pinned point; home is the
  // fallback before any pin exists.
  const refPoint = marker ?? (home ? { lat: home.lat, lng: home.lng } : null)
  const refIsHome =
    refPoint && home
      ? haversineKm([home.lng, home.lat], [refPoint.lng, refPoint.lat]) < 30
      : false
  const visibleFrom: VisibleFrom | null = refPoint
    ? { point: refPoint, label: refIsHome ? (home?.city ?? null) : null }
    : null

  // Debounced sweep of all catalog eclipses at the reference point.
  useEffect(() => {
    if (!refPoint) return
    const { lat, lng } = refPoint
    const t = setTimeout(() => {
      const out: Visibility = {}
      for (const e of catalog) {
        const info = localCircumstances(e, lat, lng)
        if (info && info.peak.altitude > 0 && info.obscuration > 0.005) {
          out[e.id] = {
            kind: info.kind,
            obscuration: info.obscuration,
            durationSec:
              info.total_begin && info.total_end
                ? (info.total_end.time.ut - info.total_begin.time.ut) * 86400
                : null,
          }
        }
      }
      setVisibility(out)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refPoint?.lat, refPoint?.lng, catalog])

  const eclipse = catalog.find((e) => e.id === eclipseId)!
  const path = useMemo(() => centralPath(eclipse.peak, WINDOW_MIN / 60), [eclipse])

  // Cloud forecast along the center line, when the eclipse is close enough.
  useEffect(() => {
    setCloudLine(null)
    if (!path || !forecastAvailable(eclipse.peak.date)) return
    let cancelled = false
    const line = path.centerLine
    const count = Math.min(32, line.length)
    const samples = Array.from({ length: count }, (_, i) => {
      const idx = Math.round((i * (line.length - 1)) / (count - 1))
      const t = path.startUt + ((path.endUt - path.startUt) * idx) / (line.length - 1)
      return { lat: line[idx][1], lng: line[idx][0], at: utToDate(t), point: line[idx] }
    })
    cloudsAlongLine(samples)
      .then((clouds) => {
        if (cancelled) return
        const segments: CloudSegment[] = []
        for (let i = 1; i < samples.length; i++) {
          const a = clouds[i - 1]
          const b = clouds[i]
          if (a === null || b === null) continue
          segments.push({
            from: samples[i - 1].point,
            to: samples[i].point,
            color: cloudColor((a + b) / 2),
          })
        }
        segments.length && setCloudLine(segments)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eclipse, path])
  const coverage = useMemo(() => coverageImage(magnitudeGrid(eclipse.peak)), [eclipse])
  const simTime = useMemo(() => eclipse.peak.AddDays(offsetMin / 1440), [eclipse, offsetMin])

  const umbra = useMemo(() => polarClose(unwrapLngs(footprint(simTime, 'umbra'))), [simTime])
  const shadow = useMemo(() => shadowImage(simTime), [simTime])

  // Keep the URL shareable.
  useEffect(() => {
    const pos = marker ? `/${marker.lat.toFixed(4)},${marker.lng.toFixed(4)}` : ''
    history.replaceState(null, '', `#${eclipseId}${pos}`)
  }, [eclipseId, marker])

  // Shadow animation.
  const rafRef = useRef(0)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setOffsetMin((v) => {
        const next = v + (dt * PLAY_SPEED) / 60
        return next > WINDOW_MIN ? -WINDOW_MIN : next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  const selectEclipse = (id: string) => {
    setEclipseId(id)
    setOffsetMin(0)
    setPlaying(false)
  }

  return (
    <div className="app">
      <MapView
        path={path}
        coverage={coverage}
        shadow={shadow}
        umbra={umbra}
        cloudLine={cloudLine}
        marker={marker}
        onPick={setMarker}
        fitKey={eclipseId}
      />
      <HeroPanel
        catalog={catalog}
        eclipse={eclipse}
        marker={marker}
        visibility={visibility}
        visibleFrom={visibleFrom}
        onSelect={selectEclipse}
        onMarker={setMarker}
      />
      {!marker && <ObserverEmpty onMarker={setMarker} />}
      {marker && (
        <ObserverPanel
          eclipse={eclipse}
          marker={marker}
          home={home}
          path={path}
          simTime={simTime}
          onMarker={setMarker}
          onClear={() => setMarker(null)}
        />
      )}
      {cloudLine && (
        <div className="cloud-legend" aria-label="Cloud forecast legend">
          <span>clouds on the center line</span>
          <i />
          <small>clear</small>
          <small>overcast</small>
        </div>
      )}
      <TimeSlider
        value={offsetMin}
        onChange={(v) => {
          setPlaying(false)
          setOffsetMin(v)
        }}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        simDate={simTime.date}
      />
    </div>
  )
}
