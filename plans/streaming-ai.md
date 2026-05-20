# Streaming AI Plan

## Goal

Move real-time token streaming into its own implementation track instead of coupling it to Sparring. Ask should be the first streaming surface, then other AI modes can adopt section-level streaming later.

## Current State

- `supabase/functions/ai/index.ts` returns full JSON responses after generation.
- The UI shows animated loading states, but users do not see text arrive token by token.
- Ask is the best first target because its primary output is conversational text.

## Architecture

Use a dedicated streaming endpoint:

```
supabase/functions/
├── ai/index.ts             — existing structured JSON endpoint
├── ai-stream/index.ts      — SSE endpoint for Ask/chat
└── _shared/                — future shared auth, provider, research, usage helpers
```

## Streaming Protocol

Use Server-Sent Events over `fetch`:

- `event: delta` with `{ "text": "..." }`
- `event: final` with the final parsed Ask output
- `event: error` with `{ "message": "..." }`

This keeps rendering simple while still allowing the final structured object to contain citations, search metadata, follow-up questions, pros/cons, and argument maps.

## Client UX

- Append a placeholder assistant message immediately.
- Stream text into that message as chunks arrive.
- Render a typing cursor while the stream is open.
- When `final` arrives, replace the placeholder output with the structured Ask output.
- If streaming is unavailable, fall back to the existing non-streaming Ask request.

## Rollout

1. Add `ai-stream` for Ask only.
2. Add client helper with `ReadableStream` SSE parsing.
3. Update `AskPage` to use streaming helper.
4. Keep existing `ai` endpoint as fallback.
5. Add tests for SSE parser and Ask UI placeholder updates.
6. Later, extract shared auth/research/usage utilities from `ai/index.ts`.

## Tests

- parser handles split SSE frames.
- parser handles `delta`, `final`, and `error`.
- Ask UI appends a placeholder assistant message while streaming.
- fallback path still works when streaming fails before first token.
