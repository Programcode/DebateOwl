import {
  CrossfireConfigSchema,
  CrossfireDebriefSchema,
  CrossfireSetupConfigSchema,
  CrossfireStateSchema,
  CrossfireTurnSchema,
  type CrossfireConfig,
  type CrossfireDebrief,
  type CrossfirePrefill,
  type CrossfireState,
  type CrossfireSetupConfig,
  type CrossfireTurn,
} from './schemas';

export type CrossfireAction =
  | { type: 'config-patched'; patch: Partial<CrossfireSetupConfig> }
  | { type: 'session-started'; sessionId: string; now: number }
  | { type: 'user-turn-submitted'; turn: CrossfireTurn; expectedReply: 'question' | 'answer' }
  | { type: 'ai-turn-received'; turn: CrossfireTurn }
  | {
    type: 'request-failed';
    expectedReply: 'question' | 'answer';
    errorKind: 'timeout' | 'response' | 'request';
    message: string;
  }
  | { type: 'request-retried' }
  | { type: 'session-ended'; now: number; reason: 'manual' | 'timer' }
  | {
    type: 'debrief-failed';
    errorKind: 'timeout' | 'response' | 'request';
    message: string;
  }
  | { type: 'debrief-retried' }
  | { type: 'debrief-received'; debrief: CrossfireDebrief }
  | { type: 'state-restored'; state: CrossfireState }
  | { type: 'session-reset'; prefill?: CrossfirePrefill };

const DEFAULT_CONFIG: CrossfireSetupConfig = {
  resolution: '',
  argument: '',
  mode: 'question-ai',
  style: 'cooperative',
  durationSeconds: 180,
  useSourceLibrary: false,
  seedQuestions: [],
};

export function createCrossfireSetupState(prefill?: CrossfirePrefill): CrossfireState {
  return {
    phase: 'setup',
    config: {
      ...DEFAULT_CONFIG,
      resolution: prefill?.resolution ?? '',
      argument: prefill?.argument ?? '',
      seedQuestions: prefill?.seedQuestions ?? [],
    },
  };
}

function appendTurn(turns: CrossfireTurn[], turn: CrossfireTurn): CrossfireTurn[] | null {
  const parsed = CrossfireTurnSchema.safeParse(turn);
  if (!parsed.success) return null;
  if (turns.some((existing) => existing.id === parsed.data.id)) return null;
  if (parsed.data.sequence !== turns.length + 1) return null;
  return [...turns, parsed.data];
}

export function crossfireReducer(state: CrossfireState, action: CrossfireAction): CrossfireState {
  switch (action.type) {
    case 'config-patched': {
      if (state.phase !== 'setup') return state;
      const config = CrossfireSetupConfigSchema.safeParse({ ...state.config, ...action.patch });
      return config.success ? { ...state, config: config.data } : state;
    }
    case 'session-started': {
      if (state.phase !== 'setup') return state;
      const config = CrossfireConfigSchema.safeParse(state.config);
      if (!config.success) return state;
      return {
        phase: 'active',
        sessionId: action.sessionId,
        config: config.data,
        turns: [],
        startedAt: action.now,
        endsAt: action.now + config.data.durationSeconds * 1_000,
        request: config.data.mode === 'ai-questions-user'
          ? { status: 'pending', expectedReply: 'question' }
          : { status: 'idle' },
      };
    }
    case 'user-turn-submitted': {
      if (state.phase !== 'active' || state.request.status !== 'idle') return state;
      const expectedKind = state.config.mode === 'question-ai' ? 'question' : 'answer';
      const expectedReply = state.config.mode === 'question-ai' ? 'answer' : 'question';
      if (action.turn.speaker !== 'user' || action.turn.kind !== expectedKind || action.expectedReply !== expectedReply) {
        return state;
      }
      const turns = appendTurn(state.turns, action.turn);
      if (!turns) return state;
      return {
        ...state,
        turns,
        request: { status: 'pending', expectedReply },
      };
    }
    case 'ai-turn-received': {
      if (state.phase !== 'active' || state.request.status !== 'pending') return state;
      if (action.turn.speaker !== 'ai' || action.turn.kind !== state.request.expectedReply) return state;
      const turns = appendTurn(state.turns, action.turn);
      if (!turns) return state;
      return { ...state, turns, request: { status: 'idle' } };
    }
    case 'request-failed': {
      if (state.phase !== 'active' || state.request.status !== 'pending') return state;
      if (action.expectedReply !== state.request.expectedReply) return state;
      return {
        ...state,
        request: {
          status: 'failed',
          expectedReply: action.expectedReply,
          errorKind: action.errorKind,
          message: action.message.slice(0, 1_000),
        },
      };
    }
    case 'request-retried': {
      if (state.phase !== 'active' || state.request.status !== 'failed') return state;
      return {
        ...state,
        request: { status: 'pending', expectedReply: state.request.expectedReply },
      };
    }
    case 'session-ended': {
      if (state.phase !== 'active' || state.turns.length === 0) return state;
      return {
        phase: 'debriefing',
        sessionId: state.sessionId,
        config: state.config,
        turns: state.turns,
        startedAt: state.startedAt,
        endedAt: action.now,
        endedReason: action.reason,
        requestStatus: 'pending',
      };
    }
    case 'debrief-failed': {
      if (state.phase !== 'debriefing' || state.requestStatus !== 'pending') return state;
      return {
        ...state,
        requestStatus: 'failed',
        errorKind: action.errorKind,
        errorMessage: action.message.slice(0, 1_000),
      };
    }
    case 'debrief-retried': {
      if (state.phase !== 'debriefing' || state.requestStatus !== 'failed') return state;
      const { errorKind: _errorKind, errorMessage: _errorMessage, ...rest } = state;
      return { ...rest, requestStatus: 'pending' };
    }
    case 'debrief-received': {
      if (state.phase !== 'debriefing' || state.requestStatus !== 'pending') return state;
      const debrief = CrossfireDebriefSchema.safeParse(action.debrief);
      if (!debrief.success) return state;
      return {
        phase: 'complete',
        sessionId: state.sessionId,
        config: state.config,
        turns: state.turns,
        startedAt: state.startedAt,
        endedAt: state.endedAt,
        endedReason: state.endedReason,
        debrief: debrief.data,
      };
    }
    case 'state-restored': {
      const restored = CrossfireStateSchema.safeParse(action.state);
      return restored.success ? restored.data : createCrossfireSetupState();
    }
    case 'session-reset':
      return createCrossfireSetupState(action.prefill);
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function expectedUserTurnKind(state: CrossfireState): 'question' | 'answer' | null {
  if (state.phase !== 'active' || state.request.status !== 'idle') return null;
  if (state.config.mode === 'question-ai') return 'question';
  const latest = state.turns.at(-1);
  return latest?.speaker === 'ai' && latest.kind === 'question' ? 'answer' : null;
}

export function canEndCrossfireSession(state: CrossfireState): boolean {
  return state.phase === 'active';
}
