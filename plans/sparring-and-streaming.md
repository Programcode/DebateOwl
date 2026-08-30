# Debate Sparring Mode — Implementation Plan

**Status:** Implemented locally on 2026-08-30. Production migration and deployment remain separate release operations.

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
Add a `sparring` feature handler in `supabase/functions/ai/index.ts` or a dedicated `supabase/functions/sparring/index.ts`.

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

## Delivered

- Standard, Lincoln-Douglas, and Public Forum turn plans with either user side
- Deadline-based timers, pause/resume/reset, offline-safe tab persistence, retries, and keyboard submit
- Transcript-aware opponent turns, signed AI-turn integrity, atomic/idempotent judging, and a four-category scorecard
- History, settings, navigation, home, auth reset, delete-all, DOCX/PDF export, service-worker preload, and en/es/hu integration
- Unit, integration, Deno, desktop/mobile browser, reduced-motion, overflow, and live provider-contract coverage

Streaming remains tracked independently in `plans/streaming-ai.md`; it is not part of the turn-based sparring contract.

## Original Estimated Effort
- Setup + Round UI: 4 hours
- AI integration (prompts, edge function): 3 hours
- Scorecard + judging: 2 hours
- Timer integration: 1 hour
- Tests: 2 hours
- **Total: ~12 hours**
