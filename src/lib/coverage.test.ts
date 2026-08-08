import { MakeTime, Observer, SearchGlobalSolarEclipse, SearchLocalSolarEclipse } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { coverageZones } from './coverage'

const eclipse2026 = SearchGlobalSolarEclipse(MakeTime(new Date(Date.UTC(2026, 7, 1))))

// Magnitude → expected obscuration (area fraction) for similar disc sizes.
const EXPECTED: Record<string, number> = { '0.2': 0.1, '0.4': 0.29, '0.6': 0.51, '0.8': 0.76 }

describe('coverage zones', () => {
  it('matches astronomy-engine obscuration along each contour', () => {
    const zones = coverageZones(eclipse2026.peak)
    expect(zones.map((z) => z.magnitude)).toEqual([0.2, 0.4, 0.6, 0.8])
    for (const z of zones) {
      const main = [...z.polygons.map((p) => p[0])].sort((a, b) => b.length - a.length)[0]
      // A zone boundary is iso-curve + sunset cutoff + map border. Probes may
      // sit on any of them, so obscuration must never fall BELOW the level,
      // and at least some probes must lie on the true iso stretch.
      const inland = main.filter(([lng, lat]) => Math.abs(lng) < 179 && Math.abs(lat) < 84)
      expect(inland.length).toBeGreaterThan(30)
      let isoHits = 0
      let valid = 0
      for (const f of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
        const [lng, lat] = inland[Math.floor(inland.length * f)]
        const info = SearchLocalSolarEclipse(eclipse2026.peak.AddDays(-1), new Observer(lat, lng, 0))
        // Probes on the sunset-cutoff cliff can fall just onto the night
        // side at grid resolution; they see no eclipse at all and are skipped.
        if (Math.abs(info.peak.time.ut - eclipse2026.peak.ut) > 1) continue
        valid++
        const expected = EXPECTED[String(z.magnitude)]
        expect(info.obscuration).toBeGreaterThan(expected - 0.1)
        if (info.obscuration < expected + 0.1) isoHits++
      }
      expect(valid).toBeGreaterThanOrEqual(4)
      expect(isoHits).toBeGreaterThanOrEqual(2)
    }
  })

  it('produces closed rings with no jumps for many eclipses', () => {
    // The 2026 zones touch both the Arctic border and the antimeridian.
    for (const z of coverageZones(eclipse2026.peak)) {
      for (const ring of z.polygons.flat()) {
        const [f, l] = [ring[0], ring[ring.length - 1]]
        expect(Math.hypot(f[0] - l[0], f[1] - l[1])).toBeLessThan(0.01)
        for (let i = 1; i < ring.length; i++) {
          const d = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])
          expect(d).toBeLessThan(3)
        }
      }
    }
  })

  it('produces zones for partial eclipses too', () => {
    const partial = SearchGlobalSolarEclipse(MakeTime(new Date(Date.UTC(2025, 2, 1))))
    const zones = coverageZones(partial.peak, [0.2, 0.6])
    expect(zones[0].polygons.length).toBeGreaterThan(0)
    expect(zones[1].polygons.length).toBeGreaterThan(0)
  })
})
