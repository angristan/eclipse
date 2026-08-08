import { EclipseKind } from 'astronomy-engine'
import { useEffect, useState } from 'react'
import type { MarkerPos } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { countdownTo, fmtDateShort, fmtTime } from '../lib/format'

interface Props {
  catalog: EclipseEntry[]
  eclipse: EclipseEntry
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

export function HeroPanel({ catalog, eclipse, onSelect, onMarker }: Props) {
  const geolocate = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      onMarker({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )

  const peakDate = eclipse.peak.date

  return (
    <section className="panel hero" aria-label="Eclipse selection">
      <header className="brand">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="#f6c25c" />
          <circle cx="41" cy="25" r="24" fill="#171210" />
        </svg>
        <span>Eclipse Tracker</span>
      </header>

      <h1 className="display">
        {KIND_LABEL[eclipse.kind] ?? eclipse.kind} solar eclipse
        <em>{peakDate.toLocaleDateString(undefined, { month: 'long' })} {peakDate.getUTCDate()}, {peakDate.getUTCFullYear()}</em>
      </h1>

      <Countdown target={peakDate} />
      <p className="peak-line">
        Peak at {fmtTime(peakDate)} · to totality where you are, pick a point below
      </p>

      <div className="hero-controls">
        <select
          value={eclipse.id}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Choose an eclipse"
        >
          {catalog.map((e) => (
            <option key={e.id} value={e.id}>
              {fmtDateShort(e.peak.date)} — {KIND_LABEL[e.kind] ?? e.kind}
            </option>
          ))}
        </select>
        <div className="hero-actions">
          <button onClick={geolocate}>My location</button>
          {eclipse.greatest && (
            <button onClick={() => onMarker(eclipse.greatest)}>Greatest eclipse</button>
          )}
        </div>
      </div>

      <details className="about">
        <summary>About</summary>
        <p>
          Paths and timings computed in your browser with{' '}
          <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>. Map by{' '}
          <a href="https://maplibre.org">MapLibre</a> and{' '}
          <a href="https://openfreemap.org">OpenFreeMap</a>, clouds by{' '}
          <a href="https://open-meteo.com">Open-Meteo</a>. Accuracy is a few kilometers — check
          official sources before chasing the edge of the path.{' '}
          <a href="https://github.com/angristan/eclipse">Source</a>
        </p>
      </details>
    </section>
  )
}
