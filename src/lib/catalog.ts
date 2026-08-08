// Eclipse catalog, enumerated at runtime from astronomy-engine — no data files.

import {
  AstroTime,
  EclipseKind,
  MakeTime,
  NextGlobalSolarEclipse,
  SearchGlobalSolarEclipse,
} from 'astronomy-engine'

export interface EclipseEntry {
  /** UTC date of the peak, e.g. "2026-08-12". Used as the URL identifier. */
  id: string
  kind: EclipseKind
  peak: AstroTime
  /** Peak fraction of the Sun's area obscured, seen from the best spot on Earth. */
  obscuration: number
  /** Geographic point of greatest eclipse; null for partial eclipses. */
  greatest: { lat: number; lng: number } | null
}

export function buildCatalog(fromYear = 2023, toYear = 2036): EclipseEntry[] {
  const entries: EclipseEntry[] = []
  let info = SearchGlobalSolarEclipse(MakeTime(new Date(Date.UTC(fromYear, 0, 1))))
  while (info.peak.date.getUTCFullYear() < toYear) {
    const central = info.kind === EclipseKind.Total || info.kind === EclipseKind.Annular
    const { latitude, longitude } = info
    entries.push({
      id: info.peak.date.toISOString().slice(0, 10),
      kind: info.kind,
      peak: info.peak,
      obscuration: info.obscuration ?? 0,
      greatest:
        central && latitude !== undefined && longitude !== undefined
          ? { lat: latitude, lng: longitude }
          : null,
    })
    info = NextGlobalSolarEclipse(info.peak)
  }
  return entries
}

export function nextEclipse(catalog: EclipseEntry[], now = new Date()): EclipseEntry {
  const t = MakeTime(now).ut
  return catalog.find((e) => e.peak.ut > t) ?? catalog[catalog.length - 1]
}
