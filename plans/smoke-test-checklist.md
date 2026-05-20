# Smoke-test checklist: `codex/source-import-streaming-polish`

Run these before merging. Each row is one minute or less.

## Setup

- [ ] Deploy the two new edge functions: `npx supabase functions deploy ai-stream import-source`
- [ ] Verify required Supabase secrets are set: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `EXA_API_KEY`
- [ ] Verify the test user has at least one quota left (or is admin / Pro)

## Ask — streaming (OpenAI)

For each row, the AI provider is set to **OpenAI** in Settings, model `gpt-5.4-mini` (basic). Test mode = `general` (basic).

| # | Test | Expected |
|---|------|----------|
| 1 | Send a short question ("explain federalism in 2 sentences") | Response streams in word-by-word; final text matches what you saw stream |
| 2 | Navigate away from `/ask` mid-stream | No JS errors in console; if you go back, no orphaned "thinking…" indicator |
| 3 | Send a second message before the first finishes | First stream aborts cleanly, second starts; only the second result shows |
| 4 | Open DevTools → Network → throttle to "Slow 3G", send a question | Stream still works; deltas arrive slowly but no timeout error |
| 5 | DevTools → Application → clear `debate-trainer-storage`, refresh, send a question | Streaming still works after fresh state |

## Ask — non-streaming fallback (Gemini, Anthropic)

| # | Test | Expected |
|---|------|----------|
| 6 | Switch provider to **Google Gemini** (`gemini-3-flash-preview`), send a question | Response appears all at once (no streaming); content is reasonable |
| 7 | Switch provider to **Anthropic** (`claude-sonnet-4-6`), send a question | Same — full response, no streaming |
| 8 | Switch provider back to OpenAI but enable **Citation mode** | Should NOT stream (advanced mode disables streaming). Response arrives whole. |
| 9 | OpenAI + **Web search** on | Same as #8 — no streaming, whole response |

## Source Library — URL import

| # | Test | Expected |
|---|------|----------|
| 10 | Library → Import URL: paste `https://en.wikipedia.org/wiki/Federalism` | Preview shows title, excerpt, word count |
| 11 | Save preview | Toast "Source added"; source appears in library |
| 12 | Try importing the same URL again | Toast "Source already in library" (dedupe working) |
| 13 | Import a non-existent URL like `https://example.invalid/foo` | Error toast with sensible message |
| 14 | Try `http://localhost/` | Rejected: "Private and local network URLs cannot be imported." |
| 15 | Try `http://10.0.0.1/` | Same rejection |
| 16 | Try `javascript:alert(1)` | Rejected: "Only http and https URLs can be imported." |
| 17 | Try a known-redirect URL like `http://google.com` (302s to https) | Should succeed (public → public redirect allowed) |
| 18 | Rate-limit: import ~50 different URLs as a trial user | At #51, error toast with "daily import limit (50)" |

## Source Library — file import

| # | Test | Expected |
|---|------|----------|
| 19 | Import a small `.txt` file (<250KB) | Preview appears; save it |
| 20 | Import an empty `.txt` | "This file has no readable text" error |
| 21 | Import a `.txt` > 250KB | "File Too Large" error |

## Admin — Gift Trial (recently shipped)

| # | Test | Expected |
|---|------|----------|
| 22 | Admin → User Management → click "Gift trial" on a non-admin user | Dialog opens; defaults to 30 days |
| 23 | Submit gift with 7 days | Toast "Trial gifted"; user's row updates to show new trial end date in European format |
| 24 | Verify a row in `admin_grants` table via SQL | One row with grant_type='trial', target_user_id matches |

## Cross-browser

For each row, run the OpenAI streaming flow (test #1 above):

| # | Browser | Expected |
|---|---------|----------|
| 25 | Chrome desktop | Works |
| 26 | Firefox desktop | Works |
| 27 | Safari desktop (macOS) | Works (most likely to break due to SSE quirks) |
| 28 | Safari iOS | Works (most likely to break — iOS Safari has historical SSE issues over HTTP/2) |
| 29 | Chrome Android | Works |

## i18n

| # | Test | Expected |
|---|------|----------|
| 30 | Switch UI language to Spanish, run test #1 | UI in Spanish; streamed answer still in the configured AI output language |
| 31 | Switch UI to Hungarian, run test #1 | Same |
| 32 | Trigger mid-stream interruption (test #2) in Hungarian | Toast title uses Hungarian copy from `ask.streamInterrupted` |

## Rate-limit edge cases

| # | Test | Expected |
|---|------|----------|
| 33 | As a trial user near the AI daily limit, send Ask requests until blocked | Limit-reached modal appears (existing behavior) |
| 34 | URL imports also work while AI is rate-limited (separate counter) | Yes — imports use their own 50/day counter |

## What to look for in DevTools

- **Console**: No uncaught errors during any test. The "Aborted" `DOMException` on navigation is expected and not logged as error.
- **Network**: On test #2 (navigate mid-stream), the `ai-stream` request should show as "cancelled" or "aborted" in the Network tab.
- **Application → Local Storage**: `debate-trainer-storage` should NOT contain raw access tokens — just feature data.

## If something fails

1. Check `ai_requests` table for a row with `feature='ask'` or `feature='import_source'` and the failure timestamp. The `error_code` column tells you what failed server-side.
2. Edge function logs are visible in the Supabase dashboard under **Functions → Logs**.
3. To roll back the edge functions to the previous version, deploy from the previous commit:
   `git checkout <prev-sha> -- supabase/functions/ai-stream/index.ts supabase/functions/import-source/index.ts && npx supabase functions deploy ai-stream import-source && git checkout HEAD -- supabase/functions/`
