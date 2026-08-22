import { createCanvas, loadImage } from '@napi-rs/canvas';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_W = 160;
const CELL_H = 130;
const HEADER_H = 64;
const DAYHEAD_H = 32;
const PAD = 16;

const COLORS = {
  bg: '#0a0a0c',
  panel: '#141417',
  cell: '#1a1a1e',
  border: '#2a2a2e',
  text: '#f5f0e6',
  muted: '#8a8a90',
  gold: '#d9a548',
  goldLight: '#f0d98c',
  highlight: '#8b80f5',
  green: '#4caf6d',
  red: '#ff4d5e'
};

function formatUKTime(isoUtc) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(isoUtc));
}

export function todayISOInUK() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Draws text with a thin dark stroke behind it, so it stays legible over any thumbnail color.
function strokedText(ctx, text, x, y) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

// Draws img into the (x,y,w,h) box, cropping to cover it without distorting aspect ratio -
// same behavior as CSS background-size: cover.
function drawCover(ctx, img, x, y, w, h) {
  const srcRatio = img.width / img.height;
  const dstRatio = w / h;
  let sx, sy, sw, sh;
  if (srcRatio > dstRatio) {
    sh = img.height;
    sw = sh * dstRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dstRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function loadThumbnailImages(monthDates, dayInfo, thumbnails) {
  const cache = new Map();
  for (const date of monthDates) {
    const info = dayInfo.get(date);
    if (!info?.game) continue;
    const url = thumbnails[info.game.toLowerCase()];
    if (!url || cache.has(url)) continue;
    try {
      const res = await fetch(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      cache.set(url, await loadImage(buffer));
    } catch (err) {
      console.error(`Failed to load thumbnail for "${info.game}":`, err);
    }
  }
  return cache;
}

// monthDates: array of ISO date strings for the month, in order.
// dayInfo: Map keyed by ISO date -> { game, start_time_utc, who: string, open: number, full: boolean }
// thumbnails: { "game name lowercase": "https://..." }
export async function renderCalendarImage(title, monthDates, dayInfo, thumbnails = {}) {
  const daysInMonth = monthDates.length;
  const firstWeekday = (new Date(`${monthDates[0]}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const rows = Math.ceil((firstWeekday + daysInMonth) / 7);
  const width = CELL_W * 7 + PAD * 2;
  const height = HEADER_H + DAYHEAD_H + rows * CELL_H + PAD * 2;

  const images = await loadThumbnailImages(monthDates, dayInfo, thumbnails);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.goldLight;
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(title.toUpperCase(), PAD, PAD + 32);

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = COLORS.gold;
  WEEKDAY_HEADERS.forEach((day, i) => {
    ctx.fillText(day.toUpperCase(), PAD + i * CELL_W + 10, PAD + HEADER_H + 22);
  });

  const today = todayISOInUK();

  for (let i = 0; i < rows * 7; i++) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const x = PAD + col * CELL_W;
    const y = PAD + HEADER_H + DAYHEAD_H + row * CELL_H;

    const dateIndex = i - firstWeekday;
    if (dateIndex < 0 || dateIndex >= daysInMonth) {
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, CELL_W, CELL_H);
      continue;
    }

    const date = monthDates[dateIndex];
    const dayNum = Number(date.slice(-2));
    const info = dayInfo.get(date);
    const isToday = date === today;
    const thumbUrl = info?.game ? thumbnails[info.game.toLowerCase()] : undefined;
    const thumbImg = thumbUrl ? images.get(thumbUrl) : undefined;

    // Base cell fill / thumbnail
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
    ctx.clip();

    if (thumbImg) {
      drawCover(ctx, thumbImg, x + 1, y + 1, CELL_W - 2, CELL_H - 2);
      const gradient = ctx.createLinearGradient(0, y + CELL_H, 0, y);
      gradient.addColorStop(0, 'rgba(10,10,12,0.95)');
      gradient.addColorStop(0.55, 'rgba(10,10,12,0.55)');
      gradient.addColorStop(1, 'rgba(10,10,12,0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
    } else {
      ctx.fillStyle = isToday ? '#26243a' : COLORS.cell;
      ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
    }
    ctx.restore();

    // Status outline: red for scheduled/open, green for full, purple glow for today
    let outlineColor = COLORS.border;
    let glow = null;
    if (info?.game) {
      outlineColor = info.full ? COLORS.green : COLORS.red;
      glow = outlineColor;
    }
    if (isToday) {
      outlineColor = COLORS.highlight;
      glow = COLORS.highlight;
    }

    if (glow) {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
      ctx.restore();
    } else {
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, CELL_W, CELL_H);
    }

    // Text
    ctx.fillStyle = isToday ? COLORS.highlight : COLORS.goldLight;
    ctx.font = 'bold 16px sans-serif';
    strokedText(ctx, String(dayNum), x + 10, y + 22);

    if (info) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = info.game ? COLORS.text : COLORS.muted;
      const gameLabel = (info.game || 'game tbc').toUpperCase();
      const gameText = gameLabel.length > 16 ? `${gameLabel.slice(0, 15)}…` : gameLabel;
      strokedText(ctx, gameText, x + 10, y + 44);

      ctx.font = '11px sans-serif';
      ctx.fillStyle = COLORS.muted;
      const timeText = info.start_time_utc ? `${formatUKTime(info.start_time_utc)} UK` : 'time tbc';
      strokedText(ctx, timeText, x + 10, y + 60);

      if (info.who) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#d8d4c8';
        const whoText = info.who.length > 21 ? `${info.who.slice(0, 20)}…` : info.who;
        strokedText(ctx, whoText, x + 10, y + 76);
      }

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = info.full ? COLORS.green : COLORS.gold;
      strokedText(ctx, info.full ? 'FULL' : `${info.open} OPEN`, x + 10, y + CELL_H - 10);
    }
  }

  return canvas.toBuffer('image/png');
}
