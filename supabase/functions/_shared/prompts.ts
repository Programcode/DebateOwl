// Stable import path for DebateLab's layered prompts. The rules shared by
// every feature live in ./prompts/common.ts, each feature's task prompt and
// user-prompt builder in its own module, and composition in ./prompts/system.ts.

export * from "./prompts/common.ts";
export * from "./prompts/system.ts";
export { ASK_PROMPT, buildStreamingAskSystemPrompt } from "./prompts/ask.ts";
export { ATTACK_PROMPT } from "./prompts/attack.ts";
export { BRAINSTORM_PROMPT } from "./prompts/brainstorm.ts";
export { CROSSFIRE_PROMPT } from "./prompts/crossfire.ts";
export { FACTOIDS_PROMPT } from "./prompts/factoids.ts";
export { GENERATE_PROMPT } from "./prompts/generate.ts";
export { SPARRING_PROMPT } from "./prompts/sparring.ts";
