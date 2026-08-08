// Date / duration formatting helpers. All wall-clock output uses the
// browser's timezone, labeled so there is no ambiguity.

export const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function fmtDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  past: boolean
}

export function countdownTo(target: Date, now = new Date()): CountdownParts {
  let ms = target.getTime() - now.getTime()
  const past = ms < 0
  ms = Math.abs(ms)
  const s = Math.floor(ms / 1000)
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    past,
  }
}
