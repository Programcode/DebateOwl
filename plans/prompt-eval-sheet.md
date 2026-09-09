# Prompt evaluation v1

Evaluation started 2026-09-07 UTC, resumed 2026-09-09 UTC. This is subjective agent assessment of synthetic model responses, not an automated quality gate or a human panel review.

## Reproduction

Before revision: `235bb49`. After revision: the commit introducing this sheet and the shared Ask rules. Use the same request configuration for both revisions. Only the system prompt changes.

- Endpoint: `https://openrouter.ai/api/v1/chat/completions`.
- Model: `openai/gpt-4o-mini`, temperature `0`, seed `42`, `max_tokens: 1600`.
- No tools, research, local sources, custom instructions, admin instructions, history, or response-format override. Provider routing is automatic; a seed is not a determinism guarantee.
- General Ask, citations/search/pros-cons/argument-map all disabled.
- Structured system: `buildSystemPrompt({ feature: "ask", dateContext: "Current date: 2026-09-07." })`.
- Structured user: `buildAskBasePrompt` with the synthetic message and all toggles plus `researchAvailable` false.
- Before Markdown system: the five lines in baseline `ai-stream/index.ts`'s `buildMessages`, with `getAskModeGuidance("general")`.
- After Markdown system: `buildStreamingAskSystemPrompt(getAskModeGuidance("general"))`.
- Markdown user: the synthetic message directly. The model was sampled with the streaming system prompt through a complete-response API call. SSE transport is tested separately by the automated streaming suite.
- Validate unmodified structured output with `JSON.parse` and `AskOutputSchema.safeParse`. Do not repair omitted keys before recording validity.

Each of the three motions is crossed with all three complexity instructions, in both Markdown and JSON, before and after. That is 36 responses. Message construction is exactly:

```text
Motion: {motion}
{complexity instruction}
Respond entirely in {language label}. Do not invent facts, statistics, or citations. No research is attached. Keep the answer under 220 words.
```

Motions and output language:

1. `phones`, English: `Schools should ban smartphones during lessons.`
2. `transit`, Spanish: `El transporte público urbano debería ser gratuito.`
3. `ai`, Hungarian: `Az iskoláknak engedélyezniük kell a generatív mesterséges intelligencia használatát a házi feladatokban.`

Complexity instructions:

- Beginner: `Explain one argument and one counterargument for a beginner in plain language.`
- Intermediate: `Compare two competing mechanisms and explain which warrant a judge should test.`
- Advanced: `Analyze burden of proof, a strong countermodel, and impact weighing under uncertainty.`


System-prompt SHA-256 hashes used in this evaluation:

- before json: `aaa82b8400622789bd0d2ee05eeb69b24c47c9e30faadcadbbc281538a268b49`
- before stream: `dca86dd2269438966851e44c7f6c20a7b8007be69a7168c8dfc6b5b620037542`
- after json: `317fe0678d076d9e2e14500b77701ec4cfa40ef2f51f6d35fcc866d5629ab4d3`
- after stream: `e4577933078e172164041a24df0857c69e8d899e522136bcec6c788a75153bf2`

## Assessment rules

Quality and control obedience use 1 to 5: 1 is unusable, 3 is useful with material weaknesses, 5 is precise and complete. Evidence honesty distinguishes invented sources from unsupported generalizations. Language consistency means all prose fields stay in the requested language; schema keys remain English. Hallucination risk is a subjective low/medium/high judgment, not a factual audit. JSON syntax and schema validity are separate observations; Markdown has no JSON requirement.

## Before observations

All 18 responses completed without truncation. All nine JSON outputs parsed, but only eight passed the actual Ask schema. The advanced phones response omitted both `followUpQuestions` and `uncertainties`. All 18 used the requested output language. No response invented a named citation, URL, study, or statistic. Several supplied unsupported causal generalizations.

| Run | Quality | Controls | Evidence honesty | Language | Risk | JSON syntax/schema | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phones beginner Markdown | 3 | 4 | Generalizations | English | Medium | N/A | Clear distraction/tool clash; assumes improved learning. |
| phones beginner JSON | 4 | 4 | Generalizations | English | Medium | Pass/pass | Useful counterproposal; uncertain educational context surfaced. |
| phones intermediate Markdown | 3 | 4 | Generalizations | English | Medium | N/A | Names mechanisms but gives a weak reason to prioritize distraction. |
| phones intermediate JSON | 3 | 4 | Overstatement | English | Medium | Pass/pass | Claims a ban eliminates distractions entirely. |
| phones advanced Markdown | 3 | 4 | Generalizations | English | Medium | N/A | Countermodel is clear; impact comparison stays generic. |
| phones advanced JSON | 3 | 2 | Generalizations | English | Medium | Pass/fail | Required follow-up and uncertainty arrays missing. |
| transit beginner Markdown | 4 | 4 | Conditional claims | Spanish | Low | N/A | Explains access, funding and crowding without invented data. |
| transit beginner JSON | 3 | 4 | Speculation | Spanish | Medium | Pass/pass | Adds an unsupported free-service quality-perception claim. |
| transit intermediate Markdown | 2 | 3 | Generalizations | Spanish | Medium | N/A | Taxes and subsidies are not clearly competing funding mechanisms. |
| transit intermediate JSON | 2 | 3 | Generalizations | Spanish | Medium | Pass/pass | Same mechanism overlap; acknowledges missing local data. |
| transit advanced Markdown | 4 | 4 | Conditional claims | Spanish | Low | N/A | Targeted fares countermodel and service-quality tradeoff. |
| transit advanced JSON | 4 | 4 | Conditional claims | Spanish | Low | Pass/pass | Financing uncertainty is explicit; useful countermodel. |
| ai beginner Markdown | 3 | 4 | Generalizations | Hungarian | Medium | N/A | Accessible help/dependency clash with a generic closing. |
| ai beginner JSON | 4 | 4 | Conditional claims | Hungarian | Low | Pass/pass | Explains learning support versus independent practice. |
| ai intermediate Markdown | 3 | 3 | Generalizations | Hungarian | Medium | N/A | Compares permission/restriction more than causal mechanisms. |
| ai intermediate JSON | 3 | 4 | Generalizations | Hungarian | Medium | Pass/pass | Judge test is concrete; conflates generated work and plagiarism. |
| ai advanced Markdown | 2 | 3 | Speculation | Hungarian | Medium | N/A | Introduces mental health without developing the causal link. |
| ai advanced JSON | 3 | 4 | Generalizations | Hungarian | Medium | Pass/pass | Countermodel and uncertainty exist, but weighing is generic. |

## After observations

All 18 after responses completed without truncation. One transport disconnect was retried with the identical request. All nine structured responses parsed and passed `AskOutputSchema`; all nine Markdown responses stayed freeform. All responses kept the requested language and none invented named citations, URLs, studies, or statistics.

The schema improvement is observed in this sample, not proof of a reliable rate increase. Coaching quality did not improve consistently. After JSON responses used empty follow-up and uncertainty arrays throughout, even where useful questions or caveats could have been included. Two responses included disabled optional analysis fields as empty objects; the existing server post-processing removes those fields. No schema or control enforcement was weakened.

| Run | Quality | Controls | Evidence honesty | Language | Risk | JSON syntax/schema | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phones beginner Markdown | 3 | 4 | Generalizations | English | Medium | N/A | Clear clash; same unsupported learning-outcome assumptions. |
| phones beginner JSON | 4 | 4 | Generalizations | English | Medium | Pass/pass | Useful explanation; no follow-up or uncertainty detail. |
| phones intermediate Markdown | 3 | 4 | Generalizations | English | Medium | N/A | Gives a judge test, but priority claim remains weak. |
| phones intermediate JSON | 3 | 4 | Generalizations | English | Medium | Pass/pass | Removes the absolute distractions claim; alludes to unspecified anecdotes. |
| phones advanced Markdown | 4 | 4 | Conditional claims | English | Low | N/A | Adds likelihood comparison and a clear regulated-use model. |
| phones advanced JSON | 3 | 4 | Generalizations | English | Medium | Pass/pass | Required arrays retained; successful case studies remain unspecified. |
| transit beginner Markdown | 4 | 4 | Conditional claims | Spanish | Low | N/A | Useful access versus funding/crowding comparison. |
| transit beginner JSON | 4 | 4 | Conditional claims | Spanish | Low | Pass/pass | Drops the speculative quality-perception argument. |
| transit intermediate Markdown | 2 | 3 | Generalizations | Spanish | Medium | N/A | Still treats taxation and subsidies as competing mechanisms. |
| transit intermediate JSON | 2 | 3 | Generalizations | Spanish | Medium | Pass/pass | Compares free fares with taxation, which can coexist. |
| transit advanced Markdown | 4 | 4 | Conditional claims | Spanish | Low | N/A | Targeted concessions and funding uncertainty are concrete. |
| transit advanced JSON | 3 | 3 | Conditional claims | Spanish | Low | Pass/pass | Includes disabled optional analysis objects; server removes them. |
| ai beginner Markdown | 3 | 4 | Generalizations | Hungarian | Medium | N/A | Learning-support argument assumes information-search capability. |
| ai beginner JSON | 4 | 4 | Conditional claims | Hungarian | Low | Pass/pass | Clear support versus independence clash. |
| ai intermediate Markdown | 3 | 3 | Generalizations | Hungarian | Medium | N/A | Policy labels still substitute for developed mechanisms. |
| ai intermediate JSON | 3 | 3 | Generalizations | Hungarian | Medium | Pass/pass | Includes disabled optional analysis objects; server removes them. |
| ai advanced Markdown | 2 | 3 | Speculation | Hungarian | Medium | N/A | Mental-health impact remains unsupported and unexplained. |
| ai advanced JSON | 3 | 4 | Generalizations | Hungarian | Medium | Pass/pass | An objection substitutes for a developed countermodel. |

### Assessment

The narrow contract change is supported: streaming remains Markdown, language stays consistent, and required JSON fields are present in all nine after samples. This baseline does not support a claim of better coaching overall. Retain schema validation, control post-processing and evidence warnings; do not begin provider-specific tuning from these results alone.

All 36 completed calls reported provider `OpenAI`, model `openai/gpt-4o-mini`. The exact prompts, synthetic inputs, request hashes and per-response assessments make the comparison repeatable, although model/backend revisions can change later outputs.

## Limits

These calls exercise prompt behavior through OpenRouter, not the app's native OpenAI provider connection or authenticated Supabase handler. Nine motion/complexity pairs do not establish provider-wide reliability. Language was requested explicitly, so these samples do not prove automatic language inference. No tuning for a particular provider is justified by this small sample alone. Raw responses and credentials are not committed. Synthetic response artifacts and request hashes are retained privately under `/tmp/debatelab-prompt-eval-20260907` on the execution host.
