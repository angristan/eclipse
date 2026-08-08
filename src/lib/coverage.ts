// Ground-truth coverage zones: sweep the whole eclipse and record, for every
// grid point on Earth, the maximum eclipse magnitude it sees while the Sun is
// up. Iso-contours of that field are the classic infographic bands. This is
// brute force on purpose — the offset-curve shortcut breaks near the
// day/night terminator, where a zone's edge belongs to a different instant
// than the shadow's passage.

import { AstroTime, SiderealTime } from 'astronomy-engine'
import { EARTH_A, EARTH_B } from './geometry'
import { shadowFrame, type LngLat } from './shadow'

const E2 = 1 - (EARTH_B * EARTH_B) / (EARTH_A * EARTH_A)
const RAD = Math.PI / 180

export interface CoverageZone {
  magnitude: number
  rings: LngLat[][]
}

interface Grid {
  lngs: number[]
  lats: number[]
  /** values[row * lngs.length + col], row-major by latitude. */
  values: Float32Array
}

/** Maximum eclipse magnitude per grid point over the eclipse, daylight only. */
export function magnitudeGrid(
  peak: AstroTime,
  stepDeg = 1.5,
  hoursAround = 3,
  stepSeconds = 120,
): Grid {
  const lngs: number[] = []
  const lats: number[] = []
  for (let lng = -180; lng <= 180 + 1e-9; lng += stepDeg) lngs.push(lng)
  for (let lat = -85; lat <= 85 + 1e-9; lat += stepDeg) lats.push(lat)

  // Per-instant shadow state and Earth orientation.
  const steps = Math.round((hoursAround * 2 * 3600) / stepSeconds)
  const samples: {
    ax: number; ay: number; az: number
    mx: number; my: number; mz: number
    rp: number; ru: number
    cosT: number; sinT: number
  }[] = []
  for (let i = 0; i <= steps; i++) {
    const time = peak.AddDays((-hoursAround + (i * stepSeconds) / 3600) / 24)
    const f = shadowFrame(time)
    const theta = SiderealTime(time) * 15 * RAD
    samples.push({
      ax: f.axis.x, ay: f.axis.y, az: f.axis.z,
      mx: f.moon.x, my: f.moon.y, mz: f.moon.z,
      rp: f.penumbraKm, ru: Math.abs(f.umbraKm),
      cosT: Math.cos(theta), sinT: Math.sin(theta),
    })
  }

  // Earth-fixed geocentric coordinates per grid point (height 0).
  const cols = lngs.length
  const values = new Float32Array(cols * lats.length)
  const ex = new Float64Array(cols * lats.length)
  const ey = new Float64Array(cols * lats.length)
  const ez = new Float64Array(cols * lats.length)
  lats.forEach((lat, r) => {
    const phi = lat * RAD
    const n = EARTH_A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2)
    const cp = Math.cos(phi)
    lngs.forEach((lng, c) => {
      const i = r * cols + c
      ex[i] = n * cp * Math.cos(lng * RAD)
      ey[i] = n * cp * Math.sin(lng * RAD)
      ez[i] = n * (1 - E2) * Math.sin(phi)
    })
  })

  for (let i = 0; i < values.length; i++) {
    let best = 0
    for (const s of samples) {
      // Rotate the Earth-fixed point into the equator-of-date frame.
      const px = ex[i] * s.cosT - ey[i] * s.sinT
      const py = ex[i] * s.sinT + ey[i] * s.cosT
      const pz = ez[i]
      // Daylight check: the Sun direction is opposite the shadow axis.
      const len = Math.sqrt(px * px + py * py + pz * pz)
      if ((px * s.ax + py * s.ay + pz * s.az) / len > 0.02) continue
      // Perpendicular distance from the point to the shadow axis line.
      const dx = px - s.mx, dy = py - s.my, dz = pz - s.mz
      const cx = dy * s.az - dz * s.ay
      const cy = dz * s.ax - dx * s.az
      const cz = dx * s.ay - dy * s.ax
      const dist = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const m = (s.rp - dist) / (s.rp - s.ru)
      if (m > best) best = m
    }
    values[i] = Math.min(best, 1)
  }
  return { lngs, lats, values }
}

/**
 * Marching squares: closed iso-contour rings of `level` on the grid.
 * The field is 0 outside the eclipse zone, so contours close naturally;
 * zones crossing the antimeridian simply split into two loops there.
 */
export function isoRings(grid: Grid, level: number): LngLat[][] {
  const { lngs, lats, values } = grid
  const cols = lngs.length
  const v = (r: number, c: number) => values[r * cols + c]
  const key = (p: LngLat) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`
  const segments: [LngLat, LngLat][] = []

  const interp = (pa: LngLat, va: number, pb: LngLat, vb: number): LngLat => {
    const t = (level - va) / (vb - va)
    return [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]
  }

  for (let r = 0; r < lats.length - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const corners: [LngLat, number][] = [
        [[lngs[c], lats[r]], v(r, c)],
        [[lngs[c + 1], lats[r]], v(r, c + 1)],
        [[lngs[c + 1], lats[r + 1]], v(r + 1, c + 1)],
        [[lngs[c], lats[r + 1]], v(r + 1, c)],
      ]
      let idx = 0
      corners.forEach(([, val], i) => {
        if (val >= level) idx |= 1 << i
      })
      if (idx === 0 || idx === 15) continue
      // Edge midpoints between corner pairs (0-1, 1-2, 2-3, 3-0).
      const edge = (a: number, b: number) =>
        interp(corners[a][0], corners[a][1], corners[b][0], corners[b][1])
      const CASES: Record<number, [number, number, number, number][]> = {
        1: [[3, 0, 0, 1]], 2: [[0, 1, 1, 2]], 3: [[3, 0, 1, 2]], 4: [[1, 2, 2, 3]],
        5: [[3, 0, 0, 1], [1, 2, 2, 3]], 6: [[0, 1, 2, 3]], 7: [[3, 0, 2, 3]],
        8: [[2, 3, 3, 0]], 9: [[2, 3, 0, 1]], 10: [[0, 1, 3, 0], [1, 2, 2, 3]],
        11: [[2, 3, 1, 2]], 12: [[1, 2, 3, 0]], 13: [[1, 2, 0, 1]], 14: [[0, 1, 3, 0]],
      }
      for (const [a1, a2, b1, b2] of CASES[idx]) {
        segments.push([edge(a1, a2), edge(b1, b2)])
      }
    }
  }

  // Chain segments into rings by matching endpoints.
  const byPoint = new Map<string, [LngLat, LngLat][]>()
  for (const seg of segments) {
    for (const p of seg) {
      const k = key(p)
      const list = byPoint.get(k) ?? []
      list.push(seg)
      byPoint.set(k, list)
    }
  }
  const used = new Set<[LngLat, LngLat]>()
  const rings: LngLat[][] = []
  for (const seed of segments) {
    if (used.has(seed)) continue
    used.add(seed)
    const ring: LngLat[] = [seed[0], seed[1]]
    let guard = segments.length
    while (guard-- > 0) {
      const tail = ring[ring.length - 1]
      const next = (byPoint.get(key(tail)) ?? []).find((s) => !used.has(s))
      if (!next) break
      used.add(next)
      ring.push(key(next[0]) === key(tail) ? next[1] : next[0])
      if (key(ring[ring.length - 1]) === key(ring[0])) break
    }
    if (ring.length > 8) rings.push(ring)
  }
  return rings
}

/** Iso-coverage zones for one eclipse, ready for the map. */
export function coverageZones(
  peak: AstroTime,
  magnitudes = [0.2, 0.4, 0.6, 0.8],
): CoverageZone[] {
  const grid = magnitudeGrid(peak)
  return magnitudes.map((m) => ({ magnitude: m, rings: isoRings(grid, m) }))
}
