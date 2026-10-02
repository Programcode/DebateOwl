import type { Page } from '@playwright/test';

// Browser automation has no microphone and no speech service. These helpers
// replace the page's speech recognition, speech synthesis, and microphone
// with scripted ones, so a test can "say" words and read what the browser
// voice was asked to speak.

interface VoiceWindow {
  __speech: { say: (text: string) => void };
  __spoken: string[];
}

/** Install the scripted speech APIs. `recognition: false` models a browser without speech recognition. */
export async function stubSpeech(page: Page, options: { recognition?: boolean } = {}) {
  await page.addInitScript(({ recognition }) => {
    const speech = { say: (_text: string) => {} };
    class ScriptedRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: (event: unknown) => void = () => {};
      onerror: (event: unknown) => void = () => {};
      onend: () => void = () => {};
      start() {
        speech.say = (text: string) => this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text, confidence: 1 } }] });
      }
      stop() { setTimeout(() => this.onend(), 0); }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, writable: true, value: recognition ? ScriptedRecognition : undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, writable: true, value: undefined });

    const spoken: string[] = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel: () => {},
        speak: (utterance: SpeechSynthesisUtterance) => {
          spoken.push(utterance.text);
          setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 20);
        },
      },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
    Object.assign(window, { __speech: speech, __spoken: spoken });
  }, { recognition: options.recognition ?? true });
}

/** Deliver words to the page as a final recognition result. The microphone must be on. */
export async function say(page: Page, text: string) {
  await page.evaluate((words) => (window as unknown as VoiceWindow).__speech.say(words), text);
}

/** Everything the browser's own voice was asked to read, in order. */
export async function spokenByBrowser(page: Page): Promise<string> {
  return await page.evaluate(() => (window as unknown as VoiceWindow).__spoken.join(' '));
}
