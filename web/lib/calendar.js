const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

export function formatDateUK(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function dayLabel(isoDate) {
  const abbr = WEEKDAY_ABBR[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return `${abbr} ${formatDateUK(isoDate)}`;
}

export function getMonthDates(monthOffset = 0) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + monthOffset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = new Date(Date.UTC(year, month, i + 1));
    return d.toISOString().slice(0, 10);
  });
}

export function getMonthTitle(monthOffset = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatUKTime(isoUtc) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(isoUtc));
}

export function todayISOInUK() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
