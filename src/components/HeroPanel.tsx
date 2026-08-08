import { EclipseKind } from 'astronomy-engine'
import { useEffect, useMemo, useState } from 'react'
import type { Home, MarkerPos, Visibility, VisibleFrom } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { countdownTo, fmtTime } from '../lib/format'
import { EclipseList } from './EclipseList'
import { localCircumstances } from '../lib/local'

interface Props {
  catalog: EclipseEntry[]
  eclipse: EclipseEntry
  home: Home | null
  visibility: Visibility | null
  visibleFrom: VisibleFrom | null
  onSelect: (id: string) => void
  onMarker: (pos: MarkerPos | null) => void
}

export const KIND_LABEL: Partial<Record<EclipseKind, string>> = {
  [EclipseKind.Total]: 'Total',
  [EclipseKind.Annular]: 'Annular',
  [EclipseKind.Partial]: 'Partial',
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const c = countdownTo(target, now)
  if (c.past) {
    return (
      <p className="countdown-past">
        Peaked {c.days > 0 ? `${c.days.toLocaleString()} days ago` : 'today'} — drag the timeline to
        replay it.
      </p>
    )
  }
  return (
    <div className="countdown" role="timer" aria-label="Countdown to eclipse peak">
      {c.days > 0 && (
        <div className="countdown-cell">
          <b>{c.days}</b>
          <small>{c.days === 1 ? 'day' : 'days'}</small>
        </div>
      )}
      <div className="countdown-cell">
        <b>{pad(c.hours)}</b>
        <small>hrs</small>
      </div>
      <div className="countdown-cell">
        <b>{pad(c.minutes)}</b>
        <small>min</small>
      </div>
      <div className="countdown-cell">
        <b>{pad(c.seconds)}</b>
        <small>sec</small>
      </div>
    </div>
  )
}

/** One personal line: what this eclipse means at the visitor's own location. */
function HomeLine({ eclipse, home, onMarker }: Pick<Props, 'eclipse' | 'home' | 'onMarker'>) {
  const info = useMemo(
    () => (home ? localCircumstances(eclipse, home.lat, home.lng) : null),
    [eclipse, home],
  )
  if (!home) return null
  const place = home.city ?? 'your location'

  let text: string
  if (!info || info.peak.altitude < 0) {
    text = `Not visible from ${place}`
  } else if (info.kind === EclipseKind.Total) {
    text = `${place} is in the path of totality — ${fmtTime(info.peak.time.date)}`
  } else if (info.kind === EclipseKind.Annular) {
    text = `Ring of fire over ${place} at ${fmtTime(info.peak.time.date)}`
  } else {
    text = `From ${place}: ${(info.obscuration * 100).toFixed(0)}% covered at ${fmtTime(info.peak.time.date)}`
  }

  return (
    <button
      className="home-line"
      onClick={() => onMarker({ lat: home.lat, lng: home.lng })}
      title="Show details for your location"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.4" fill="currentColor" />
        <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 0v2.4M8 13.6V16M0 8h2.4M13.6 8H16" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {text}
    </button>
  )
}

export function HeroPanel(props: Props) {
  const { catalog, eclipse, home, onSelect, onMarker } = props
  const geolocate = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      onMarker({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )

  const peakDate = eclipse.peak.date

  return (
    <section className="panel hero" aria-label="Eclipse selection">
      <h1 className="display">
        {KIND_LABEL[eclipse.kind] ?? eclipse.kind} solar eclipse
        <em>{peakDate.toLocaleDateString(undefined, { month: 'long' })} {peakDate.getUTCDate()}, {peakDate.getUTCFullYear()}</em>
      </h1>

      <Countdown target={peakDate} />

      <HomeLine eclipse={eclipse} home={home} onMarker={onMarker} />

      <div className="hero-controls">
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={geolocate}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="2.4" fill="currentColor" />
              <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 0v2.4M8 13.6V16M0 8h2.4M13.6 8H16" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Precise location
          </button>
          {eclipse.greatest && (
            <button className="btn btn-ghost" onClick={() => onMarker(eclipse.greatest)}>
              Greatest eclipse
            </button>
          )}
        </div>
      </div>

      <EclipseList
        catalog={catalog}
        eclipse={eclipse}
        visibility={props.visibility}
        visibleFrom={props.visibleFrom}
        onSelect={onSelect}
      />

      <details className="about">
        <summary>About</summary>
        <p>
          Paths and timings computed in your browser with{' '}
          <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>. Map by{' '}
          <a href="https://maplibre.org">MapLibre</a> and{' '}
          <a href="https://openfreemap.org">OpenFreeMap</a>, clouds by{' '}
          <a href="https://open-meteo.com">Open-Meteo</a>. Your approximate position comes from the
          CDN edge and never leaves it. Accuracy is a few kilometers — check official sources before
          chasing the edge of the path. <a href="https://github.com/angristan/eclipse">Source</a>
        </p>
      </details>
    </section>
  )
}
