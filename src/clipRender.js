// Turns a landscape Twitch clip into a vertical 1080x1920 short:
//   blurred, darkened copy of the clip filling the frame,
//   the full clip sharp in the middle (nothing cropped, so it suits every streamer's layout),
//   the channel name at the top, and big captions in the lower area.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Words -> caption chunks of up to 3 words, broken at pauses and long durations.
export function chunkWords(words, { maxWords = 3, maxSeconds = 1.6, gap = 0.6 } = {}) {
  const chunks = [];
  let current = [];
  for (const w of words) {
    const last = current.at(-1);
    const tooLong = current.length && w.end - current[0].start > maxSeconds;
    const paused = last && w.start - last.end > gap;
    if (current.length >= maxWords || tooLong || paused) {
      chunks.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) chunks.push(current);
  return chunks.map((c) => ({ start: c[0].start, end: c.at(-1).end, text: c.map((w) => w.word).join(' ') }));
}

function assTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
}

function assEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');
}

export function buildAss(words) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,2,80,80,360,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = chunkWords(words).map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(Math.max(c.end, c.start + 0.3))},Caption,,0,0,0,,${assEscape(c.text)}`
  );
  return header + lines.join('\n') + '\n';
}

// Runs transcribe.py; returns words, or [] if transcription isn't available or fails.
export async function transcribe(videoPath) {
  if ((process.env.CLIP_CAPTIONS || 'on') === 'off') return [];
  const python = process.env.WHISPER_PYTHON || 'python3';
  const model = process.env.CLIP_WHISPER_MODEL || 'small.en';
  try {
    const { stdout } = await run(python, [path.join(HERE, 'transcribe.py'), videoPath, model], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15 * 60 * 1000
    });
    return JSON.parse(stdout).words ?? [];
  } catch (err) {
    console.error('Captions skipped, transcription failed:', err.message?.split('\n')[0]);
    return [];
  }
}

function filterGraph(assPath, topText) {
  const bg = '[0:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,eq=brightness=-0.18,scale=1080:1920,setsar=1[bg]';
  const fg = '[0:v]scale=1080:-2,setsar=1[fg]';
  let chain = '[bg][fg]overlay=(W-w)/2:(H-h)/2';
  if (topText) {
    const safe = topText.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019");
    chain += `,drawtext=fontfile=${FONT}:text='${safe}':fontcolor=white:fontsize=50:borderw=4:bordercolor=black:x=(w-text_w)/2:y=330`;
  }
  if (assPath) chain += `,subtitles='${assPath.replace(/'/g, "\\'")}'`;
  return `${bg};${fg};${chain}[out]`;
}

// inputPath: landscape mp4. Returns { output, captioned }.
export async function renderVertical(inputPath, workDir, { topText = '' } = {}) {
  const words = await transcribe(inputPath);
  let assPath = null;
  if (words.length) {
    assPath = path.join(workDir, 'captions.ass');
    await writeFile(assPath, buildAss(words));
  }
  const output = path.join(workDir, 'vertical.mp4');
  await run(
    'ffmpeg',
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-filter_complex', filterGraph(assPath, topText),
      '-map', '[out]', '-map', '0:a?',
      '-t', '180',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      output
    ],
    { timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
  );
  return { output, captioned: words.length > 0 };
}
