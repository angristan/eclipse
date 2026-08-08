import { EclipseKind, SearchGlobalSolarEclipse, MakeTime } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { localCircumstances } from './local'
import { centralPath, shadowCenterLngLat, shadowFrame } from './shadow'

// Cross-check the home-grown shadow geometry against astronomy-engine's own
// eclipse predictions, using the 2026-08-12 total eclipse (Iceland / Spain).
const eclipse2026 = SearchGlobalSolarEclipse(MakeTime(new Date(Date.UTC(2026, 7, 1))))

describe('catalog', () => {
  it('contains the 2026-08-12 total eclipse', () => {
    const entry = buildCatalog().find((e) => e.id === '2026-08-12')
    expect(entry).toBeDefined()
    expect(entry!.kind).toBe(EclipseKind.Total)
  })
})

describe('shadow geometry', () => {
  it('puts the shadow center where astronomy-engine puts greatest eclipse', () => {
    expect(eclipse2026.kind).toBe(EclipseKind.Total)
    const center = shadowCenterLngLat(eclipse2026.peak)
    expect(center).not.toBeNull()
    const [lng, lat] = center!
    expect(Math.abs(lat - eclipse2026.latitude!)).toBeLessThan(0.5)
    expect(Math.abs(lng - eclipse2026.longitude!)).toBeLessThan(0.5)
  })

  it('computes a plausible umbra size for a total eclipse', () => {
    const frame = shadowFrame(eclipse2026.peak)
    expect(frame.onSurface).toBe(true)
    expect(frame.umbraKm).toBeGreaterThan(0) // positive = total, not annular
    expect(frame.umbraKm).toBeLessThan(200)
  })

  it('builds a central path that reaches Iceland and Spain', () => {
    const path = centralPath(eclipse2026.peak)
    expect(path).not.toBeNull()
    const lats = path!.centerLine.map(([, lat]) => lat)
    expect(Math.max(...lats)).toBeGreaterThan(60) // Arctic / Iceland end
    expect(Math.min(...lats)).toBeLessThan(45) // Iberian end
  })
})

describe('local circumstances', () => {
  it('predicts a deep eclipse in Madrid on 2026-08-12', () => {
    const entry = buildCatalog().find((e) => e.id === '2026-08-12')!
    const info = localCircumstances(entry, 40.4168, -3.7038)
    expect(info).not.toBeNull()
    expect(info!.obscuration).toBeGreaterThan(0.9)
  })

  it('returns null far from the eclipse', () => {
    const entry = buildCatalog().find((e) => e.id === '2026-08-12')!
    expect(localCircumstances(entry, -40, 170)).toBeNull() // New Zealand, night side
  })
})

describe('nearest central line', () => {
  it('finds the 2026 center line within a few hundred km of Madrid', async () => {
    const { centralPath, nearestOnLine } = await import('./shadow')
    const path = centralPath(eclipse2026.peak)!
    const nearest = nearestOnLine(path.centerLine, [-3.7038, 40.4168])
    expect(nearest).not.toBeNull()
    expect(nearest!.km).toBeGreaterThan(0)
    expect(nearest!.km).toBeLessThan(400)
  })
})

describe('footprint rings', () => {
  it('closes the penumbra ring without long chords near the limb', async () => {
    const { footprint, haversineKm } = await import('./shadow')
    // One hour before peak the penumbra is partially off Earth.
    const ring = footprint(eclipse2026.peak.AddDays(-60 / 1440), 'penumbra')
    expect(ring.length).toBeGreaterThan(100)
    for (let i = 1; i < ring.length; i++) {
      expect(haversineKm(ring[i - 1], ring[i])).toBeLessThan(1500)
    }
  })

  it('returns an empty ring when the shadow is entirely off Earth', async () => {
    const { footprint } = await import('./shadow')
    const ring = footprint(eclipse2026.peak.AddDays(1), 'penumbra')
    expect(ring).toEqual([])
  })
})

describe('polarClose', () => {
  it('caps a pole-encircling ring and leaves normal rings alone', async () => {
    const { polarClose, unwrapLngs, footprint } = await import('./shadow')
    // Synthetic ring around the north pole.
    const around: [number, number][] = [[0, 80], [120, 80], [240, 80], [360, 80]]
    const capped = polarClose(around)
    expect(capped.length).toBe(6)
    expect(capped[4][1]).toBeCloseTo(89.99)
    // A real mid-latitude ring is unchanged.
    const ring = unwrapLngs(footprint(eclipse2026.peak, 'umbra'))
    expect(polarClose(ring)).toEqual(ring)
    // The -72min penumbra encircles the pole and gets capped.
    const polar = unwrapLngs(footprint(eclipse2026.peak.AddDays(-72 / 1440), 'penumbra'))
    expect(polarClose(polar).length).toBe(polar.length + 2)
  })
})
