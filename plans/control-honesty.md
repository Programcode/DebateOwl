# Control Honesty and Deterministic Toggles Plan

## Goal

Every visible mode, switch, and selector should clearly change the request, retrieval behavior, output shape, or post-processing. Controls that are only soft preferences should be labeled as such or made deterministic.

## Current Status

- Ask Citations, Web search, Pros/Cons, and Arg Map are wired to backend behavior.
- Attack fallacy and weighing toggles are now enforced after model output.
- Brainstorm side and output mode are now enforced after model output.
- Factoids source type and timeframe now influence Exa query construction.
- Generate side and format are enforced in metadata, while length, audience, and tone remain prompt-level controls.

## Implementation Steps

1. Add tests for every control payload:
   - frontend sends the selected value.
   - edge prompt includes the selected value.
   - post-processing enforces output shape when needed.
2. Strengthen Generate:
   - length controls target number of contentions and reasoning depth.
   - audience controls vocabulary and explanation density.
   - tone controls phrasing constraints.
3. Strengthen Ask modes:
   - General: direct coaching response.
   - Clarify: must include definitions, ambiguities, and follow-up questions.
4. Add UI microcopy only where needed:
   - "Format is currently custom" if more formats remain disabled.
   - Avoid implying a control changes retrieval if it only affects style.
5. Add a regression test matrix covering all mode combinations that matter.

## Tests

- `src/test/components/*Form.test.tsx` for visible state.
- `src/test/ai/client.test.ts` for payloads.
- Deno prompt and post-processing tests for backend enforcement.

## Rollout

Ship backend enforcement first, then adjust labels only if a control remains intentionally soft.
