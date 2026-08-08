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
      const main = [...z.rings].sort((a, b) => b.length - a.length)[0]
      expect(main.length).toBeGreaterThan(50)
      for (const f of [0.2, 0.5, 0.8]) {
        const [lng, lat] = main[Math.floor(main.length * f)]
        const info = SearchLocalSolarEclipse(eclipse2026.peak.AddDays(-1), new Observer(lat, lng, 0))
        expect(Math.abs(info.peak.time.ut - eclipse2026.peak.ut)).toBeLessThan(1)
        expect(info.obscuration).toBeGreaterThan(EXPECTED[String(z.magnitude)] - 0.08)
        expect(info.obscuration).toBeLessThan(EXPECTED[String(z.magnitude)] + 0.08)
      }
    }
  })

  it('produces zones for partial eclipses too', () => {
    const partial = SearchGlobalSolarEclipse(MakeTime(new Date(Date.UTC(2025, 2, 1))))
    const zones = coverageZones(partial.peak, [0.2, 0.6])
    expect(zones[0].rings.length).toBeGreaterThan(0)
    expect(zones[1].rings.length).toBeGreaterThan(0)
  })
})
