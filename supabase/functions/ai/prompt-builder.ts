// Stable import path for the ai function's per-request user prompts. The
// builders live with each feature's task prompt under ../_shared/prompts/.

export type { Feature } from "../_shared/prompts/common.ts";
export { buildUserPrompt } from "../_shared/prompts/system.ts";
export {
  type AskBasePromptInput,
  buildAskBasePrompt,
  getAskModeGuidance,
} from "../_shared/prompts/ask.ts";
export {
  buildCrossfireDebriefPrompt,
  buildCrossfireNextTurnPrompt,
  type CrossfireDebriefPromptInput,
  type CrossfireMode,
  type CrossfireNextTurnPromptInput,
  type CrossfirePromptConfig,
  type CrossfirePromptTurn,
  type CrossfireStyle,
  type CrossfireTurnKind,
  type CrossfireTurnSpeaker,
  formatCrossfireTranscript,
} from "../_shared/prompts/crossfire.ts";
