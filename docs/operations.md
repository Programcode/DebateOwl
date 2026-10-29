# Operations and deployment

**Status:** Current. Workflow, hosting, and runtime configuration files remain authoritative.

## Authorization boundary

Reading state and running local checks are safe. Production deployment, production data mutation, migrations, Edge Function deployment, secret changes, billing changes, and destructive operations require explicit authorization for the concrete target and operation.

Never infer authorization from access. Never use production to replace missing local or staging setup.

## CI workflows

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (the `Quality` workflow) owns credential-free quality and the pull-request browser smoke set. It does not deploy anything; Vercel does.

The quality job uses Node 22, `npm ci`, and Deno 2.9.6, then runs:

- `npm run docs:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:collaboration`
- `npm run test:edge`
- `npm run build`

On pull requests a parallel `browser-smoke` job runs the Playwright tests tagged `@smoke` (about 30) on desktop Chromium, port `18080`, with the browser download cached. [`.github/workflows/browser-nightly.yml`](../.github/workflows/browser-nightly.yml) runs the full desktop and mobile suite nightly and on demand. Pull requests that change only `docs/`, `plans/`, or Markdown skip `Quality` and run [`.github/workflows/docs.yml`](../.github/workflows/docs.yml), which runs `npm run docs:check` alone.

[`.github/workflows/database.yml`](../.github/workflows/database.yml) starts isolated local Supabase for pgTAP and the full-stack browser journeys. It takes about 20 minutes, so it runs on pull requests and `main` pushes only when they change the backend, the stores or clients that talk to it, or the gate itself (the `paths` list in the file), plus weekly and on demand.

[`.github/workflows/live-e2e.yml`](../.github/workflows/live-e2e.yml) runs the local stack against real providers nightly and on pull requests that change AI or research code. [`.github/workflows/model-matrix.yml`](../.github/workflows/model-matrix.yml) generates a case with every catalog model weekly and when AI code changes. [`.github/workflows/prod-canary.yml`](../.github/workflows/prod-canary.yml) checks production after each Vercel production deployment and daily. See [testing.md](testing.md) for all three. Both Supabase-starting jobs pull images from `public.ecr.aws`, because ghcr.io rate-limits shared runners.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging. It accepts eligible successful main-branch `Quality` runs or a manual dispatch from `main`. It runs only when `STAGING_E2E_ENABLED=true` and all protected values exist.

## When GitHub Actions cannot run

If Actions jobs fail within 2 to 5 seconds with no runner and no logs, the account is usually out of Actions minutes or blocked by billing. Nothing ran, so nothing passed or failed. Until Actions is restored, run `npm run verify` and `./.superset/db-gate.sh` locally at the final head, record the exact results in the PR, and say that CI did not run. Do not describe a local pass as green CI.

## Frontend hosting on Vercel

Vercel builds and serves the frontend from the Git repository. A push to `main` deploys both projects: `debate-navigator` to `https://debateowl.com` (the previous domain, `https://debate.pi-stack.org`, 301s there with the path and query kept; see `vercel.json`; `https://www.debateowl.com` redirects to the apex through the project's Domains setting, not `vercel.json`, also keeping the path and query), and `debatelab-staging` to `https://debatelab-staging.vercel.app`. Any other branch waits for an explicit preview (see [Opt-in previews](#opt-in-previews)). For a staging-pinned preview on the tailnet, use `npm run dev:preview` (see [development.md](development.md#preview-on-the-tailnet)). The production canary runs after each successful Vercel `Production` deployment of `debate-navigator`.

[`vercel.json`](../vercel.json) owns:

- automatic Git deployments: `main` only. `git.deploymentEnabled` sets `main` to true and `**` to false. A branch deploys when any matching rule is true, and a branch that matches nothing defaults to true, so the `**` rule has to stay. `*` does not match a slash, which would leave branches such as `cursor/…` deploying. A push that matches no true rule creates no deployment and does not count toward the 100-deployments-per-day cap;
- the Vite build command and `dist` output;
- rewrites of the app routes (`/app`, `/login`, `/share`, `/expocit/sources`) to `app-shell.html`; any other path that is not a file gets `404.html` with a real 404 status. `/expocit/sources` is also prerendered, and the filesystem is served before rewrites, so that file is what visitors and crawlers get. The rewrite remains for a build that did not emit it;
- `trailingSlash: false`, which 308-redirects `/app/settings/` to `/app/settings` before routing, since rewrite and redirect sources match exactly;
- 301 redirects from the retired brand pages (`/debatelab`, `/debatelab-by-programcode`, and the rest) to `/`;
- 301 redirects from the renamed comparison and pricing pages (`/debatelab-pricing`, `/debatelab-vs-chatgpt`, `/debatelab-vs-debateclub`, `/debatelab-vs-windebate`, also under `/hu/` or `/es/` and with a trailing slash) to their `/debateowl-*` pages in one hop, query kept;
- 301 redirects from retired guide slugs to the guide that replaced them, such as `/debate-weighing-guide` to `/how-to-weigh-in-debate`. The `trailingSlash` 308 runs first, so `/debate-weighing-guide/` reaches the same page in two permanent hops and needs no rule of its own;
- revalidating cache headers (`public, max-age=0, must-revalidate`, without `no-store`, so a document can enter the back/forward cache) for `/`, `index.html`, `app-shell.html`, and `theme-init.js`. `sw.js` stays `no-store` so a new service worker is not stuck in the HTTP cache. Hashed `/assets/` are immutable. The unhashed images in `public/` (the favicons, `apple-touch-icon.png`, the `icon-*.png` manifest icons, `hero-visual.jpg`, `placeholder.svg`) are cached for 30 days; the test reads `public/`, so a new icon file must be added to that rule. The Latin Fredoka and Nunito files in `public/fonts/` are cached for a year. Jam's capture iframe is removed on `pagehide` (never via `unload`) so that cross-origin frame cannot veto the cache;
- `noindex` headers for `/app`, `/login`, `/share` and `/embed/debate-timer`. The app shell's robots meta is `noindex, nofollow`, the same policy. Public pages, including the prerendered `/expocit/sources`, are `index, follow`. A route deletes the platform `Access-Control-Allow-Origin: *` header on HTML responses and leaves it on static assets;
- Content Security Policy and the other response security headers, including the `Permissions-Policy` that allows the microphone for the app's own origin only. Jam is limited to `https://js.jam.dev` and `https://recorder.jam.dev`; `script-src` does not include `unsafe-eval`. Web Analytics and Speed Insights stay on this origin (`/_vercel/insights` and `/_vercel/speed-insights`), which `'self'` already allows. Every path except `/embed/debate-timer` refuses to be framed (`X-Frame-Options: DENY` and `frame-ancestors 'none'`). `/embed/debate-timer` allows any site to frame it and gets its own CSP, which permits only same-origin scripts and requests. The two rules use complementary sources (`/((?!embed/debate-timer$).*)` and `/embed/debate-timer`) so no path gets both, a new embed needs its path added to both, and `src/test/vercel-deployment-config.test.ts` fails if two matching rules ever set the same header.

After `vite build`, [`scripts/prerender.mjs`](../scripts/prerender.mjs) renders the landing page, `/terms`, `/privacy`, `/about`, `/contact`, `/expocit/sources`, and the 404 page in Node through [`src/prerender/entry.tsx`](../src/prerender/entry.tsx). It writes them to `dist/index.html`, `dist/terms/index.html`, `dist/privacy/index.html`, `dist/about/index.html`, `dist/contact/index.html`, `dist/expocit/sources/index.html`, and `dist/404.html`, each with its own title, description, and canonical URL from [`src/lib/seo/pages.ts`](../src/lib/seo/pages.ts); `/about` and `/contact` carry AboutPage and ContactPage JSON-LD, and the contact and privacy addresses come from `contactEmail` and `privacyEmail` in [`src/config/site.json`](../src/config/site.json); the landing page also carries the Organization (with its `contactPoint`), SoftwareApplication (with the trial and Pro offers) and FAQPage JSON-LD. The built shell is kept as `dist/app-shell.html`. On load, the client replaces the prerendered HTML with the same page. A new public SPA page needs an entry in `PAGE_HEADS`, in the prerender entry, and a route kept out of the 404.

The free tools under `/tools` ([`src/pages/tools/`](../src/pages/tools/)) are prerendered the same way, listed in [`src/prerender/tool-pages.tsx`](../src/prerender/tool-pages.tsx) with heads in [`src/lib/seo/tool-pages.ts`](../src/lib/seo/tool-pages.ts). They render their own JSON-LD in the page body, so the dev server and the prerendered HTML carry the same structured data, and their `dateModified` is `TOOL_PAGES_MODIFIED` in that file: bump it with a substantive content change. Their speech times come from [`src/lib/free-tools/formats.ts`](../src/lib/free-tools/formats.ts), which cites a league source per format.

The landing page and the free tools also exist in Hungarian and Spanish, each at its own address: `/hu`, `/es`, and the tools under translated slugs such as `/hu/tools/vitaidomero` and `/es/tools/cronometro-debate`. [`src/config/localized-routes.json`](../src/config/localized-routes.json) is the one list of those addresses; the router, the prerender, `check-site` and `llms.txt` read it. The prerender renders each one in its language, with `<html lang>`, a self-canonical, and `hreflang` links for `en`, `hu`, `es` and `x-default` (English) on all three versions; pages without translations get no `hreflang`. Heads come from the `pageHead` catalog section in that language. The translated tool pages reuse the English widgets, take their copy from [`src/pages/tools/localized/`](../src/pages/tools/localized/), and set `dateModified` from that copy's `modified` date. Opening a translated address chooses its language, like a `?lang=` link, so Start leads into the app in that language; choosing another language there moves to that language's address. The old homepage links `/?lang=hu` and `/?lang=es` get a `vercel.json` 301 to `/hu` and `/es`. Vercel appends the original query, so the browser arrives at `/hu?lang=hu`, which is canonical to `/hu`; the client drops `?lang=` on load. `?lang=` on any other page (`/app?lang=hu`) is not redirected.

`/embed/debate-timer` is a second Vite HTML entry ([`embed/debate-timer/index.html`](../embed/debate-timer/index.html)), not an app route: it loads only the timer, never the app shell, Jam, analytics or the service worker, so a site that frames it sees no third-party request. It is `noindex` with its canonical URL on `/tools/debate-timer`, and the service worker leaves `/embed/` alone.

[`scripts/sitemap.mjs`](../scripts/sitemap.mjs) then writes `dist/sitemap.xml` from every page in `dist/` that names itself as canonical and is not `noindex`. A page with `hreflang` links in its head is listed with the same alternates as `xhtml:link` entries. Each `<lastmod>` is the `dateModified` the page declares in its JSON-LD: the guide pages' `CONTENT_DATE` in [`scripts/generate_seo_content.py`](../scripts/generate_seo_content.py), the legal pages' "last updated" dates, the tool pages' `TOOL_PAGES_MODIFIED`, and the landing page's last source commit. A page without a date is listed without `<lastmod>`.

[`scripts/check-site.mjs`](../scripts/check-site.mjs) runs next and fails the build when an internal link, a `#fragment`, a sitemap URL or an `llms.txt` URL does not resolve (it applies the `vercel.json` redirects and rewrites), when JSON-LD does not parse or carries HTML entities, when a FAQPage question is not visible on its page, when the home page's entity graph has an unresolved `@id`, a `WebSite` or `SoftwareApplication` not named for the product, or no `Organization.sameAs`, when a page's `publisher` or `about` names an `@id` the home page does not define, when an indexed page other than `/terms`, `/privacy`, and `/expocit/sources` lacks its question H2 (`#short-answer`) as the first H2 (a page whose H1 is already that question may instead put the answer in a `#short-answer` paragraph before the first H2), when a page's first heading is not its H1 or a heading skips a level (H1 to H3), when an image has no alt text, a button has no name or a form field has no label, or when a page's `hreflang` links do not resolve, leave out the page itself or `x-default`, disagree with `<html lang>`, or differ from the set on a page they name.

[`scripts/check-links.mjs`](../scripts/check-links.mjs) runs after it and fails the build when a sitemap page other than `/terms`, `/privacy` and `/expocit/sources` has fewer than 3 inbound links from other sitemap pages, or when the home page links to fewer than 15 distinct sitemap pages. `node scripts/check-links.mjs --report` prints every count after a build. The home page reaches the guides and tools through [`GuideHub.tsx`](../src/components/landing/GuideHub.tsx).

The guide pages in `public/<slug>/index.html` are generated, not hand-edited: run `python3 scripts/generate_seo_content.py` and commit its output. Short pages live in its `PAGES` list; pages with long-form copy, their own highlight-card descriptions, and their own FAQs (which also feed the page's FAQPage JSON-LD) live in [`scripts/seo_guides.py`](../scripts/seo_guides.py). Each page's "Related" block shows up to six pages from its own topic cluster and one from each of two other clusters, picked from `CLUSTERS`; every page in `PAGES` must sit in exactly one cluster, and the generator stops when one does not. Paragraphs also get up to three in-body links from `LINK_PHRASES`, specific phrases first; `python3 scripts/generate_seo_content.py --links` lists the links each page got. A guide entry can set a later `modified` date for that page alone; no page is dated earlier than `CONTENT_DATE`, which covers the copy every guide shares, including the related and in-body links, so move it when `CLUSTERS` or `LINK_PHRASES` change. Sections hold paragraphs and `h3`, `steps`, `list`, `table` and `example` blocks, plus a `speech_times` block that builds the speech-times table from the free timer's formats in [`src/lib/free-tools/formats.ts`](../src/lib/free-tools/formats.ts), so the guide and the timer cannot disagree; a guide's `definition` (question, term, text) renders a definition list under the short answer and a `DefinedTerm` in its JSON-LD; paragraphs, list items and table cells can hold Markdown-style links to a site path or, for a primary source, an `https://` URL. Every guide needs FAQs of its own in `seo_guides.py`; the generator refuses a page without them, so no two pages share boilerplate questions. [`src/test/seo/guide-content.test.ts`](../src/test/seo/guide-content.test.ts) fails when a guide has fewer than 700 words outside its related and About blocks, or when a sentence longer than 60 characters appears on more than three guides.

Every guide opens with the reader's main question as its first H2 and an answer of at most 100 words, kept in [`scripts/seo_answers.py`](../scripts/seo_answers.py); the generator refuses a page without one or with a longer answer. Each guide shows visible "Published" and "Updated" dates (`PUBLISHED_DATE` or a `published` key, and the `modified` date) that match its Article JSON-LD. Prices and plan facts are stated "as of" the month in `factsCheckedOn` in `src/config/site.json`; move that date when you recheck them, and the pricing page's About block, `llms.txt` and the landing page follow. Every other guide has a one-line About that links to the landing page and pricing instead of repeating the plan facts. Copy in `seo_guides.py` and `seo_answers.py` that names the month itself (prices and competitor facts) needs the same edit: search those files for "As of". The generator also writes `public/llms.txt`, the plain summary for AI agents. `public/robots.txt` allows AI crawlers by name in their own group, which repeats the private-route rules because a crawler that matches a named group ignores `*`.

To retire a guide, delete its `PAGES` entry, its `CLUSTERS` and `LINK_PHRASES` entries, and its `public/<slug>/` folder (the generator never deletes), add its redirects to `vercel.json`, and repoint any link to it. Two guides that answer the same search should become one page, not two thin ones.

The site origin, product name, brand line, organization name and the organization's `sameAs` profiles live in [`src/config/site.json`](../src/config/site.json). The app's head tags, the prerender and sitemap scripts, and the guide generator all read it, and guide copy names the product with a `{product}` token and the Pro price with `{pro_price}`. The number of prep modes comes from the tool lists in [`tool-links.tsx`](../src/components/features/tools/tool-links.tsx): the app's copy reads `PREP_MODE_COUNT` and `UTILITY_COUNT`, and guide copy uses `{mode_count}`, `{mode_names}` and `{utility_names}`. The trial length and Pro price come from `pricing` in the same file: i18next passes `{{trialDays}}`, `{{proMonthly}}`, `{{product}}`, `{{brand}}` and `{{host}}` to every catalog string, so the English, Spanish and Hungarian pages state the same facts. Do not hardcode those strings in new code or copy. App strings name the product with `{{product}}`, `{{brand}}` and `{{host}}`, which [`src/i18n.ts`](../src/i18n.ts) fills from `site.json` for every key.

After a production deploy, and only with Adam's approval, `npm run seo:indexnow` sends every URL in the sitemap to IndexNow in one request to `api.indexnow.org`, which shares it with Bing, Yandex, Seznam, Naver and the other engines that take part (not Google). It reads `dist/sitemap.xml` when a build is present and the live sitemap otherwise. `-- --only /tools /` sends just those pages, and `-- --dry-run` prints the request without sending it. The key file is `public/<key>.txt`. It is not wired into CI.

[`src/test/vercel-deployment-config.test.ts`](../src/test/vercel-deployment-config.test.ts) guards these rules. Update it together with `vercel.json`, and do not paste the full configuration into another guide.

A Vercel deploy ships only the frontend. Supabase migrations and Edge Functions are separate operations with their own authorization, so a frontend that depends on new schema must wait until that schema is applied to production.

## Staging contract

Protected staging requires:

- a project that is not production;
- a matching anon key;
- current migrations and required Edge Functions;
- required provider secrets;
- a dedicated bounded demo code;
- a protected GitHub environment with a main-only deployment rule;
- deployed CORS support for `http://127.0.0.1:18080` on the tested functions.

The staging browser suite disables trace, screenshot, and video capture. It creates uniquely named data and deletes only what it created.

Do not enable the staging repository variable before every prerequisite is present. A skipped staging job is not a pass.

`STAGING_E2E_ENABLED` has been `true` since 2026-09-18. The job runs after every successful `Quality` run from a push to `main`, and it first waits up to 20 minutes for a successful `staging-sync` status on that commit. Quality runs from pull requests also trigger it, and those show as skipped by design. Check the latest real result with `gh run list --workflow staging-e2e.yml` and `npm run ci:failures -- <run-id>`, not this page. The run uploads no artifact, so the job log is the only evidence. On failure the log names the failed step and the URL path, for example `Staging step "add a source to the debate" failed at path /app/library`.

No staging run passed after 2026-09-23. Until 2026-10-01 the job did not run, because the `Quality` run it waits for never started. Once Actions came back, it failed on every `main` push through 2026-10-02. The cause was the spec, not staging: since the Current Debate change (#72), Library disables **Add source** until a debate is current, and the spec never started one. The spec now starts a uniquely named debate and deletes it afterwards. The suite drives the real UI, so a change to a flow it covers can break it with no backend drift; run it locally before blaming staging.

## Staging sync

Staging is project `brifeyypjauyusmkptkx` ("DebateOwl Staging"). Production is `uziwdtkzofptihahfooo` ("DebateOwl"). Scripts go by ref; the display names can change. Staging syncs itself: a timer on the VPS applies migrations and deploys changed Edge Functions to staging within about 5 minutes of every commit on `main`. It sets the `staging-sync` commit status, and on failure it opens the **Staging is out of sync with main** issue. No per-run authorization is needed for staging. [staging.md](staging.md) covers the timer, its credential, the seed, and how to get in.

Before a production backend deploy, check that the commit's `staging-sync` status is green and that `Protected staging E2E` passed for it. Then follow [Supabase changes](#supabase-changes) with the list of migrations and functions that `npm run backend:status` reports for production.

## Switching the frontend to staging

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) reads the `debate-supabase-env` localStorage key once at startup. The value `staging` selects staging, and anything else selects production. Each project keeps its own auth session under `debate-auth-<env>`.

Admins see a **Developer** card in Settings that signs out, sets the key, and reloads. The app's persisted stores are shared by both projects, so the switch also clears this project's stored session, its Google token, and all user-specific local data, including saved results and form drafts. It waits at most 4 seconds for the sign-out request, so an unresponsive project cannot block it. Other open tabs clear their own session storage, including their Google token, and reload as soon as the key changes, so no tab keeps talking to the old project while sharing stores with the new one. The strip publishes its height as `--staging-banner-height`, and the landing navigation and app header sit below it. While staging is active, every page shows a staging strip with **Switch to production**, and the Settings card is shown to everyone. A new staging session starts signed out, and an admin on production may not be an admin on staging, so the way back cannot depend on that role. The switch is a convenience, not an access control. Staging RLS and its separate user accounts are the boundary.

A build can pin one project with the `VITE_SUPABASE_ENV` build variable (`production` or `staging`; any other non-empty value fails the build). A pinned build ignores the localStorage key, hides the Settings card and the strip's **Switch to production** button, and does not reload when another tab switches. The strip still shows on a pinned staging build. The staging Vercel project uses this so a requested preview is pinned to staging; see [Opt-in previews](#opt-in-previews).

The switch only works while the `connect-src` directive in [`vercel.json`](../vercel.json) allows the staging project origin. It lists exactly the two project origins from [`src/lib/supabase/projects.ts`](../src/lib/supabase/projects.ts), and `src/test/vercel-deployment-config.test.ts` fails if they drift apart. The same file is deployed to production and to `debatelab-staging`, and an unpinned production preview can still select staging, so the staging origin stays in the production site's CSP.

## Opt-in previews

A push to a branch other than `main` does not deploy. Both Vercel projects read this `vercel.json`, so neither builds a preview on its own. There is no long-lived staging git branch: `debatelab-staging`'s production deployment tracks `main` and stays at `https://debatelab-staging.vercel.app`.

Request a preview only when a real UI change needs a hosted URL. `npm run dev:preview` and the `verify-debatelab` skill do not spend a Vercel deployment.

From the repo root, with the CLI logged in (`vercel login`, or `VERCEL_TOKEN` in the environment; never commit a token):

```bash
npx vercel link --yes --non-interactive --scope adam-gaborjanis-projects --project debatelab-staging
npx vercel deploy --yes --non-interactive --scope adam-gaborjanis-projects
```

Leave off `--prod`. Do not run `vercel --yes` before the link: the first deployment of a new project is production. The command above is one preview on `debatelab-staging`, pinned to staging by that project's `VITE_SUPABASE_ENV`. Linking `debate-navigator` instead builds a preview with no `VITE_SUPABASE_ENV`, so it uses production data unless the saved toggle says staging. One preview is enough, and the staging project is the one to use unless the change needs production data.

Adam can do the same from the Vercel dashboard: Create Deployment, pick the branch, leave the target as Preview. That needs no project setting change.

A commit message cannot turn a deployment back on. `git.deploymentEnabled` is decided before a build exists, which is what keeps the skipped push off the daily cap. An Ignored Build Step (`ignoreCommand`) runs only after a deployment is created, and that skip still counts, so this repo does not use one.

The preview hosts are unchanged:

- `debate-navigator` (the production Vercel project) builds previews with no `VITE_SUPABASE_ENV`, so they use production unless the saved toggle says staging. Production's Auth redirect allowlist must include `https://debate-navigator-*-adam-gaborjanis-projects.vercel.app/**` for Google sign-in to return to the preview.
- `debatelab-staging` builds the same repository with `VITE_SUPABASE_ENV=staging`. Staging's Auth redirect allowlist must include `https://debatelab-staging-*-adam-gaborjanis-projects.vercel.app/**`. Its production deployment tracks `main`.

Edge Function CORS and the demo-code sign-in redirect accept these hosts through `isAllowedOrigin()` in [`supabase/functions/_shared/cors.ts`](../supabase/functions/_shared/cors.ts). Previews can call functions only after both projects run a function build that includes it.

The staging project's name must not start with `debate-navigator-`, or production's allowlist pattern would also match it. A production preview runs unmerged frontend code with real production sessions and data, so use the staging preview unless the change needs production data. A staging preview runs against whatever backend staging has; if the PR changes migrations or Edge Functions, sync staging first (see [Staging sync](#staging-sync)).

A branch that does not contain this `vercel.json` still deploys on push. After the change is on `main`, branches cut from `main` inherit it.

## Backend drift check

`npm run backend:status` shows what the current commit has that a Supabase project lacks. It inspects the project the Supabase CLI resolves, which is `SUPABASE_PROJECT_ID` when that is set and the linked project otherwise; `npm run backend:status -- --project-ref <ref>` inspects another one. It runs `supabase migration list`, `supabase functions list` and `supabase secrets list`, reads the Auth site URL and redirect allowlist from the Management API with the CLI's access token (`SUPABASE_ACCESS_TOKEN`, or the `access-token` file in `SUPABASE_HOME`, default `~/.supabase`), and changes no schema, data, functions, or secrets. It prints secret names only, never values or digests. To connect to the database, the CLI creates its usual short-lived login role.

The comparison uses the committed tree at `HEAD`, so commit or stash local edits first. It reports:

- migrations on this commit that the project has not applied, and applied migrations the commit does not have;
- functions that are not deployed, or that were deployed before the last commit that touched them or a file they import;
- functions whose deployed `verify_jwt` differs from [`supabase/config.toml`](../supabase/config.toml);
- deployed functions that the commit does not have.

Function change dates come from first-parent git history, which dates a merged change by its merge. A function deployed from a branch before its merge therefore shows as changed until it is redeployed from `main`. The reverse is not caught: a function deployed from an out-of-date checkout gets a fresh deploy date and looks current. Deploy functions only from an up-to-date `main`. A shallow clone skips the function date check.

`--check` exits 1 when a migration on this commit is not applied, and exit code 2 means the check itself failed. A scheduled CI step could use it against production, but it would need a Supabase access token and database access in GitHub Actions. That is a production credential, which the hard boundaries in [`AGENTS.md`](../AGENTS.md) do not allow in jobs, so it waits for Adam's decision.

`workspace-invites` is not deployed to production, because Collaborative Workspace is hidden there. Expect it in the not-deployed list.

## Supabase changes

Before applying a migration or deploying a function:

1. run `npm run backend:status` on the commit you are deploying and confirm that the pending list matches what you are about to apply;
2. resolve the linked project and confirm whether it is local, staging, or production;
3. inspect the exact migration or function diff;
4. capture the current remote baseline needed for rollback;
5. run the relevant local tests;
6. confirm CORS and authentication behavior;
7. apply one scoped operation;
8. verify the live result before continuing, then rerun `npm run backend:status` to confirm nothing you meant to ship is still pending.

Stop when the project target is ambiguous, rollback is unproven, or the operation exceeds authorization.

Destructive statements such as `DROP` or `TRUNCATE`, secret rotation, project deletion, and broad unrelated function deployment always need separate explicit approval.

### Keepalive monitor

`keepalive_events` and `keepalive_heartbeat` belong to the external Supabase keepalive monitor (`Programcode/supabase-keepalive-monitor`), not the app. Since `20261024120000_keepalive_server_only.sql` only the service role can read or write them. The monitor's primary run, a systemd user timer on Adam's VPS, uses the service-role key. Any other copy of the monitor (the Pi's GitHub Actions backup) must also use the service-role key for the DebateLab projects; with the publishable key its REST and RPC steps get 401 or 403.

## Edge Function deployment boundaries

[`supabase/config.toml`](../supabase/config.toml) disables gateway JWT verification for functions that authenticate or validate requests in their own handlers. Deployment must preserve those handler checks.

Auth patterns include:

- bearer validation through shared helpers for user and admin APIs;
- Stripe signature validation for webhooks;
- bounded pre-session validation for demo-code login;
- short-lived Google token validation for Docs export.

A successful deploy command proves upload only. Verify the behavior through the real endpoint or protected staging flow.

Voice rounds span three independent steps, and the frontend works at every stage of them. The frontend alone (a merge) offers voice rounds that speak with the browser's voice. Deploying `ai` adds audio tags and signed segments to voice replies; deploying `voice` adds the endpoint, which answers `voice_unavailable` until `ELEVENLABS_API_KEY` is set. Deploy `ai` and `voice` together, since they share the token code. Once the key is set, check one Sparring and one Crossfire reply in a real browser, and confirm `voice_sparring` and `voice_crossfire` rows with a cost in `ai_requests`. Removing the key returns every round to the browser voice without a deploy.

## CORS

Current functions mostly use local explicit origin allowlists. The exact list can differ by endpoint. Treat handler code as the source of truth.

Before enabling protected browser staging, verify `http://127.0.0.1:18080` for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements`. Do not broaden origins to `*` merely to make a test pass.

Local development origins must remain bounded to intended ports and hosts.

## Sign-in email and DNS

Production and staging Supabase Auth send sign-in codes from `DebateOwl <auth@debateowl.com>` through Resend's SMTP relay (`smtp.resend.com`); the relay password lives only in each project's Auth settings. DNS for `pi-stack.org` is the Cloudflare zone. The records below are the ones set up for the previous sender, `auth@debate.pi-stack.org`; `debateowl.com` has the equivalent Resend records in its own Cloudflare zone. The previous sender's records are:

- `send.debate.pi-stack.org`: Resend's SPF (`include:amazonses.com`) and bounce MX, so the bounce domain aligns with the From address.
- `resend._domainkey.debate.pi-stack.org`: Resend's DKIM key; messages are signed with `d=debate.pi-stack.org`.
- `_dmarc.debate.pi-stack.org`: `p=quarantine` with relaxed alignment. Reports go to the same Gmail address as `_dmarc.pi-stack.org`; receivers that check external report authorization drop them.

The SPF and MX records on `debate.pi-stack.org` itself belong to Cloudflare Email Routing for inbound mail. A name can hold only one SPF record, so do not add Resend's there. Before tightening DMARC to `p=reject`, or after changing the sender, send a staging sign-in code to a mail-tester address and confirm `dmarc=pass`, then delete that staging user. Any other service that sends as `@debate.pi-stack.org` must be added to SPF or DKIM first, or its mail lands in spam.

## Secrets

Secret names may be documented; values may not. Server-side categories include:

- Supabase service credentials;
- AI provider credentials;
- the ElevenLabs credential for the opponent's voice (`ELEVENLABS_API_KEY`);
- research provider credentials;
- Stripe API and webhook credentials;
- demo-code hashing material;
- sparring integrity material;
- Google export configuration.

Never place server secrets in `VITE_*`, screenshots, traces, logs, comments, commits, or documentation.

GitHub Actions secrets: `LIVE_OPENROUTER_API_KEY` and `LIVE_EXA_API_KEY` for live provider tests, and `PROD_CANARY_EMAIL` and `PROD_CANARY_PASSWORD` for the production canary account. The public anon key is the `PROD_SUPABASE_ANON_KEY` repository variable. To rotate the canary password, set it with the Supabase Auth admin API and pipe it into `gh secret set` over stdin.

Vercel build variables for Sentry source maps: `SENTRY_AUTH_TOKEN` (an organization token with release and source map upload scope), `SENTRY_ORG` and `SENTRY_PROJECT` (slugs). When all three are set, [`vite.config.ts`](../vite.config.ts) builds hidden source maps, uploads them for the release, and deletes them from `dist/`. When any is missing, the build emits no source maps. A failed upload logs an error but does not fail the build. The release is `VERCEL_GIT_COMMIT_SHA` (then `GITHUB_SHA`, then `git rev-parse HEAD`), and the Sentry environment is `VERCEL_ENV`, so preview deployments report as `preview`. Both need Vercel's system environment variables enabled.

## Rollback

Choose rollback before changing production:

- Frontend: promote the previous known-good Vercel production deployment (about 10 seconds), or revert the commit on `main` and let Vercel redeploy (one to two minutes). The Vercel project is `debate-navigator`. `vercel inspect debateowl.com` shows the live deployment, `vercel ls debate-navigator --environment production --status READY` lists the earlier ones, and `vercel rollback <previous-deployment-url> --yes` switches back. On Adam's VPS, `~/ops/rollback/rollback vercel debate-navigator` does all three. After a rollback, Vercel stops putting new `main` deployments live until one is promoted with `vercel promote <deployment-url>`, so promote the fixed deployment once it is ready. A frontend rollback does not touch Supabase: if the bad change came with a migration or function deploy, the old frontend must still work with the new backend.
- Edge Function: retain the deployed source or artifact baseline and its environment assumptions.
- Migration: prefer forward corrective migrations. Do not assume an irreversible schema or data change can be rolled back.
- Configuration: record the prior value without exposing secrets.

After rollback, verify the user-visible flow and relevant backend state. A process restart alone is not proof.

## Live verification

Match verification to the change:

- frontend: load the deployed route and complete the affected browser flow;
- auth: use the intended environment and prove session refresh or callback behavior;
- database: query only the expected rows and prove RLS with user-scoped access;
- Edge Function: call the deployed endpoint with the intended auth class;
- billing: use the authorized test or staging mode and inspect webhook state;
- CORS: issue the browser-origin request that previously failed.

Do not expose protected data in artifacts. Record the commit, environment, operation, and result.

## Incident clues

- Every Actions job fails in 2 to 5 seconds with no logs: Actions minutes or billing, not the code. Verify locally.
- Green local E2E plus staging failure: schema, functions, provider access, demo code, or CORS may differ. Run the staging suite locally first; if it fails there too on a UI step, the spec is stale, not staging.
- New frontend errors against Supabase right after a merge: the matching migration or function may not be applied to production yet. Run `npm run backend:status` from the linked checkout.
- Function returns unauthorized after deploy: check handler auth and environment propagation before changing gateway settings.
- Browser works on one route only, or an app route shows the 404 page: check the `vercel.json` app-route rewrites and cache headers.

Read [testing.md](testing.md) for evidence rules and [`../supabase/README.md`](../supabase/README.md) for backend ownership.
