// Small helpers for working in UK local time (Europe/London), which shifts between
// GMT and BST. Everything in the database is stored in UTC; these convert at the edges.

const TZ = 'Europe/London';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23'
});

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// { isoDate: '2026-11-29', weekday: 0 (Sun) .. 6 (Sat), hhmm: '18:05' } for the given instant, in UK time.
export function ukParts(date = new Date()) {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    isoDate: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS[p.weekday],
    hhmm: `${p.hour}:${p.minute}`
  };
}

export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing isoDate (weeks run Monday to Sunday).
export function mondayOf(isoDate) {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((weekday + 6) % 7));
}

// Minutes UK time is ahead of UTC at a given instant (0 in winter, 60 in summer).
function ukOffsetMinutes(date) {
  const { isoDate, hhmm } = ukParts(date);
  const [h, m] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)), h, m);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

// UK wall clock time ('2026-11-30', '09:00') -> Date (UTC instant).
export function ukLocalToDate(isoDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const naive = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)), h, m);
  let result = naive - ukOffsetMinutes(new Date(naive)) * 60000;
  // Second pass settles the edge case where the first guess lands across a clock change.
  result = naive - ukOffsetMinutes(new Date(result)) * 60000;
  return new Date(result);
}

export function formatUkTime(isoUtc) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(isoUtc));
}
