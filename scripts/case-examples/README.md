# Debate case examples: raw output

These files are the unedited output behind [/debate-case-example](https://debateowl.com/debate-case-example). [`scripts/seo_case_example.py`](../seo_case_example.py) renders the page from them; [`scripts/generate_seo_content.py`](../generate_seo_content.py) writes it to `public/debate-case-example/index.html`. Change the page copy there, never the case text here. The only changes the page makes to the case text are the entries in [`corrections.json`](corrections.json), which it lists under "Corrections after generation": replaced source links, and inline `[correction: ...]` markers that keep the generated wording and flag a wrong fact.

| File | Motion | Format setting | Side | Language |
| --- | --- | --- | --- | --- |
| `bp-en.json` | This House would lower the voting age to 16 | British Parliamentary | pro | English |
| `policy-en.json` | Resolved: The United States federal government should substantially increase its investment in high-speed rail | Policy | con | English |
| `classroom-hu.json` | Ez a Ház betiltaná a házi feladatot az általános iskolákban | Classroom | pro | Hungarian |

Each file holds, for the first speech (`r1`) and the second (`r2`):

- `request`: the body the browser sent to the `ai` Edge Function;
- `response`: the function's final result, unchanged (`output` is the case);
- `providerCalls`: every model call the request made, with the model the client asked for and the model OpenRouter says served it. Prompts are left out because they contain the full text of the research pages; `userPromptHead` keeps the request lines the function wrote (motion, side, format, role, length).

`aiRequests` and `caseRows` are the database rows the run wrote.

## How they were generated

On 3 November 2026, from commit `a9f69b38`, with the [`verify-debatelab`](../../.claude/skills/verify-debatelab/SKILL.md) stack in live mode and every chat call pinned to `anthropic/claude-sonnet-5.5` (the Pro default):

```bash
H=.claude/skills/verify-debatelab/bin/verify.sh
VERIFY_LIVE_MODEL=anthropic/claude-sonnet-5.5 $H up --live --max-calls 120
CASE_EXAMPLES=all $H drive recipes/case-examples --project desktop-chromium
python3 scripts/case-examples/export.py .verify/artifacts/<run>/desktop-chromium/case-example-<id> <id> "<format>" scripts/case-examples
$H down
```

[`recipes/case-examples.spec.ts`](../../.claude/skills/verify-debatelab/recipes/case-examples.spec.ts) signs in a demo user, starts a debate with the motion and format, then generates R1 and R2 in that debate. The run made 44 upstream calls. Two differences from production: the research-query step, which runs on Claude Haiku 5.5 in production, was also pinned to Sonnet 5.5, and the Jev source-ranking calls went to Jev's own model as they do in production.

The first Hungarian run failed on its R2 (`Generate response is missing metadata and cannot satisfy the requested output shape.`), so the Hungarian sample was rerun from the start. No other sample was rerun.

## Source links, checked 3 November 2026

Of the 31 links in the raw output, 22 answered 200 to a script. The other 9 answered 403 behind a Cloudflare or Akamai bot check to every automated client tried (Python, headless Chromium, Camofox): `lordslibrary.parliament.uk`, `committees.parliament.uk` (2), `publications.parliament.uk`, `tandfonline.com`, `transportation.gov` (2), `commerce.senate.gov` and `apta.com`. The Edge Function removes any link the request's own research did not return, so each of these was an Exa result at generation time.

Opened in a real browser, 7 of those 9 load. Two do not, and [`corrections.json`](corrections.json) replaces them on the page:

- `tandfonline.com/doi/full/10.1080/17457289.2025.2560983` (Levin, "Are 16-year-olds mature enough to vote? Evidence from the Voto Joven in Latin America", Journal of Elections, Public Opinion and Parties, 6 October 2025) stays behind a Cloudflare check. It is replaced by the author's preprint of the same paper on APSA Preprints, whose page lists the journal version. The counter's source line, which named the wrong journal, now names APSA Preprints.
- `commerce.senate.gov/.../2026.02.05 CHSRA Follow-Up Report (Part 2 of Acela Report).pdf` answers Access Denied. It is replaced by the Internet Archive's copy of the same PDF (snapshot of 11 August 2026). The committee's press release is on the same blocked host.

## Fact corrections

- Sample 1, first speech, first "If they say…" answer: the model wrote that 16-year-olds have voted "since 1984 in Nicaragua and Brazil". Brazil's year is 1988 (the cited Levin paper and Brazil's 1988 constitution), so the page keeps the sentence and adds `[correction: Brazil since 1988]` right after it.

Each change in `corrections.json` names the raw value it replaces, or for a marker the exact words it follows, which must appear once; `scripts/seo_case_example.py` fails if a raw file no longer has that value, so a regenerated sample cannot keep a stale correction.
