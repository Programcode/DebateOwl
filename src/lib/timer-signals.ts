export type TimerSignal = 'beep' | 'double-beep' | 'alarm' | 'knock';

let audioContext: AudioContext | null = null;

/** Synthesised timer cues, so no audio file has to load. Fails silently where audio is unavailable. */
export async function playSignal(type: TimerSignal): Promise<void> {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    audioContext ??= new AudioContextCtor();
    const ctx = audioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'double-beep') {
      // First beep
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0, now + 0.1);

      // Second beep
      osc.frequency.setValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.1, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'alarm') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'knock') {
      // Two short, low taps, like a knuckle on a table.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      for (const start of [now, now + 0.18]) {
        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
      }
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}
