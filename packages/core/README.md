# @debatelab/core

Platform-neutral TypeScript shared by the web app and, later, the iOS app: languages, input validation, Zod schemas for AI requests and results, Crossfire and Sparring logic, and the Edge Function error reader. Files keep their old `src/lib/` relative paths, and each old path is now a one-line re-export, so web imports did not change.

## The rule

Code here must run in a browser and in React Native without changes:

- No DOM globals: no `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, or `location`. Take a value or a small interface as a parameter instead, as [`crossfire/storage.ts`](src/crossfire/storage.ts) does with `StorageLike`.
- No React, no web-only libraries (stores, i18n bindings, the Supabase client, analytics, UI kits).
- No `import.meta`, and no Deno or `esm.sh` specifiers.
- Plain TypeScript. The only dependency is `zod`, at the same range as the root.

[`tsconfig.json`](tsconfig.json) has no DOM library, and ESLint rejects browser globals and web-only imports here. [`src/globals.d.ts`](src/globals.d.ts) declares the few runtime globals both platforms have that the ES library lacks; add to it only what package code uses.

`src/contract/` re-exports the request contracts in `supabase/functions/_shared/` so package code has one import path for them. Those files stay where the Edge Functions import them.

## Adding a module

1. Move or write the file under `src/`, importing siblings by relative path (never `@/`).
2. If web code already imports it from `src/lib/`, leave `export * from '@debatelab/core/<path>';` at the old path.
3. Run `npm run typecheck` and `npm run lint` from the repository root.
