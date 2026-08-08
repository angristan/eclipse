// Plain 3D vector math and Earth ellipsoid intersection, all in kilometers.

export interface Vec3 {
  x: number
  y: number
  z: number
}

// WGS84
export const EARTH_A = 6378.137
export const EARTH_B = 6356.7523142

export const SUN_RADIUS_KM = 695700
export const MOON_RADIUS_KM = 1737.4

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const norm = (a: Vec3): number => Math.sqrt(dot(a, a))
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / norm(a))

/**
 * Intersect the line `origin + t * dir` with the WGS84 ellipsoid.
 * Returns the smallest-t (sun-side) intersection, or null if the line misses.
 * `t` may be negative when the origin sits past the surface along `dir`.
 */
export function intersectEllipsoid(origin: Vec3, dir: Vec3): number | null {
  // Scale z so the ellipsoid becomes a sphere of radius EARTH_A.
  const k = EARTH_A / EARTH_B
  const o = vec(origin.x, origin.y, origin.z * k)
  const d = vec(dir.x, dir.y, dir.z * k)

  const a = dot(d, d)
  const b = 2 * dot(o, d)
  const c = dot(o, o) - EARTH_A * EARTH_A
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  return (-b - Math.sqrt(disc)) / (2 * a)
}

/** Fraction of the Sun's disc area covered by the Moon, from angular radii and separation. */
export function obscurationFraction(sunR: number, moonR: number, sep: number): number {
  if (sep >= sunR + moonR) return 0
  if (sep <= Math.abs(sunR - moonR)) {
    return moonR >= sunR ? 1 : (moonR * moonR) / (sunR * sunR)
  }
  const d = sep
  const a1 = sunR * sunR * Math.acos((d * d + sunR * sunR - moonR * moonR) / (2 * d * sunR))
  const a2 = moonR * moonR * Math.acos((d * d + moonR * moonR - sunR * sunR) / (2 * d * moonR))
  const a3 =
    0.5 *
    Math.sqrt((-d + sunR + moonR) * (d + sunR - moonR) * (d - sunR + moonR) * (d + sunR + moonR))
  return (a1 + a2 - a3) / (Math.PI * sunR * sunR)
}
