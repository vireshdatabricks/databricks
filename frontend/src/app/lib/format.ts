export const DISPLAY_TIME_ZONE: string | undefined = undefined;

const dateOptions: Intl.DateTimeFormatOptions = {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: DISPLAY_TIME_ZONE,
};

export function formatDate(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', dateOptions).format(date);
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    ...dateOptions, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function formatActor(value: string | null | undefined): string {
  if (!value || value === 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER') return 'Local test reviewer';
  const identity = value.trim();
  const localPart = identity.includes('@') ? identity.slice(0, identity.indexOf('@')) : identity;
  if (!localPart) return identity;
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en-GB'));
}

export function humanizeIdentifier(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replaceAll('_', ' ').replaceAll('.', ' / ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

export function formatDecided(statusCounts: Record<string, number>): string {
  const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const undecided = statusCounts.UNVALIDATED ?? statusCounts.undecided ?? 0;
  return `${(total - undecided).toLocaleString()} of ${total.toLocaleString()} decided`;
}

/** S17: option values as shown in selects — no null, undefined or blank, de-duplicated, sorted case-insensitively. */
export function normaliseOptions(values: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined') seen.add(text);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** S20: a period as "Jan 2024 – Oct 2026" (short, for tables) or "1 Jan 2024 – 1 Oct 2026" (full). Inputs are YYYY-MM-DD. */
export function formatPeriod(from: string | null | undefined, to: string | null | undefined, style: 'short' | 'full' = 'short'): string {
  if (!from || !to) return '—';
  const options: Intl.DateTimeFormatOptions = style === 'short' ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  const format = (value: string) => { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', options).format(date); };
  return `${format(from)} – ${format(to)}`;
}

/** Display-only sentence case for titles in lists; keeps acronyms (two or more capitals) as written. */
export function sentenceCase(text: string): string {
  return text.split(' ').map((word, index) => (index === 0 || /^[A-Z0-9]{2,}[^a-z]*$/.test(word) ? word : word.toLowerCase())).join(' ');
}
