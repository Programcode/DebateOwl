# DebateLab SEO escalation - 2026-07-05

## Why this escalation happened

Adam correctly pointed out that the first SEO pass did **not** achieve the stated ranking objective: for the broad query `debatelab`, `https://debate.pi-stack.org` still was not appearing in the sampled top results.

Search proof immediately before escalation:

- `debatelab`: positions 1-6 dominated by KIT DebateLab pages and profiles; `debatelab.ai` at position 7; `debate.pi-stack.org` absent from sampled top 10.
- `site:debate.pi-stack.org debatelab`: `https://debate.pi-stack.org/` appeared, but with stale snippet/title `DebateLab` / `DebateLab Application.`
- Search Console: homepage is indexed, but Google last crawled it on `2026-07-01T08:19:52Z`, before the SEO changes. Most new pages were `URL is unknown to Google` or `Discovered - currently not indexed`.

## Escalation changes shipped

### 1. Exact brand/entity pages

Added three additional static, crawlable public pages designed to disambiguate the brand collision and target exact search variants:

- `/debatelab` — title `DebateLab by Programcode | AI Debate Prep Platform`; H1 `DebateLab by Programcode`
- `/debatelab-ai` — title `DebateLab AI | Debate Practice, Cases & Rebuttals`; H1 `DebateLab AI Debate Practice`
- `/debate-lab` — title `Debate Lab by Programcode | AI Debate Practice Tool`; H1 `Debate Lab by Programcode`

The public SEO page count is now 16, and the sitemap has 19 URL entries.

### 2. Homepage brand disambiguation

Updated homepage metadata and crawlable fallback content away from the competitor-like title `DebateLab - AI-Powered Debate Practice Platform` toward the clearer entity label:

- Title: `DebateLab by Programcode | AI Debate Prep, Cases & Rebuttals`
- H1: `DebateLab by Programcode`
- Description now starts with `DebateLab by Programcode...`
- Homepage fallback links now include `/debatelab`, `/debatelab-ai`, and `/debate-lab`.

### 3. Public entity backlink/profile

Created a safe public GitHub entity profile repo, separate from the private application source code:

- `https://github.com/Programcode/debatelab-ai-profile`
- Visibility: public
- Homepage: `https://debate.pi-stack.org`
- Description: `Public entity profile for DebateLab by Programcode, an AI debate practice platform.`
- Topics: `debatelab`, `ai-debate`, `debate-practice`, `argumentation`, `education`

The private application repo was **not** made public.

### 4. Schema and README authority links

- Organization/Article schema `sameAs` now includes:
  - `https://github.com/Programcode`
  - `https://github.com/Programcode/debatelab-ai-profile`
- README now links to the new brand/entity pages and public GitHub entity profile.

### 5. IndexNow crawl notification

Added `scripts/indexnow_submit.py` and hosted the required key file at the site root.

IndexNow submission proof:

```json
{
  "urls": 19,
  "keyLocation": "https://debate.pi-stack.org/4edb6e55e44b9a2ccae55ceb1a4d6e6e.txt"
}
```

- Bing IndexNow returned HTTP `202`.
- Yandex IndexNow returned HTTP `202` with body `{ "success": true }`.

This does not directly force Google indexing, but it creates additional crawl pressure and search-engine discovery signals.

## Verification proof after escalation

Build/deploy checks:

- `npm run build`: passed; Vite transformed 4,271 modules.
- `npm run lint`: passed.
- `npm test`: passed — 49 test files, 571 tests.
- Docker image rebuilt and container restarted:
  - `debatelab Up ... 127.0.0.1:8080->80/tcp`

Live URL checks over HTTPS:

- `/`: HTTP 200; title `DebateLab by Programcode | AI Debate Prep, Cases & Rebuttals`; H1 `DebateLab by Programcode`; canonical `https://debate.pi-stack.org/`
- `/debatelab`: HTTP 200; title `DebateLab by Programcode | AI Debate Prep Platform`; H1 `DebateLab by Programcode`; canonical `https://debate.pi-stack.org/debatelab`
- `/debatelab-ai`: HTTP 200; title `DebateLab AI | Debate Practice, Cases & Rebuttals`; H1 `DebateLab AI Debate Practice`; canonical `https://debate.pi-stack.org/debatelab-ai`
- `/debate-lab`: HTTP 200; title `Debate Lab by Programcode | AI Debate Practice Tool`; H1 `Debate Lab by Programcode`; canonical `https://debate.pi-stack.org/debate-lab`
- `/sitemap.xml`: HTTP 200; contains 19 URLs.
- `/4edb6e55e44b9a2ccae55ceb1a4d6e6e.txt`: HTTP 200; key file reachable.
- `/app/settings`: HTTP 200 with `x-robots-tag: noindex, nofollow`.
- `/share/abc`: HTTP 200 with `x-robots-tag: noindex, nofollow`.

Search Console after escalation:

- Sitemap submitted again: `SITEMAP_SUBMIT_OK` at `2026-07-05T19:35:23.191Z`.
- Homepage remains `PASS`, `Submitted and indexed`, `INDEXING_ALLOWED`, but last crawl is still `2026-07-01T08:19:52Z`, so Google has not yet seen the new homepage title/H1.
- Newly added brand/entity pages are currently `URL is unknown to Google` immediately after submission.
- Search Console sitemap contents still showed the older submitted count because Google had not re-downloaded the updated sitemap yet.

## Remaining blockers and next actions

1. Google cannot be forced to rank immediately. Official Google docs confirm manual Request Indexing can take days to weeks and sitemap submission does not guarantee immediate indexing.
2. Use Search Console UI manually, if possible, to inspect and click **Request Indexing** for:
   - `https://debate.pi-stack.org/`
   - `https://debate.pi-stack.org/debatelab`
   - `https://debate.pi-stack.org/debatelab-ai`
   - `https://debate.pi-stack.org/ai-debate-practice`
   API access can inspect and submit sitemaps, but it cannot press the UI-only Request Indexing button for normal pages.
3. Cloudflare managed `/robots.txt` is still replacing the origin robots file publicly. It allows search crawling, so it is not blocking indexing, but dashboard/API access is needed to expose the custom sitemap/private-disallow robots file publicly.
4. Next strongest lever is external authority: submit the factual DebateLab by Programcode profile to the safe education/AI directories listed in `docs/seo-authority-opportunities-2026-07-05.md`, or add a link from any Adam-controlled portfolio/debate/team page.
5. Monitor daily using the existing cron job and act when GSC changes from `URL is unknown` to crawled/indexed states.
