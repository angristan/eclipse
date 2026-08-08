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
