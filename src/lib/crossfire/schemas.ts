import { z } from 'zod';

export const MAX_CROSSFIRE_RESOLUTION_CHARS = 500;
export const MAX_CROSSFIRE_ARGUMENT_CHARS = 16_000;
export const MAX_CROSSFIRE_SEED_QUESTIONS = 10;
export const MAX_CROSSFIRE_TURN_CHARS = 2_000;
export const MAX_CROSSFIRE_TRANSCRIPT_TURNS = 40;
export const MAX_CROSSFIRE_TRANSCRIPT_CHARS = 24_000;
export const MAX_CROSSFIRE_REPLY_CHARS = 2_500;
export const MAX_CROSSFIRE_DEBRIEF_ITEMS = 8;
export const CROSSFIRE_DURATION_OPTIONS = [180, 300, 480] as const;

const boundedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

export const CrossfireModeSchema = z.enum(['question-ai', 'ai-questions-user']);
export type CrossfireMode = z.infer<typeof CrossfireModeSchema>;

export const CrossfireStyleSchema = z.enum(['cooperative', 'evasive', 'aggressive']);
export type CrossfireStyle = z.infer<typeof CrossfireStyleSchema>;

export const CrossfireConfigSchema = z.object({
  resolution: boundedText(1, MAX_CROSSFIRE_RESOLUTION_CHARS),
  argument: boundedText(1, MAX_CROSSFIRE_ARGUMENT_CHARS),
  mode: CrossfireModeSchema,
  style: CrossfireStyleSchema,
  durationSeconds: z.union([
    z.literal(CROSSFIRE_DURATION_OPTIONS[0]),
    z.literal(CROSSFIRE_DURATION_OPTIONS[1]),
    z.literal(CROSSFIRE_DURATION_OPTIONS[2]),
  ]),
  useSourceLibrary: z.boolean(),
  seedQuestions: z.array(boundedText(1, MAX_CROSSFIRE_TURN_CHARS)).max(MAX_CROSSFIRE_SEED_QUESTIONS),
}).strict();
export type CrossfireConfig = z.infer<typeof CrossfireConfigSchema>;

export const CrossfireSetupConfigSchema = CrossfireConfigSchema.extend({
  resolution: z.string().max(MAX_CROSSFIRE_RESOLUTION_CHARS),
  argument: z.string().max(MAX_CROSSFIRE_ARGUMENT_CHARS),
});
export type CrossfireSetupConfig = z.infer<typeof CrossfireSetupConfigSchema>;

export const CrossfirePrefillSchema = z.object({
  resolution: z.string().trim().max(MAX_CROSSFIRE_RESOLUTION_CHARS).optional(),
  argument: z.string().trim().max(MAX_CROSSFIRE_ARGUMENT_CHARS).optional(),
  seedQuestions: z.array(boundedText(1, MAX_CROSSFIRE_TURN_CHARS)).max(MAX_CROSSFIRE_SEED_QUESTIONS).optional(),
  source: z.enum(['generate', 'attack']).optional(),
}).strict();
export type CrossfirePrefill = z.infer<typeof CrossfirePrefillSchema>;

export const CrossfireTurnSchema = z.object({
  id: z.string().trim().min(1).max(40),
  sequence: z.number().int().positive().max(MAX_CROSSFIRE_TRANSCRIPT_TURNS),
  speaker: z.enum(['user', 'ai']),
  kind: z.enum(['question', 'answer']),
  text: boundedText(1, MAX_CROSSFIRE_TURN_CHARS),
  createdAt: z.number().int().nonnegative(),
}).strict();
export type CrossfireTurn = z.infer<typeof CrossfireTurnSchema>;

export const CrossfireTranscriptSchema = z.array(CrossfireTurnSchema)
  .max(MAX_CROSSFIRE_TRANSCRIPT_TURNS)
  .superRefine((turns, context) => {
    const total = turns.reduce((sum, turn) => sum + turn.text.length, 0);
    if (total > MAX_CROSSFIRE_TRANSCRIPT_CHARS) {
      context.addIssue({
        code: 'custom',
        message: `Transcript exceeds ${MAX_CROSSFIRE_TRANSCRIPT_CHARS} characters`,
      });
    }
  });

export const CrossfireReplySchema = z.object({
  type: z.enum(['question', 'answer']),
  text: boundedText(1, MAX_CROSSFIRE_REPLY_CHARS),
}).strict();
export type CrossfireReply = z.infer<typeof CrossfireReplySchema>;

const TurnReferenceSchema = z.object({
  turnIds: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
  claim: boundedText(1, 800),
}).strict();

const BetterFollowUpSchema = z.object({
  turnIds: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
  question: boundedText(1, MAX_CROSSFIRE_REPLY_CHARS),
  reason: boundedText(1, 800),
}).strict();

export const CrossfireDebriefSchema = z.object({
  concessionsSecured: z.array(TurnReferenceSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  controlledQuestions: z.array(TurnReferenceSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  weakOrRepetitiveQuestions: z.array(TurnReferenceSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  evasiveOrIncompleteAnswers: z.array(TurnReferenceSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  missedFollowUps: z.array(TurnReferenceSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  betterFollowUpQuestions: z.array(BetterFollowUpSchema).max(MAX_CROSSFIRE_DEBRIEF_ITEMS),
  strongestExchange: TurnReferenceSchema.nullable(),
}).strict();
export type CrossfireDebrief = z.infer<typeof CrossfireDebriefSchema>;

export const CrossfireNextTurnInputSchema = z.object({
  operation: z.literal('next-turn'),
  config: CrossfireConfigSchema,
  transcript: CrossfireTranscriptSchema,
  expectedReply: z.enum(['question', 'answer']),
}).strict();

export const CrossfireDebriefInputSchema = z.object({
  operation: z.literal('debrief'),
  config: CrossfireConfigSchema,
  transcript: CrossfireTranscriptSchema.min(1),
}).strict();

export const CrossfireAIInputSchema = z.discriminatedUnion('operation', [
  CrossfireNextTurnInputSchema,
  CrossfireDebriefInputSchema,
]);
export type CrossfireAIInput = z.infer<typeof CrossfireAIInputSchema>;

export const CrossfireRequestStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }).strict(),
  z.object({
    status: z.literal('pending'),
    expectedReply: z.enum(['question', 'answer']),
  }).strict(),
  z.object({
    status: z.literal('failed'),
    expectedReply: z.enum(['question', 'answer']),
    errorKind: z.enum(['timeout', 'response', 'request']),
    message: z.string().trim().min(1).max(1_000),
  }).strict(),
]);
export type CrossfireRequestState = z.infer<typeof CrossfireRequestStateSchema>;

const SetupStateSchema = z.object({
  phase: z.literal('setup'),
  config: CrossfireSetupConfigSchema,
}).strict();

const ActiveStateSchema = z.object({
  phase: z.literal('active'),
  sessionId: z.string().trim().min(1).max(80),
  config: CrossfireConfigSchema,
  turns: CrossfireTranscriptSchema,
  startedAt: z.number().int().nonnegative(),
  endsAt: z.number().int().positive(),
  request: CrossfireRequestStateSchema,
}).strict();

const DebriefingStateSchema = z.object({
  phase: z.literal('debriefing'),
  sessionId: z.string().trim().min(1).max(80),
  config: CrossfireConfigSchema,
  turns: CrossfireTranscriptSchema.min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  endedReason: z.enum(['manual', 'timer']),
  requestStatus: z.enum(['pending', 'failed']),
  errorKind: z.enum(['timeout', 'response', 'request']).optional(),
  errorMessage: z.string().trim().min(1).max(1_000).optional(),
}).strict();

const CompleteStateSchema = z.object({
  phase: z.literal('complete'),
  sessionId: z.string().trim().min(1).max(80),
  config: CrossfireConfigSchema,
  turns: CrossfireTranscriptSchema.min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  endedReason: z.enum(['manual', 'timer']),
  debrief: CrossfireDebriefSchema,
}).strict();

export const CrossfireStateSchema = z.discriminatedUnion('phase', [
  SetupStateSchema,
  ActiveStateSchema,
  DebriefingStateSchema,
  CompleteStateSchema,
]);
export type CrossfireState = z.infer<typeof CrossfireStateSchema>;

export const PersistedCrossfireDraftSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().trim().min(1).max(128),
  savedAt: z.number().int().nonnegative(),
  state: z.discriminatedUnion('phase', [SetupStateSchema, ActiveStateSchema, DebriefingStateSchema]),
}).strict();
export type PersistedCrossfireDraft = z.infer<typeof PersistedCrossfireDraftSchema>;

export function collectDebriefTurnIds(debrief: CrossfireDebrief): string[] {
  return [
    ...debrief.concessionsSecured,
    ...debrief.controlledQuestions,
    ...debrief.weakOrRepetitiveQuestions,
    ...debrief.evasiveOrIncompleteAnswers,
    ...debrief.missedFollowUps,
    ...debrief.betterFollowUpQuestions,
    ...(debrief.strongestExchange ? [debrief.strongestExchange] : []),
  ].flatMap((item) => item.turnIds);
}
