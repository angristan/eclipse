// Local circumstances: what an observer at one point on Earth sees.

import {
  AngleBetween,
  AstroTime,
  Body,
  Equator,
  KM_PER_AU,
  Observer,
  SearchLocalSolarEclipse,
  type LocalSolarEclipseInfo,
} from 'astronomy-engine'
import { MOON_RADIUS_KM, obscurationFraction, SUN_RADIUS_KM } from './geometry'
import type { EclipseEntry } from './catalog'

/**
 * Local circumstances of `eclipse` at (lat, lng), or null when nothing of this
 * eclipse is visible there. Contact times and altitudes come from
 * astronomy-engine's local eclipse search.
 */
export function localCircumstances(
  eclipse: EclipseEntry,
  lat: number,
  lng: number,
): LocalSolarEclipseInfo | null {
  const observer = new Observer(lat, lng, 0)
  const info = SearchLocalSolarEclipse(eclipse.peak.AddDays(-2), observer)
  // The search returns the next visible eclipse anywhere in time; keep it only
  // if it is the one we asked about.
  if (Math.abs(info.peak.time.ut - eclipse.peak.ut) > 2) return null
  return info
}

export interface SunMoonView {
  /** Angular radii and separation in degrees, topocentric. */
  sunRadius: number
  moonRadius: number
  separation: number
  /** Position angle of the Moon relative to the Sun, degrees, 0 = celestial north. */
  positionAngle: number
  /** Fraction of the Sun's disc area covered right now. */
  obscuration: number
  /** Sun altitude above the horizon would require a horizon calc; consumers use contact events for that. */
}

/** Topocentric Sun/Moon geometry at one instant, for the sky simulation. */
export function sunMoonView(time: AstroTime, lat: number, lng: number): SunMoonView {
  const observer = new Observer(lat, lng, 0)
  const sun = Equator(Body.Sun, time, observer, true, true)
  const moon = Equator(Body.Moon, time, observer, true, true)

  const sunRadius = (Math.asin(SUN_RADIUS_KM / (sun.dist * KM_PER_AU)) * 180) / Math.PI
  const moonRadius = (Math.asin(MOON_RADIUS_KM / (moon.dist * KM_PER_AU)) * 180) / Math.PI
  const separation = AngleBetween(sun.vec, moon.vec)

  const dRa = (moon.ra - sun.ra) * 15 * Math.cos((sun.dec * Math.PI) / 180)
  const dDec = moon.dec - sun.dec
  const positionAngle = (Math.atan2(dRa, dDec) * 180) / Math.PI

  return {
    sunRadius,
    moonRadius,
    separation,
    positionAngle,
    obscuration: obscurationFraction(sunRadius, moonRadius, separation),
  }
}
