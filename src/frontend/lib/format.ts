/**
 * Date/time rendering shared by the pages. Event times are stored as POSIX seconds
 * (UTC) and shown in the viewer's local time with the zone name in brackets, e.g.
 * "Oct 29, 2026, 02:00 PM (CET)", so nobody mistakes them for UTC.
 */

export function formatLocalDateTime(input: number | Date | null | undefined): string {
  if (input === null || input === undefined) return 'Not set';
  const date = typeof input === 'number' ? new Date(input * 1000) : input;
  if (Number.isNaN(date.getTime())) return 'Not set';
  const parts = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).formatToParts(date);
  const zone = parts.find(p => p.type === 'timeZoneName')?.value;
  // Drop the zone and the separator in front of it, then add the zone in brackets.
  let text = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === 'timeZoneName') continue;
    if (p.type === 'literal' && parts[i + 1]?.type === 'timeZoneName') continue;
    text += p.value;
  }
  return zone ? `${text.trim()} (${zone})` : text.trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * POSIX seconds → value for an <input type="datetime-local"> ("YYYY-MM-DDTHH:MM") in the
 * viewer's local time, the inverse of parseDateTimeLocal. Pages that let the organiser
 * edit event times fill their inputs with this so the input never shows UTC.
 */
export function toDateTimeLocalValue(posixSeconds: number | null | undefined): string {
  if (posixSeconds === null || posixSeconds === undefined) return '';
  const d = new Date(posixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (local time) → POSIX seconds; NaN for an empty or invalid value. */
export function parseDateTimeLocal(value: string): number {
  if (!value) return NaN;
  return Math.floor(new Date(value).getTime() / 1000);
}
