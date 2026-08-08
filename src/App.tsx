import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCatalog, nextEclipse, type EclipseEntry } from './lib/catalog'
import { centralPath, footprint, unwrapLngs } from './lib/shadow'
import { HeroPanel } from './components/HeroPanel'
import { MapView } from './components/MapView'
import { ObserverPanel } from './components/ObserverPanel'
import { TimeSlider } from './components/TimeSlider'

export interface MarkerPos {
  lat: number
  lng: number
}

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

  const eclipse = catalog.find((e) => e.id === eclipseId)!
  const path = useMemo(() => centralPath(eclipse.peak, WINDOW_MIN / 60), [eclipse])
  const simTime = useMemo(() => eclipse.peak.AddDays(offsetMin / 1440), [eclipse, offsetMin])

  const footprints = useMemo(
    () => ({
      umbra: unwrapLngs(footprint(simTime, 'umbra')),
      penumbra: unwrapLngs(footprint(simTime, 'penumbra')),
    }),
    [simTime],
  )

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
        footprints={footprints}
        marker={marker}
        onPick={setMarker}
        fitKey={eclipseId}
      />
      <HeroPanel catalog={catalog} eclipse={eclipse} onSelect={selectEclipse} onMarker={setMarker} />
      {marker && (
        <ObserverPanel
          eclipse={eclipse}
          marker={marker}
          simTime={simTime}
          onClear={() => setMarker(null)}
        />
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
