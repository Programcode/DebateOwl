// Voice rounds: how the opponent may direct the voice that performs its reply.

import { VOICE_AUDIO_TAGS } from "../voice-tags.ts";

const TAG_LIST = VOICE_AUDIO_TAGS.map((tag) => `[${tag}]`).join(", ");

const TAG_RULES = `Tags are stage directions, not words. Write them exactly as listed, in English and in square brackets, whatever the output language, and use square brackets for nothing else.`;

/** Appended to the sparring task when the opponent's speech will be spoken. */
export const SPARRING_SPOKEN_REPLY_RULES = `SPOKEN ROUND: This speech will be performed aloud by an expressive voice, so write "content" for the ear: short sentences, plain signposting, and no lists, headings, or markdown. You may direct the voice with inline audio tags placed where the delivery changes: ${TAG_LIST}. Use them the way a sharp human debater would, occasionally and with purpose. Most sentences carry none, and a whole speech needs only a few. ${TAG_RULES} Never put a tag in "strategy" or "targetedPoints".`;

/** Appended to a Crossfire next-turn request when the reply will be spoken. */
export const CROSSFIRE_SPOKEN_REPLY_RULES = `SPOKEN EXCHANGE: This reply will be performed aloud by an expressive voice. You may put one inline audio tag in "text" where it sharpens the delivery: ${TAG_LIST}. Use one only when the moment earns it, the way a sharp human debater would. Most replies need none. ${TAG_RULES}`;
