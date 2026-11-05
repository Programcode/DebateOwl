# Published rounds

A visitor who finishes the no-login mini round on `/ai-debate` can publish it as a public page at `/ai-debate/round/<slug>`. Nothing is stored before they tick the opt-in box and press Publish. The `demo-rebuttal` Edge Function checks that every turn is one it served, removes personal data, decides whether the page may be indexed, and returns a delete token the browser keeps to unpublish.

## Sub-features

- `round-private-default`: after the second turn the publish panel shows an unticked box and a disabled `Publish round` button, and no `published_demo_rounds` row exists.
- `round-publish-redacted`: an argument with a name given as "My name is …" and an email publishes with `We removed 2 personal details`, the row holds `[name removed]` and `[email removed]`, and the page is `noindex` with no canonical link.
- `round-publish-indexable`: two turns with at least 60 words from the visitor and nothing redacted publish as indexable; the page has `index, follow` and a canonical `https://debateowl.com/ai-debate/round/<slug>`.
- `round-closed-table`: anon cannot select `published_demo_rounds`; `get_published_demo_round` returns only `slug, motion, side, turns, indexable, published_at`.
- `round-unpublish`: `Unpublish this round` on the page (shown only in the publishing browser) deletes the row and shows `This round is not published`.

## How to get to it (user POV)

- Open `/ai-debate`, play both turns of the mini round, then use the panel under the exchange.
- Open the `Open your public round` link, or any `/ai-debate/round/<slug>` address.

## Driving it with verify.sh + Playwright

Preconditions:

- `bin/verify.sh up` turns the demo on: `DEMO_ENABLED=true` and Cloudflare's always-pass Turnstile test secret for the functions, `VITE_DEMO_ENABLED=true` and the test site key for Vite. The bot check passes by itself once the widget loads, which needs the browser to reach `challenges.cloudflare.com`.
- No sign-in: the recipe uses the plain `page`.
- The demo allows three sessions per IP per UTC day; the recipe deletes `demo_round_sessions` rows before each test.

Steps (`recipes/published-rounds.spec.ts`):

- **Play.** Choose `Write my own motion` in `Motion`, fill `Your motion` with a motion unique to the project, fill `Your argument`, wait for `Get the AI’s rebuttal` to enable, click it, then fill `Your reply (one more turn)` and click `Send reply`. Each answer shows in `data-testid="demo-rebuttal"`.
- **Opt in.** Check the checkbox named `Publish this round as a public page…`, click `Publish round`. The panel `data-testid="demo-published"` says what was removed; `data-testid="demo-published-indexing"` says whether search engines may list it.
- **Rows.** Read `published_demo_rounds` through `admin`, filtered by the motion.
- **Page.** Follow `Open your public round`. The motion is `data-testid="published-motion"`; check `meta[name="robots"]` and `link[rel="canonical"]`.

Build-time behaviour (not in the recipe, checked by hand): publish rows through `publish_demo_round` with the service role, then build against the stack with `VITE_LOCAL_PREVIEW=true VITE_LOCAL_SUPABASE_URL=… VITE_LOCAL_SUPABASE_ANON_KEY=… VITE_COLLABORATION_URL=ws://127.0.0.1:$COLLABORATION_PORT npm run build` (values from `.verify/state/drive.env`). The log prints `prerender: N published round(s) to prerender`; only indexable rounds appear under `dist/ai-debate/round/` and in `dist/sitemap.xml`, and `/ai-debate` links them under `Rounds visitors published`. `vite preview` answers extensionless directories with the landing page, so serve `dist/` with a server that resolves `<path>/index.html` to load a prerendered round by its address.

## Gotchas

- A publish must happen within two hours of the first turn: the session token expires and the function answers `unknown_session`.
- One page per session (`already_published`), and only the first indexable round on a motion and side stays indexable, so recipes use a motion unique to the project and delete their rows afterwards.
- The redaction patterns cannot recognise a bare name ("Anna said…"). The opt-in text asks visitors not to include one.
- A published round's static HTML outlives an unpublish until the next production build; the browser shows it as removed at once.
