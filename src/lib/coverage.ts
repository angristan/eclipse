// Ground-truth coverage zones: sweep the whole eclipse and record, for every
// grid point on Earth, the maximum eclipse magnitude it sees while the Sun is
// up. Iso-contours of that field are the classic infographic bands. This is
// brute force on purpose — the offset-curve shortcut breaks near the
// day/night terminator, where a zone's edge belongs to a different instant
// than the shadow's passage.

import { AstroTime, SiderealTime } from 'astronomy-engine'
import { contours } from 'd3-contour'
import { EARTH_A, EARTH_B } from './geometry'
import { shadowFrame, type LngLat } from './shadow'

const E2 = 1 - (EARTH_B * EARTH_B) / (EARTH_A * EARTH_A)
const RAD = Math.PI / 180

export interface CoverageZone {
  magnitude: number
  /** GeoJSON-style polygons: each entry is [exteriorRing, ...holeRings]. */
  polygons: LngLat[][][]
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
  stepDeg = 1.25,
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
      // Count an instant only while the Sun is visible there (refracted
      // horizon ~ -1.7 degrees). What people see at sunset counts: a spot
      // where the Sun sets mid-eclipse keeps the coverage it reached by
      // then, and the zones fade out only where the Sun is gone before
      // first contact.
      const len = Math.sqrt(px * px + py * py + pz * pz)
      const sunUp = -(px * s.ax + py * s.ay + pz * s.az) / len
      if (sunUp < -0.03) continue
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
 * Iso-contour polygons of `level` on the grid via d3-contour (marching
 * squares with correct saddle, hole, and winding handling). The field is
 * below every level outside the grid, so zones touching the Arctic edge or
 * the antimeridian close along the map border.
 */
export function isoPolygons(grid: Grid, level: number): LngLat[][][] {
  const { lngs, lats, values } = grid
  const cols = lngs.length
  const lngStep = lngs[1] - lngs[0]
  const latStep = lats[1] - lats[0]
  const toGeo = ([x, y]: number[]): LngLat => [
    Math.max(-180, Math.min(180, lngs[0] + (x - 0.5) * lngStep)),
    Math.max(-85, Math.min(85, lats[0] + (y - 0.5) * latStep)),
  ]
  const [multi] = contours()
    .size([cols, lats.length])
    .smooth(true)
    .thresholds([level])(Array.from(values))
  return multi.coordinates.map((polygon) => polygon.map((ring) => ring.map(toGeo)))
}

/** Iso-coverage zones for one eclipse. Used by validation tests. */
export function coverageZones(
  peak: AstroTime,
  magnitudes = [0.2, 0.4, 0.6, 0.8],
): CoverageZone[] {
  const grid = magnitudeGrid(peak)
  return magnitudes.map((m) => ({ magnitude: m, polygons: isoPolygons(grid, m) }))
}

export interface CoverageImage {
  width: number
  height: number
  /** RGBA pixels, ready for ImageData. */
  pixels: Uint8ClampedArray
  /** Image corners for a MapLibre canvas source: TL, TR, BR, BL. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
}

const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * RAD) / 2))

/**
 * The coverage field as a Mercator-warped raster: rows are spaced so the
 * linear image warp of a MapLibre canvas source lands every latitude in the
 * right place. Bilinear sampling then stepped alpha gives smooth AFP-style
 * bands with no polygon topology to break — zones may wrap poles, cross the
 * antimeridian, or hug the terminator freely.
 */
export function coverageImage(grid: Grid, width = 1440, height = 720): CoverageImage {
  const { lngs, lats, values } = grid
  const cols = lngs.length
  const rows = lats.length
  const lngStep = lngs[1] - lngs[0]
  const latStep = lats[1] - lats[0]
  const top = mercY(lats[rows - 1])
  const bottom = mercY(lats[0])
  const pixels = new Uint8ClampedArray(width * height * 4)

  const sample = (lng: number, lat: number) => {
    const x = (lng - lngs[0]) / lngStep
    const y = (lat - lats[0]) / latStep
    const c0 = Math.max(0, Math.min(cols - 2, Math.floor(x)))
    const r0 = Math.max(0, Math.min(rows - 2, Math.floor(y)))
    const fx = Math.max(0, Math.min(1, x - c0))
    const fy = Math.max(0, Math.min(1, y - r0))
    const v00 = values[r0 * cols + c0]
    const v01 = values[r0 * cols + c0 + 1]
    const v10 = values[(r0 + 1) * cols + c0]
    const v11 = values[(r0 + 1) * cols + c0 + 1]
    return (v00 * (1 - fx) + v01 * fx) * (1 - fy) + (v10 * (1 - fx) + v11 * fx) * fy
  }

  for (let py = 0; py < height; py++) {
    const merc = top - ((py + 0.5) / height) * (top - bottom)
    const lat = (2 * Math.atan(Math.exp(merc)) - Math.PI / 2) / RAD
    for (let px = 0; px < width; px++) {
      const lng = -180 + ((px + 0.5) / width) * 360
      const m = sample(lng, lat)
      const alpha = m >= 0.8 ? 0.18 : m >= 0.6 ? 0.14 : m >= 0.4 ? 0.1 : m >= 0.2 ? 0.05 : 0
      const i = (py * width + px) * 4
      pixels[i] = 232
      pixels[i + 1] = 154
      pixels[i + 2] = 93
      pixels[i + 3] = Math.round(alpha * 255)
    }
  }

  return {
    width,
    height,
    pixels,
    coordinates: [
      [-180, lats[rows - 1]],
      [180, lats[rows - 1]],
      [180, lats[0]],
      [-180, lats[0]],
    ],
  }
}

const SHADOW_W = 360
const SHADOW_H = 180
let shadowEcef: { ex: Float64Array; ey: Float64Array; ez: Float64Array } | null = null
let shadowPixels: Uint8ClampedArray | null = null

function shadowGridEcef() {
  if (shadowEcef) return shadowEcef
  const n = SHADOW_W * SHADOW_H
  const ex = new Float64Array(n)
  const ey = new Float64Array(n)
  const ez = new Float64Array(n)
  const top = mercY(85)
  const bottom = mercY(-85)
  for (let py = 0; py < SHADOW_H; py++) {
    const merc = top - ((py + 0.5) / SHADOW_H) * (top - bottom)
    const lat = 2 * Math.atan(Math.exp(merc)) - Math.PI / 2
    const nrm = EARTH_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2)
    const cp = Math.cos(lat)
    for (let px = 0; px < SHADOW_W; px++) {
      const lng = (-180 + ((px + 0.5) / SHADOW_W) * 360) * RAD
      const i = py * SHADOW_W + px
      ex[i] = nrm * cp * Math.cos(lng)
      ey[i] = nrm * cp * Math.sin(lng)
      ez[i] = nrm * (1 - E2) * Math.sin(lat)
    }
  }
  shadowEcef = { ex, ey, ez }
  return shadowEcef
}

/**
 * The Moon's shadow at one instant, as a raster: darkness proportional to
 * the light blocked right now, deep at the umbra and fading to nothing at
 * the penumbra edge, softly clipped at the terminator. Same warp as the
 * coverage raster, so the moving shadow and the static gradient read as one
 * system. The pixel buffer is reused between calls.
 */
export function shadowImage(time: AstroTime): CoverageImage {
  const { ex, ey, ez } = shadowGridEcef()
  const f = shadowFrame(time)
  const theta = SiderealTime(time) * 15 * RAD
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const rp = f.penumbraKm
  const ru = Math.abs(f.umbraKm)
  const { x: ax, y: ay, z: az } = f.axis
  const { x: mx, y: my, z: mz } = f.moon
  if (!shadowPixels) shadowPixels = new Uint8ClampedArray(SHADOW_W * SHADOW_H * 4)
  const out = shadowPixels
  for (let i = 0; i < ex.length; i++) {
    const px = ex[i] * cosT - ey[i] * sinT
    const py = ex[i] * sinT + ey[i] * cosT
    const pz = ez[i]
    let alpha = 0
    const len = Math.sqrt(px * px + py * py + pz * pz)
    const sunUp = -(px * ax + py * ay + pz * az) / len
    if (sunUp > -0.03) {
      const dx = px - mx
      const dy = py - my
      const dz = pz - mz
      const cx = dy * az - dz * ay
      const cy = dz * ax - dx * az
      const cz = dx * ay - dy * ax
      const dist = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const m = (rp - dist) / (rp - ru)
      if (m > 0) {
        const horizonFade = Math.min(1, (sunUp + 0.03) / 0.05)
        alpha = Math.min(1, m) ** 1.6 * 0.62 * horizonFade
      }
    }
    const o = i * 4
    out[o] = 12
    out[o + 1] = 8
    out[o + 2] = 6
    out[o + 3] = Math.round(alpha * 255)
  }
  return {
    width: SHADOW_W,
    height: SHADOW_H,
    pixels: out,
    coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]],
  }
}
