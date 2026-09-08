export function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--'
  const safe = Math.max(0, Math.round(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString('it-IT', options ?? { day: 'numeric', month: 'short', year: 'numeric' })
}
