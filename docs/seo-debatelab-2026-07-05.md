# DebateLab SEO work log - 2026-07-05

> **Historical snapshot:** This file records SEO work and search evidence from 2026-07-05. It is not current ranking, indexing, or deployment proof.

## Objective
Make `https://debate.pi-stack.org` the strongest relevant result for the Google query `debatelab` without indexing private app surfaces or changing the authenticated app experience.

## Baseline observed
- Web search for `debatelab` showed KIT DebateLab properties in positions 1-6 and `https://debatelab.ai/` around position 7. `https://debate.pi-stack.org` did not appear for the plain query.
- Web search for `"debate.pi-stack.org" "DebateLab"` showed `https://debate.pi-stack.org/` at position 1, but with stale title/snippet: `DebateLab` / `DebateLab Application`.
- Search Console URL inspection before the new batch:
  - Homepage: `PASS`, `Submitted and indexed`, last crawled `2026-07-01T08:19:52Z`, indexing allowed.
  - First four SEO pages: `Discovered - currently not indexed`.
  - Newly added pages: initially `URL is unknown to Google` until sitemap processing.
- Search Console Search Analytics for queries containing `debatelab`, previous 90 days ending 2026-07-03: no rows returned.

## On-site changes shipped
- Expanded public static SEO pages from 4 to 13 pages:
  - `/ai-debate-practice`
  - `/debate-case-generator`
  - `/debate-rebuttal-practice`
  - `/ai-debate-coach`
  - `/debate-evidence-finder`
  - `/argument-flowchart`
  - `/online-debate-timer`
  - `/how-to-write-a-debate-case`
  - `/how-to-practice-rebuttals`
  - `/debate-weighing-guide`
  - `/ai-tools-for-debate-students`
  - `/wsdc-debate-practice`
  - `/about-debatelab`
- Each public SEO page has a unique title, meta description, H1, canonical, crawlable HTML body, CTA into `/app`, internal links to related DebateLab guides, FAQ content, Article schema, FAQPage schema, and BreadcrumbList schema.
- Homepage now includes stronger brand/entity signals in static initial HTML:
  - `DebateLab AI Debate Practice` H1 fallback content inside `#root` for non-JS/initial HTML crawlers.
  - Public guide links in initial HTML.
  - Organization schema with `alternateName` and `sameAs` for the real GitHub repo.
  - WebSite schema with `alternateName` and SearchAction.
- Sitemap expanded to 16 URLs with `lastmod` values: homepage, 13 SEO pages, terms, privacy.
- Robots source updated to disallow `/app`, `/login`, `/share/`, `/admin`, `/settings`, `/history`, `/private`, and include the sitemap.
- Nginx changed to serve extensionless public SEO directory pages at `/slug` without a trailing-slash redirect.
- Nginx/Docker changed so static assets are readable by the nginx worker after image build.
- Private surfaces verified live with `X-Robots-Tag: noindex, nofollow` for `/app`, `/login`, and `/share/test`.
- GitHub repo metadata updated for authority/entity signal:
  - Homepage: `https://debate.pi-stack.org`
  - Description: `DebateLab - AI-powered debate practice platform for cases, rebuttals, evidence, flowcharts, coaching, and timed speeches.`
  - Topics: `ai-debate`, `argumentation`, `debate`, `education`, `debate-practice`
- README top links now point to the live app and key public guides.

## Verification proof
- `npm run lint` passed with exit code 0.
- `npm run build` passed. Vite built 4,271 modules and emitted `dist/index.html` plus public SEO pages.
- Docker production rebuild and restart completed. Running container:
  - `debatelab Up ... 127.0.0.1:8080->80/tcp`
- Live URL checks returned HTTP 200 with expected SEO primitives:
  - `https://debate.pi-stack.org/` title `DebateLab - AI-Powered Debate Practice Platform`, canonical present, H1 present, schema present.
  - `https://debate.pi-stack.org/ai-debate-practice` title `AI Debate Practice Platform | DebateLab`, canonical present, H1 present, schema present.
  - `https://debate.pi-stack.org/debate-evidence-finder` title `Debate Evidence Finder for Source-Backed Cases | DebateLab`, canonical present, H1 present, schema present.
- Live sitemap check:
  - `https://debate.pi-stack.org/sitemap.xml` returned HTTP 200 and contains 16 URLs.
- Local origin robots check after Docker chmod fix:
  - `http://127.0.0.1:8080/robots.txt` returned HTTP 200 and the intended disallow rules.
- Important Cloudflare note:
  - Public `https://debate.pi-stack.org/robots.txt` is currently being replaced by Cloudflare Managed Content Signals robots output. It allows `User-agent: *` but does not show the custom sitemap/private-route disallows. This is not blocking indexing because private routes also carry `X-Robots-Tag: noindex, nofollow`, and sitemap was submitted directly in Search Console. If desired, disable/adjust Cloudflare managed robots later so the custom robots file is visible publicly.

## Search Console actions and states
- Sitemap submitted after deployment: `SITEMAP_SUBMIT_OK`.
- GSC sitemap list after submit:
  - `lastSubmitted`: `2026-07-05T18:53:03.958Z`
  - `isPending`: `true`
  - previous `lastDownloaded`: `2026-07-05T18:30:28.073Z`
  - `warnings`: `0`
  - `errors`: `0`
  - contents still showed old `submitted: 7`, `indexed: 0` because Google had not re-downloaded the expanded sitemap yet.
- URL inspection after submission:
  - Homepage: `PASS`, `Submitted and indexed`, robots `ALLOWED`, indexing `INDEXING_ALLOWED`, page fetch `SUCCESSFUL`.
  - Existing SEO pages: `Discovered - currently not indexed`.
  - New SEO pages: `URL is unknown to Google` immediately after launch; this should change after sitemap recrawl.

## Current ranking monitor snapshot
- `debatelab`: KIT DebateLab properties dominate; `debatelab.ai` appears around position 6-7 depending on search backend; `debate.pi-stack.org` not yet visible for plain brand query in the sampled results.
- `"debate.pi-stack.org" "DebateLab"`: `https://debate.pi-stack.org/` appeared at position 1, confirming Google/search backend association exists but snippet was stale.
- `"DebateLab AI" "debate practice"`: `debatelab.ai` is position 1; `debate.pi-stack.org` not yet present in top 10.

## Next actions
1. Wait for Google to re-download the expanded sitemap and crawl the new static pages, then re-run URL inspection.
2. If Cloudflare access is available, disable or adjust Cloudflare managed robots so public `/robots.txt` shows the custom `Sitemap:` and private route disallows.
3. Add legitimate external entity links where accounts already exist: product profile, personal/project portfolio, school/debate-team mentions, or public launch post. Avoid spam directories.
4. Consider adding a public changelog/blog page with 3-5 deeper articles once initial pages are indexed.
5. Track weekly: plain `debatelab`, `DebateLab AI debate practice`, and `site:debate.pi-stack.org debatelab` plus Search Console coverage for the 13 public SEO pages.
