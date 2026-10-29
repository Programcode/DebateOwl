/**
 * Writes the Timer's signal sounds to assets/sounds as 16-bit mono WAV files.
 * They copy the website's Web Audio synth (playSignal in src/lib/timer-signals.ts):
 * an 880 Hz sine, one beep fading out over 0.5 s, and two beeps for time up
 * (0.1 s on, a 50 ms gap, then a fade to 0.6 s). The website plays them at a
 * tenth of full scale; a phone speaker needs more, so these peak at half.
 * The knock (points of information open or close) is two short 180 Hz
 * triangle taps, 0.18 s apart, each fading out over 80 ms.
 * Run from the repository root after changing a sound:
 *
 *   npx tsx apps/mobile/scripts/render-timer-sounds.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RATE = 22_050;
const FREQUENCY = 880;
const PEAK = 0.5;
// A few milliseconds of ramp at each edge, so the tone starts and stops without a click.
const EDGE = 0.004;
const outDir = join(__dirname, '../assets/sounds');

/** Gain at time t for a tone that starts at `from`, holds, then fades exponentially to 0.001 by `to`. */
function envelope(t: number, from: number, to: number, holdUntil = from): number {
  if (t < from || t > to) return 0;
  const attack = Math.min(1, (t - from) / EDGE);
  const release = Math.min(1, (to - t) / EDGE);
  const fade = t <= holdUntil ? 1 : Math.pow(0.001 / PEAK, (t - holdUntil) / (to - holdUntil));
  return attack * release * fade;
}

const sine = (t: number, frequency: number) => Math.sin(2 * Math.PI * frequency * t);
// The Web Audio triangle: a linear ramp between -1 and 1.
const triangle = (t: number, frequency: number) => {
  const phase = (t * frequency) % 1;
  return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
};

function render(seconds: number, gain: (t: number) => number, wave = sine, frequency = FREQUENCY): Buffer {
  const samples = Math.round(seconds * RATE);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const t = i / RATE;
    const value = wave(t, frequency) * PEAK * gain(t);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32_767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'beep.wav'), render(0.5, (t) => envelope(t, 0, 0.5)));
  await writeFile(
    join(outDir, 'double-beep.wav'),
    render(0.6, (t) => (t < 0.1 ? envelope(t, 0, 0.1, 0.1) : envelope(t, 0.15, 0.6))),
  );
  const knockTap = (t: number, from: number) => envelope(t, from, from + 0.08);
  await writeFile(
    join(outDir, 'knock.wav'),
    render(0.3, (t) => (t < 0.18 ? knockTap(t, 0) : knockTap(t, 0.18)), triangle, 180),
  );
  console.log(`Wrote beep.wav, double-beep.wav and knock.wav to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
