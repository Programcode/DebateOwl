// The client AI boundary. App code imports AI requests and errors from here only.
export {
  AIError,
  AIAuthError,
  AIRateLimitError,
  AISubscriptionError,
  AIModelRestrictionError,
  AIProviderError,
  AIResponseError,
  TimeoutError,
  isAIAuthError,
  isAIRateLimitError,
  isAIProviderError,
  isTimeoutError,
  isAISubscriptionError,
  isAIModelRestrictionError,
  classifyAIError,
  mapAIError,
} from './errors';
export type { AIErrorClassification } from './errors';
export {
  REQUEST_TIMEOUT_MS,
  debateContextForRequest,
  refreshDebatesIfMissing,
  withOutputLanguage,
  reportAIFailure,
} from './request';
export type { DiscoveredSource, ResultWithSources } from './sources';
export type { LiveGeneration, LivePhase } from './live';
export { CROSSFIRE_REQUEST_TIMEOUT_MS, crossfire, crossfireSignal } from './features/crossfire';
export { generateCase } from './features/generate';
export { attackCase } from './features/attack';
export { brainstorm } from './features/brainstorm';
export { factoids } from './features/factoids';
export { askChat, boundAskMessage, boundAskHistory, isAskMessageWithinBudget } from './features/ask';
export type { AskChatOptions } from './features/ask';
export { generateSparringTurn, judgeSparringSession } from './features/sparring';
export type { SparringTurnResult } from './features/sparring';
