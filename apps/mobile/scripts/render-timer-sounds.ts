/**
 * Writes the Timer's signal sounds to assets/sounds as 16-bit mono WAV files.
 * They copy the website's Web Audio synth (playSignal in src/pages/TimerPage.tsx):
 * an 880 Hz sine, one beep fading out over 0.5 s, and two beeps for time up
 * (0.1 s on, a 50 ms gap, then a fade to 0.6 s). The website plays them at a
 * tenth of full scale; a phone speaker needs more, so these peak at half.
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

function render(seconds: number, gain: (t: number) => number): Buffer {
  const samples = Math.round(seconds * RATE);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const t = i / RATE;
    const value = Math.sin(2 * Math.PI * FREQUENCY * t) * PEAK * gain(t);
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
  console.log(`Wrote beep.wav and double-beep.wav to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
