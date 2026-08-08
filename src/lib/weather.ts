// Cloud cover forecast from Open-Meteo (free, CORS-enabled, no key).
// Only meaningful when the eclipse is within the ~16-day forecast horizon.

const FORECAST_DAYS = 16

export function forecastAvailable(peak: Date, now = new Date()): boolean {
  const days = (peak.getTime() - now.getTime()) / 86_400_000
  return days > -1 && days < FORECAST_DAYS
}

/** Cloud cover in percent at the hour nearest `at`, or null when unavailable. */
export async function cloudCover(lat: number, lng: number, at: Date): Promise<number | null> {
  const day = at.toISOString().slice(0, 10)
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&hourly=cloud_cover&timezone=UTC&start_date=${day}&end_date=${day}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { hourly?: { time: string[]; cloud_cover: (number | null)[] } }
  if (!data.hourly) return null
  const target = at.getTime()
  let best: number | null = null
  let bestDiff = Infinity
  data.hourly.time.forEach((t, i) => {
    const diff = Math.abs(new Date(t + ':00Z').getTime() - target)
    const value = data.hourly!.cloud_cover[i]
    if (value !== null && diff < bestDiff) {
      bestDiff = diff
      best = value
    }
  })
  return best
}

/** Sage (clear) → warm grey (overcast) for cloud-forecast coloring. */
export function cloudColor(fraction: number): string {
  const t = Math.max(0, Math.min(1, fraction))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(105, 110)},${mix(193, 103)},${mix(181, 92)})`
}

export interface CloudSample {
  lat: number
  lng: number
  /** When the shadow passes this point. */
  at: Date
}

/**
 * Cloud cover (0..1) for many points in one batched Open-Meteo request,
 * each evaluated at the hour nearest its own shadow-passage time.
 */
export async function cloudsAlongLine(samples: CloudSample[]): Promise<(number | null)[]> {
  if (samples.length === 0) return []
  const days = [...new Set(samples.map((s) => s.at.toISOString().slice(0, 10)))].sort()
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${samples.map((s) => s.lat.toFixed(2)).join(',')}` +
    `&longitude=${samples.map((s) => s.lng.toFixed(2)).join(',')}` +
    `&hourly=cloud_cover&timezone=UTC&start_date=${days[0]}&end_date=${days[days.length - 1]}`
  const res = await fetch(url)
  if (!res.ok) return samples.map(() => null)
  const body = await res.json()
  const list: { hourly?: { time: string[]; cloud_cover: (number | null)[] } }[] = Array.isArray(body)
    ? body
    : [body]
  return samples.map((s, i) => {
    const hourly = list[i]?.hourly
    if (!hourly) return null
    const target = s.at.getTime()
    let best: number | null = null
    let bestDiff = Infinity
    hourly.time.forEach((t, k) => {
      const diff = Math.abs(new Date(t + ':00Z').getTime() - target)
      const value = hourly.cloud_cover[k]
      if (value !== null && diff < bestDiff) {
        bestDiff = diff
        best = value / 100
      }
    })
    return best
  })
}
