// Input rules and the resend cooldown for LoginPage's email and demo-code forms.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321's limit on a forward-path, which Auth enforces too.
export const EMAIL_MAX_LENGTH = 254;

export type EmailProblem = 'required' | 'tooLong' | 'invalid';

/** Why `email` (already trimmed) can't be sent, or null when it can. */
export function emailProblem(email: string): EmailProblem | null {
  if (!email) return 'required';
  if (email.length > EMAIL_MAX_LENGTH) return 'tooLong';
  return EMAIL_PATTERN.test(email) ? null : 'invalid';
}

export const DEMO_CODE_PATTERN = /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Shapes what someone types or pastes into `DEMO-XXXX-XXXX`: uppercase, letters
 * and digits only, with the prefix and dashes put in for them. A dash appears only
 * before a character, so Backspace over a trailing dash is never undone.
 */
export function formatDemoCode(value: string): string {
  const chars = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Still typing the prefix itself.
  if ('DEMO'.startsWith(chars)) return chars;
  const body = (chars.startsWith('DEMO') ? chars.slice(4) : chars).slice(0, 8);
  return `DEMO-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ''}`;
}

const alnumCount = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').length;

/**
 * formatDemoCode, plus where the caret goes: after the same letter or digit it
 * followed before, so an edit mid-code doesn't throw it to the end.
 */
export function formatDemoCodeAt(value: string, caret: number): { value: string; caret: number } {
  const formatted = formatDemoCode(value);
  let before = alnumCount(value.slice(0, caret));
  // The prefix was added for them: its four letters come before the caret too.
  if (formatted.startsWith('DEMO-') && !value.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith('DEMO')) before += 4;
  let position = 0;
  for (let seen = 0; position < formatted.length && seen < before; position += 1) {
    if (/[A-Z0-9]/.test(formatted[position])) seen += 1;
  }
  return { value: formatted, caret: position };
}

// Auth's own minimum gap between two emails to one address (max_frequency).
export const RESEND_COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = 'debatelab:otp-resend-until:';
// Used when sessionStorage refuses writes, so the cooldown still holds on this page.
const memoryCooldowns = new Map<string, number>();

function cooldownKey(email: string): string {
  return `${COOLDOWN_KEY}${email.trim().toLowerCase()}`;
}

/** Starts the wait before another code can be sent to `email`. Kept for this tab, across reloads. */
export function startResendCooldown(email: string, seconds = RESEND_COOLDOWN_SECONDS, now = Date.now()): void {
  const until = now + seconds * 1000;
  try {
    sessionStorage.setItem(cooldownKey(email), String(until));
  } catch {
    // Storage is full or blocked; the cooldown then lasts until a reload.
    memoryCooldowns.set(cooldownKey(email), until);
  }
}

/** Whole seconds left before another code can be sent to `email`; 0 when it can be sent now. */
export function resendCooldownSeconds(email: string, now = Date.now()): number {
  let until: number;
  try {
    until = Number(sessionStorage.getItem(cooldownKey(email)) ?? memoryCooldowns.get(cooldownKey(email)) ?? 0);
  } catch {
    until = memoryCooldowns.get(cooldownKey(email)) ?? 0;
  }
  const seconds = Number.isFinite(until) ? Math.ceil((until - now) / 1000) : 0;
  if (seconds > 0) return Math.min(seconds, 60 * 60); // Capped, so a bad stored value can't lock the button for good.
  // Over: the address needn't stay in storage.
  memoryCooldowns.delete(cooldownKey(email));
  try {
    sessionStorage.removeItem(cooldownKey(email));
  } catch {
    // Nothing stored.
  }
  return 0;
}

/** `0:59`, `1:05`: how a wait reads on the Resend button and in errors. */
export function formatWait(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
