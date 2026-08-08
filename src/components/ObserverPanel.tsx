import { EclipseKind, type AstroTime } from 'astronomy-engine'
import { useEffect, useMemo, useState } from 'react'
import type { Home, MarkerPos } from '../App'
import type { EclipseEntry } from '../lib/catalog'
import { browserZone, fmtDuration, fmtTime } from '../lib/format'
import { localCircumstances, sunMoonView } from '../lib/local'
import { haversineKm, nearestOnLine, type CentralPath } from '../lib/shadow'
import { cloudCover, forecastAvailable } from '../lib/weather'
import { CrosshairIcon, KIND_LABEL } from './HeroPanel'
import { SunSim } from './SunSim'

interface Props {
  eclipse: EclipseEntry
  marker: MarkerPos
  home: Home | null
  path: CentralPath | null
  simTime: AstroTime
  onMarker: (pos: MarkerPos) => void
  onClear: () => void
}

export function ObserverPanel({ eclipse, marker, home, path, simTime, onMarker, onClear }: Props) {
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

  const contacts = info
    ? [
        { label: 'Partial begins', ev: info.partial_begin },
        { label: 'Totality begins', ev: info.total_begin },
        { label: 'Maximum', ev: info.peak },
        { label: 'Totality ends', ev: info.total_end },
        { label: 'Partial ends', ev: info.partial_end },
      ].filter((c) => c.ev)
    : []

  const totalitySec =
    info?.total_begin && info.total_end
      ? (info.total_end.time.ut - info.total_begin.time.ut) * 86400
      : null

  // When this spot only gets a partial view, say how far the central path is.
  const central = info?.total_begin == null
  const nearest = useMemo(
    () => (path && central ? nearestOnLine(path.centerLine, [marker.lng, marker.lat]) : null),
    [path, central, marker],
  )
  const centralLabel = eclipse.kind === EclipseKind.Annular ? 'Annularity' : 'Totality'

  const atHome = home && haversineKm([home.lng, home.lat], [marker.lng, marker.lat]) < 30

  return (
    <aside className="panel observer" aria-label="Local circumstances">
      <header className="observer-head">
        <h2 className="display">{atHome && home?.city ? `Near ${home.city}` : 'This spot'}</h2>
        <span className="coords">
          {Math.abs(marker.lat).toFixed(2)}°{marker.lat >= 0 ? 'N' : 'S'}{' '}
          {Math.abs(marker.lng).toFixed(2)}°{marker.lng >= 0 ? 'E' : 'W'}
        </span>
        <button className="link" onClick={onClear} aria-label="Clear selected point">
          clear
        </button>
      </header>

      {!info ? (
        <>
          <p className="muted">
            This eclipse is not visible from here. Click inside the glowing band for totality, or
            anywhere in the soft shadow for a partial eclipse.
          </p>
          {nearest && (
            <button
              className="btn btn-primary jump"
              onClick={() => onMarker({ lat: nearest.point[1], lng: nearest.point[0] })}
            >
              {centralLabel} passes {Math.round(nearest.km).toLocaleString()} km away — take me
              there
            </button>
          )}
        </>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <b>{(info.obscuration * 100).toFixed(1)}%</b>
              <small>sun covered</small>
            </div>
            <div className="stat">
              <b>{KIND_LABEL[info.kind] ?? info.kind}</b>
              <small>eclipse here</small>
            </div>
            {totalitySec !== null && (
              <div className="stat">
                <b>{fmtDuration(totalitySec)}</b>
                <small>{info.kind === EclipseKind.Annular ? 'of annularity' : 'of totality'}</small>
              </div>
            )}
            {clouds !== null && (
              <div className="stat">
                <b>{clouds}%</b>
                <small>clouds forecast</small>
              </div>
            )}
          </div>

          <table className="contacts">
            <tbody>
              {contacts.map(({ label, ev }) => (
                <tr key={label} className={ev!.altitude < 0 ? 'below-horizon' : ''}>
                  <td>{label}</td>
                  <td>{fmtTime(ev!.time.date)}</td>
                  <td>{ev!.altitude < 0 ? 'below horizon' : `sun ${ev!.altitude.toFixed(0)}°`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted tz-note">Times in your timezone ({browserZone}).</p>

          {nearest && nearest.km > 25 && (
            <button
              className="btn btn-primary jump"
              onClick={() => onMarker({ lat: nearest.point[1], lng: nearest.point[0] })}
            >
              {centralLabel} passes {Math.round(nearest.km).toLocaleString()} km away — take me
              there
            </button>
          )}

          <SunSim view={view} />
        </>
      )}
    </aside>
  )
}

/** Shown in place of the observer panel until a point is picked. */
export function ObserverEmpty({ onMarker }: { onMarker: (pos: MarkerPos) => void }) {
  const geolocate = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      onMarker({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )
  return (
    <aside className="panel observer observer-empty" aria-label="Pick a location">
      <h2 className="display">Where will you watch from?</h2>
      <p className="muted">
        Click anywhere on the map for the local story: when the eclipse starts, peaks, and ends,
        how much of the Sun is covered, and the cloud forecast.
      </p>
      <button className="btn btn-primary" onClick={geolocate}>
        <CrosshairIcon />
        Use my precise location
      </button>
    </aside>
  )
}
