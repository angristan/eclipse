import { EclipseKind, type AstroTime } from 'astronomy-engine'
import { useEffect, useMemo, useState } from 'react'
import type { MarkerPos } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { browserZone, countdownTo, fmtDate, fmtDateShort, fmtDuration, fmtTime } from '../lib/format'
import { localCircumstances, sunMoonView } from '../lib/local'
import { cloudCover, forecastAvailable } from '../lib/weather'
import { SunSim } from './SunSim'

interface Props {
  catalog: EclipseEntry[]
  eclipse: EclipseEntry
  onSelect: (id: string) => void
  marker: MarkerPos | null
  onMarker: (pos: MarkerPos | null) => void
  simTime: AstroTime
}

const KIND_LABEL: Partial<Record<EclipseKind, string>> = {
  [EclipseKind.Total]: 'Total',
  [EclipseKind.Annular]: 'Annular',
  [EclipseKind.Partial]: 'Partial',
}

function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const c = countdownTo(target, now)
  if (c.past) return <div className="countdown past">peaked {c.days > 0 ? `${c.days} days ago` : 'today'}</div>
  return (
    <div className="countdown">
      {c.days > 0 && <span>{c.days}<small>d</small></span>}
      <span>{c.hours}<small>h</small></span>
      <span>{c.minutes}<small>m</small></span>
      <span>{c.seconds}<small>s</small></span>
      <small className="countdown-label">to peak</small>
    </div>
  )
}

function LocalPanel({ eclipse, marker, simTime }: { eclipse: EclipseEntry; marker: MarkerPos; simTime: AstroTime }) {
  const info = useMemo(
    () => localCircumstances(eclipse, marker.lat, marker.lng),
    [eclipse, marker],
  )
  const view = useMemo(() => sunMoonView(simTime, marker.lat, marker.lng), [simTime, marker])

  const [clouds, setClouds] = useState<number | null>(null)
  useEffect(() => {
    setClouds(null)
    if (!info || !forecastAvailable(eclipse.peak.date)) return
    let cancelled = false
    cloudCover(marker.lat, marker.lng, info.peak.time.date)
      .then((v) => !cancelled && setClouds(v))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eclipse, marker, info])

  if (!info) {
    return <p className="muted">This eclipse is not visible from the selected point. Click inside the shaded area.</p>
  }

  const contacts = [
    { label: 'Partial begins', ev: info.partial_begin },
    { label: 'Totality begins', ev: info.total_begin },
    { label: 'Maximum', ev: info.peak },
    { label: 'Totality ends', ev: info.total_end },
    { label: 'Partial ends', ev: info.partial_end },
  ].filter((c) => c.ev)

  const totalitySec =
    info.total_begin && info.total_end
      ? (info.total_end.time.ut - info.total_begin.time.ut) * 86400
      : null

  return (
    <div className="local">
      <div className="stat-row">
        <div className="stat">
          <b>{(info.obscuration * 100).toFixed(1)}%</b>
          <small>max coverage</small>
        </div>
        <div className="stat">
          <b>{KIND_LABEL[info.kind] ?? info.kind}</b>
          <small>here</small>
        </div>
        {totalitySec !== null && (
          <div className="stat">
            <b>{fmtDuration(totalitySec)}</b>
            <small>{info.kind === EclipseKind.Annular ? 'annularity' : 'totality'}</small>
          </div>
        )}
        {clouds !== null && (
          <div className="stat">
            <b>{clouds}%</b>
            <small>cloud forecast</small>
          </div>
        )}
      </div>
      <table className="contacts">
        <tbody>
          {contacts.map(({ label, ev }) => (
            <tr key={label} className={ev!.altitude < 0 ? 'below-horizon' : ''}>
              <td>{label}</td>
              <td>{fmtTime(ev!.time.date)}</td>
              <td>{ev!.altitude < 0 ? 'sun below horizon' : `sun ${ev!.altitude.toFixed(0)}°`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted tz-note">Times in your timezone ({browserZone}).</p>
      <SunSim view={view} />
    </div>
  )
}

export function Sidebar({ catalog, eclipse, onSelect, marker, onMarker, simTime }: Props) {
  const geolocate = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      onMarker({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )

  return (
    <aside className="sidebar">
      <header>
        <h1>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="#ffd166" />
            <circle cx="40" cy="26" r="24" fill="var(--ds-paper)" />
          </svg>
          Eclipse Tracker
        </h1>
        <p className="muted">
          Solar eclipse paths and local timings, computed in your browser. Click the map for any
          location.
        </p>
      </header>

      <label className="field">
        <span>Eclipse</span>
        <select value={eclipse.id} onChange={(e) => onSelect(e.target.value)}>
          {catalog.map((e) => (
            <option key={e.id} value={e.id}>
              {fmtDateShort(e.peak.date)} — {KIND_LABEL[e.kind] ?? e.kind}
            </option>
          ))}
        </select>
      </label>

      <Countdown target={eclipse.peak.date} />

      <div className="facts">
        <div>
          <span className="muted">Peak</span> {fmtDate(eclipse.peak.date)}, {fmtTime(eclipse.peak.date)}
        </div>
        <div>
          <span className="muted">Max coverage anywhere</span> {(eclipse.obscuration * 100).toFixed(0)}%
        </div>
      </div>

      <div className="actions">
        <button onClick={geolocate}>Use my location</button>
        {eclipse.greatest && (
          <button onClick={() => onMarker(eclipse.greatest)}>Greatest eclipse point</button>
        )}
      </div>

      <section className="observer">
        <h2>Observer</h2>
        {marker ? (
          <>
            <p className="muted coords">
              {marker.lat.toFixed(3)}°, {marker.lng.toFixed(3)}°
              <button className="link" onClick={() => onMarker(null)}>
                clear
              </button>
            </p>
            <LocalPanel eclipse={eclipse} marker={marker} simTime={simTime} />
          </>
        ) : (
          <p className="muted">No point selected yet — click the map or use your location.</p>
        )}
      </section>

      <footer className="muted">
        Built with <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a>,{' '}
        <a href="https://maplibre.org">MapLibre</a>, <a href="https://openfreemap.org">OpenFreeMap</a>{' '}
        and <a href="https://open-meteo.com">Open-Meteo</a>. Accuracy is a few kilometers — enjoy the
        eclipse, but double-check before driving across a country.{' '}
        <a href="https://github.com/angristan/eclipse">Source</a>
      </footer>
    </aside>
  )
}
