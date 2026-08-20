import { createCanvas } from '@napi-rs/canvas';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_W = 150;
const CELL_H = 110;
const HEADER_H = 60;
const DAYHEAD_H = 32;
const PAD = 16;

function formatUKTime(isoUtc) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(isoUtc));
}

export function todayISOInUK() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// monthDates: array of ISO date strings for the month, in order.
// dayInfo: Map keyed by ISO date -> { game, start_time_utc, who: string, open: number, full: boolean }
export function renderCalendarImage(title, monthDates, dayInfo) {
  const daysInMonth = monthDates.length;
  const firstWeekday = (new Date(`${monthDates[0]}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const rows = Math.ceil((firstWeekday + daysInMonth) / 7);
  const width = CELL_W * 7 + PAD * 2;
  const height = HEADER_H + DAYHEAD_H + rows * CELL_H + PAD * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#f2f3f5';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(title, PAD, PAD + 30);

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#949ba4';
  WEEKDAY_HEADERS.forEach((day, i) => {
    ctx.fillText(day.toUpperCase(), PAD + i * CELL_W + 10, PAD + HEADER_H + 22);
  });

  const today = todayISOInUK();

  for (let i = 0; i < rows * 7; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const x = PAD + col * CELL_W;
    const y = PAD + HEADER_H + DAYHEAD_H + row * CELL_H;

    ctx.strokeStyle = '#1e1f22';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, CELL_W, CELL_H);

    const dateIndex = i - firstWeekday;
    if (dateIndex < 0 || dateIndex >= daysInMonth) continue;

    const date = monthDates[dateIndex];
    const dayNum = Number(date.slice(-2));
    const info = dayInfo.get(date);
    const isToday = date === today;

    ctx.fillStyle = isToday ? '#3c4270' : '#313338';
    ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

    ctx.fillStyle = isToday ? '#c9cdfb' : '#dbdee1';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(String(dayNum), x + 10, y + 22);

    if (info?.game) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#f2f3f5';
      const gameText = info.game.length > 16 ? `${info.game.slice(0, 15)}…` : info.game;
      ctx.fillText(gameText, x + 10, y + 42);

      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#949ba4';
      const timeText = info.start_time_utc ? `${formatUKTime(info.start_time_utc)} UK` : 'time tbc';
      ctx.fillText(timeText, x + 10, y + 58);

      if (info.who) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#b5bac1';
        const whoText = info.who.length > 21 ? `${info.who.slice(0, 20)}…` : info.who;
        ctx.fillText(whoText, x + 10, y + 74);
      }

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = info.full ? '#23a55a' : '#f0b232';
      ctx.fillText(info.full ? 'FULL' : `${info.open} OPEN`, x + 10, y + CELL_H - 10);
    }
  }

  return canvas.toBuffer('image/png');
}
