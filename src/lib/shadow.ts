// Moon shadow geometry, computed from ephemerides at runtime.
//
// The idea: at any instant, draw the line from the Sun's center through the
// Moon's center (the shadow axis) and intersect it with the Earth ellipsoid.
// The umbral / penumbral cone radii at that distance follow from similar
// triangles on the Sun and Moon radii. Offsetting perpendicular to the axis
// and re-projecting onto the ellipsoid gives path limits and shadow outlines.
//
// Accuracy is a few kilometers — good for a map, not for expedition planning.

import {
  AstroTime,
  Body,
  GeoVector,
  KM_PER_AU,
  RotateVector,
  Rotation_EQJ_EQD,
  Vector,
  VectorObserver,
} from 'astronomy-engine'
import {
  add,
  cross,
  dot,
  intersectEllipsoid,
  MOON_RADIUS_KM,
  norm,
  normalize,
  scale,
  sub,
  SUN_RADIUS_KM,
  vec,
  type Vec3,
} from './geometry'

export type LngLat = [number, number]

interface ShadowFrame {
  /** Unit vector from Sun toward Moon (shadow direction), equator-of-date frame, km. */
  axis: Vec3
  /** Moon center, geocentric equator-of-date, km. */
  moon: Vec3
  /** Point where the shadow axis meets the ellipsoid, or its closest approach to Earth. */
  center: Vec3
  /** True when the axis actually intersects the ellipsoid (central phase). */
  onSurface: boolean
  /** Umbra cone radius at `center`, km. Positive: total. Negative: annular (antumbra). */
  umbraKm: number
  /** Penumbra cone radius at `center`, km. */
  penumbraKm: number
}

function bodyKm(body: Body, time: AstroTime): Vec3 {
  const eqd = RotateVector(Rotation_EQJ_EQD(time), GeoVector(body, time, true))
  return vec(eqd.x * KM_PER_AU, eqd.y * KM_PER_AU, eqd.z * KM_PER_AU)
}

function toLngLat(p: Vec3, time: AstroTime): LngLat {
  const obs = VectorObserver(new Vector(p.x / KM_PER_AU, p.y / KM_PER_AU, p.z / KM_PER_AU, time), true)
  return [obs.longitude, obs.latitude]
}

export function shadowFrame(time: AstroTime): ShadowFrame {
  const sun = bodyKm(Body.Sun, time)
  const moon = bodyKm(Body.Moon, time)
  const axis = normalize(sub(moon, sun))
  const sunMoonKm = norm(sub(moon, sun))

  const tHit = intersectEllipsoid(moon, axis)
  const onSurface = tHit !== null && tHit > 0
  // Fall back to the axis point closest to the geocenter (partial phases).
  const t = onSurface ? tHit! : -dot(moon, axis)
  const center = add(moon, scale(axis, t))
  const moonToCenter = dot(sub(center, moon), axis)

  return {
    axis,
    moon,
    center,
    onSurface,
    umbraKm: MOON_RADIUS_KM - ((SUN_RADIUS_KM - MOON_RADIUS_KM) * moonToCenter) / sunMoonKm,
    penumbraKm: MOON_RADIUS_KM + ((SUN_RADIUS_KM + MOON_RADIUS_KM) * moonToCenter) / sunMoonKm,
  }
}

/** Geographic point under the shadow axis right now, if the phase is central. */
export function shadowCenterLngLat(time: AstroTime): LngLat | null {
  const f = shadowFrame(time)
  return f.onSurface ? toLngLat(f.center, time) : null
}

/** Project `p` along the shadow axis onto the ellipsoid. */
function projectToSurface(p: Vec3, axis: Vec3): Vec3 | null {
  const t = intersectEllipsoid(p, axis)
  return t === null ? null : add(p, scale(axis, t))
}

/**
 * Outline of the umbra or penumbra footprint at one instant, as a ring of
 * geographic points. Cone-boundary points that miss the Earth are dropped, so
 * the ring may be partial near the limb. Empty when the shadow is off Earth.
 */
export function footprint(time: AstroTime, kind: 'umbra' | 'penumbra', samples = 120): LngLat[] {
  const f = shadowFrame(time)
  const radius = kind === 'umbra' ? Math.abs(f.umbraKm) : f.penumbraKm
  if (kind === 'umbra' && !f.onSurface) return []

  const u = normalize(cross(f.axis, vec(0, 0, 1)))
  const v = cross(f.axis, u)
  const ring: LngLat[] = []
  for (let i = 0; i <= samples; i++) {
    const a = (2 * Math.PI * i) / samples
    const rim = add(f.center, add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a))))
    const hit = projectToSurface(rim, f.axis)
    if (hit) ring.push(toLngLat(hit, time))
  }
  return ring
}

export interface CentralPath {
  /** Ground track of the shadow axis. */
  centerLine: LngLat[]
  /** Polygon ring enclosing the zone of totality / annularity. */
  band: LngLat[]
  /** UT of first and last central contact found in the sampling window. */
  startUt: number
  endUt: number
}

/**
 * Central path of an eclipse, sampled around its peak time.
 * Returns null for eclipses with no central phase (partial eclipses).
 */
export function centralPath(peak: AstroTime, hoursAround = 3, stepSeconds = 30): CentralPath | null {
  interface Sample {
    time: AstroTime
    frame: ShadowFrame
  }
  const samples: Sample[] = []
  const steps = Math.round((hoursAround * 2 * 3600) / stepSeconds)
  for (let i = 0; i <= steps; i++) {
    const time = peak.AddDays((-hoursAround + (i * stepSeconds) / 3600) / 24)
    const frame = shadowFrame(time)
    if (frame.onSurface) samples.push({ time, frame })
  }
  if (samples.length < 2) return null

  const centerLine: LngLat[] = samples.map((s) => toLngLat(s.frame.center, s.time))
  const north: LngLat[] = []
  const south: LngLat[] = []

  for (let i = 0; i < samples.length; i++) {
    const { time, frame } = samples[i]
    const prev = samples[Math.max(0, i - 1)].frame.center
    const next = samples[Math.min(samples.length - 1, i + 1)].frame.center
    const tangent = normalize(sub(next, prev))
    const side = normalize(cross(frame.axis, tangent))
    const r = Math.abs(frame.umbraKm)

    const n = projectToSurface(add(frame.center, scale(side, r)), frame.axis)
    const s = projectToSurface(add(frame.center, scale(side, -r)), frame.axis)
    if (n) north.push(toLngLat(n, time))
    if (s) south.push(toLngLat(s, time))
  }

  return {
    centerLine,
    band: [...north, ...south.reverse(), ...(north.length ? [north[0]] : [])],
    startUt: samples[0].time.ut,
    endUt: samples[samples.length - 1].time.ut,
  }
}

/**
 * Shift longitudes by multiples of 360° so consecutive points never jump
 * across the antimeridian. MapLibre renders out-of-range longitudes fine.
 */
export function unwrapLngs(points: LngLat[]): LngLat[] {
  const out: LngLat[] = []
  let prev: number | null = null
  for (const [lng, lat] of points) {
    let l = lng
    if (prev !== null) {
      while (l - prev > 180) l -= 360
      while (l - prev < -180) l += 360
    }
    out.push([l, lat])
    prev = l
  }
  return out
}
