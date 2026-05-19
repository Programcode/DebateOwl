# Animation Polish Plan

## Goal

Keep the app feeling responsive and polished without slowing navigation or distracting from dense debate workflows.

## Current Status

- Route transitions, buttons, fields, cards, loading states, and major feature states have motion.
- Page transition duration was shortened after feedback.

## Implementation Steps

1. Audit all feature pages in the browser:
   - empty state
   - loading state
   - result state
   - options opening/closing
2. Keep route transitions under 180ms.
3. Add motion only where state changes are abrupt.
4. Ensure `prefers-reduced-motion` disables non-essential movement.
5. Avoid nested animated cards or layout-shifting animations.
6. Record before/after screenshots for dense pages.

## Tests

- Existing component tests.
- Browser screenshots for desktop and mobile widths.
- Manual reduced-motion check.

## Deployment

Frontend-only commit and deploy.
