// The backend sends naive-UTC datetimes (e.g. "2026-08-18T21:48:15.191094",
// no "Z"/offset suffix — Python's datetime.utcnow() has no tzinfo). Passing
// that string straight to `new Date(...)` makes JS interpret it as LOCAL
// time, not UTC — silently wrong by however many hours the browser's
// timezone is offset (this caused exams to appear to expire instantly for
// UTC+5 users). Always go through this helper for server timestamps.
export function parseServerUtc(iso: string): number {
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTz ? iso : iso + 'Z').getTime()
}

/** Seconds remaining until the next occurrence of `utcHour:00 UTC` (today if
 * still ahead, otherwise tomorrow). Both Test Bank and Problem of the Day
 * reset at UTC hour 19 (= 00:00 UTC+5). */
export function secondsUntilNextUtcHour(utcHour: number): number {
  const now = new Date()
  const next = new Date(now)
  next.setUTCHours(utcHour, 0, 0, 0)
  if (now.getTime() >= next.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000))
}

export function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0')
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0')
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}
