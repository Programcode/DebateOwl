# Debate Sparring Mode — Implementation Plan

## Overview
A turn-based AI debate practice mode where the user argues one side and the AI argues the other, simulating a real debate round with timed speeches, rebuttals, and scoring.

## Architecture

### New Files
- `src/pages/SparringPage.tsx` — Main page with debate flow UI
- `src/components/features/sparring/SparringSetup.tsx` — Motion/format/side selection
- `src/components/features/sparring/SparringRound.tsx` — Active debate round UI
- `src/components/features/sparring/SparringScorecard.tsx` — Post-debate analysis
- `src/lib/ai/schemas/sparring.ts` — Zod schemas for sparring I/O
- `src/test/pages/SparringPage.test.tsx` — Tests

### Edge Function Changes
Add a `sparring` feature handler in `supabase/functions/ai/index.ts` (or better: a new `supabase/functions/sparring/index.ts` after the refactor).

## User Flow

1. **Setup** — User picks motion, side (Pro/Con), format (Standard/LD/PF), difficulty (Easy/Medium/Hard)
2. **Round Start** — Timer begins, user types their opening speech
3. **AI Response** — AI generates opponent's speech based on user's arguments
4. **Rebuttal** — User responds to AI's points, timer running
5. **AI Rebuttal** — AI counters user's rebuttal
6. **Repeat** — Continue for the number of speeches in the format
7. **Scorecard** — AI judges the debate, gives scores per category (Logic, Evidence, Delivery, Strategy) and detailed feedback

## Data Model

```typescript
interface SparringSession {
  id: string;
  motion: string;
  userSide: 'pro' | 'con';
  format: string;
  difficulty: 'easy' | 'medium' | 'hard';
  speeches: SparringSpeech[];
  scorecard?: SparringScorecard;
  createdAt: number;
}

interface SparringSpeech {
  speaker: 'user' | 'ai';
  role: string; // e.g., "Introductor", "R1"
  content: string;
  timestamp: number;
  timeUsed: number; // seconds
}

interface SparringScorecard {
  userScore: number; // 0-100
  aiScore: number;
  categories: { name: string; userScore: number; aiScore: number; feedback: string }[];
  overallFeedback: string;
  keyMoments: string[];
  improvementAreas: string[];
}
```

## AI Prompt Strategy

- **Difficulty levels** control AI's argument quality:
  - Easy: AI makes some weak arguments, misses obvious counters
  - Medium: AI argues competently but doesn't exploit every weakness
  - Hard: AI is ruthless, exploits every gap, uses advanced strategy
- **Context window**: Each AI turn receives the full debate history so it can reference and counter specific user points
- **Judging prompt**: Separate system prompt for the scorecard that evaluates both sides fairly

## UI Design

- Split-screen: User's speeches on left, AI's on right
- Timer bar at top (integrated with existing Timer component logic)
- Speech input: Large textarea with word count and time remaining
- Between speeches: Brief "AI is thinking..." with typing indicator
- Scorecard: Radar chart (using recharts) + detailed text feedback

## Integration Points

- Reuse `Timer` logic from TimerPage for speech timing
- Reuse `Markdown` component for rendering AI speeches
- Save completed sessions to History (new `savedSparring` in session store)
- Export sparring transcript to Word/PDF

## Estimated Effort
- Setup + Round UI: 4 hours
- AI integration (prompts, edge function): 3 hours
- Scorecard + judging: 2 hours
- Timer integration: 1 hour
- Tests: 2 hours
- **Total: ~12 hours**

---

# True Streaming & Edge Function Refactor Plan

## Current State
- Single monolithic `supabase/functions/ai/index.ts` (1300+ lines)
- Returns full JSON response after complete generation
- All features (generate, attack, brainstorm, factoids, ask) in one function

## Refactored Architecture

### Split into separate edge functions:
```
supabase/functions/
├── ai-generate/index.ts    — Case generation
├── ai-attack/index.ts      — Case attack/critique
├── ai-brainstorm/index.ts  — Brainstorm ideation
├── ai-factoids/index.ts    — Evidence research
├── ai-ask/index.ts         — Chat/coaching (streaming)
├── ai-sparring/index.ts    — Debate sparring
├── _shared/
│   ├── cors.ts
│   ├── auth.ts             — Token validation + rate limiting
│   ├── providers.ts        — callOpenAI, callAnthropic, callGoogle
│   ├── research.ts         — Exa search + deep research
│   └── usage.ts            — Usage logging + cost tracking
```

### True Streaming (for Ask/Chat)
1. Use Server-Sent Events (SSE) from the edge function
2. Stream raw text tokens as they arrive from the LLM
3. Client reads via `EventSource` or `fetch` with `ReadableStream`
4. Parse markdown on the fly, render incrementally

### Implementation:
```typescript
// Edge function (ai-ask)
return new Response(
  new ReadableStream({
    async start(controller) {
      const stream = await callOpenAIStream(messages, model);
      for await (const chunk of stream) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
      }
      controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
      controller.close();
    }
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
);

// Client
const response = await fetch(url, { method: 'POST', body, headers });
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events from buffer, update UI incrementally
}
```

### For Structured JSON (Generate, Attack, etc.)
- Option A: Stream the raw JSON text and parse when complete (simpler)
- Option B: Have the LLM output in sections, stream each section as it completes
- Option C: Keep current approach (full response) but with the animated UX we already built

### Migration Steps
1. Extract shared utilities into `_shared/` modules
2. Create individual function files, importing from shared
3. Update client to call new endpoints
4. Add streaming to `ai-ask` first (easiest — plain text output)
5. Optionally add streaming to other features later

### Estimated Effort
- Shared module extraction: 3 hours
- Split into 6 functions: 4 hours
- True streaming for Ask: 3 hours
- Client streaming reader: 2 hours
- Testing + migration: 3 hours
- **Total: ~15 hours**
