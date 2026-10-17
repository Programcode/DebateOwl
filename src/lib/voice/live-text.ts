import { stripAudioTags } from '@debatelab/core/contract/voice-tags';

/**
 * Opponent text while the model writes it, as the finished reply will read:
 * audio tags are for the voice only, and one still being written ("[sig")
 * is held back until it closes.
 */
export function readableLiveText(text: string): string {
  return stripAudioTags(text.replace(/\[[^\]]*$/, ''));
}
