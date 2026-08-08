import { EclipseKind } from 'astronomy-engine'
import { useEffect, useMemo, useState } from 'react'
import type { MarkerPos, Visibility, VisibleFrom } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { countdownTo } from '../lib/format'
import { EclipseList } from './EclipseList'
import { localCircumstances } from '../lib/local'

interface Props {
  catalog: EclipseEntry[]
  eclipse: EclipseEntry
  marker: MarkerPos | null
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

export function CrosshairIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 0v2.4M8 13.6V16M0 8h2.4M13.6 8H16" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
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

export function HeroPanel(props: Props) {
  const { eclipse, marker } = props
  // The countdown targets the maximum at the pinned spot when there is one.
  const pinInfo = useMemo(
    () => (marker ? localCircumstances(eclipse, marker.lat, marker.lng) : null),
    [eclipse, marker],
  )
  const countdownTarget = pinInfo?.peak.time.date ?? eclipse.peak.date
  const peakDate = eclipse.peak.date

  return (
    <section className="panel hero" aria-label="Eclipse selection">
      <h1 className="display">
        {KIND_LABEL[eclipse.kind] ?? eclipse.kind} solar eclipse
        <em>{peakDate.toLocaleDateString(undefined, { month: 'long' })} {peakDate.getUTCDate()}, {peakDate.getUTCFullYear()}</em>
      </h1>

      <Countdown target={countdownTarget} />
      <p className="peak-line">
        {marker
          ? pinInfo
            ? 'until the maximum at your pin'
            : 'until the global peak — not visible from your pin'
          : 'until the global peak — click the map for local times'}
      </p>

      <EclipseList
        catalog={props.catalog}
        eclipse={eclipse}
        visibility={props.visibility}
        visibleFrom={props.visibleFrom}
        onSelect={props.onSelect}
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
