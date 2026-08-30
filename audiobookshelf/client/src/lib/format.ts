/** Formatting helpers shared across the library and player surfaces. */

/** `9h 41m` / `41m` / `--` — for durations measured in seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '--'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  // Rounding minutes can land on 60; roll it into the hour rather than show "9h 60m".
  if (minutes === 60) return `${hours + 1}h`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** `1:02:03` / `4:05` — precise clock form for the player. */
export function formatClock(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}
