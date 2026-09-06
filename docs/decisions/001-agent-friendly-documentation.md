# Decision 001: Agent-friendly documentation

**Status:** Accepted on 2026-09-06

## Decision

DebateLab uses progressive disclosure for project documentation.

- `AGENTS.md` is the small, always-loaded rule and routing file.
- `README.md` is the human quick start and product overview.
- Focused documents explain architecture, development, testing, operations, and Supabase.
- Plans and dated evidence state their freshness and are not treated as current implementation truth.
- Source files remain the owners of scripts, routes, workflows, schema, backend behavior, and packaging.

New maintained Markdown is checked by default. A dependency-free script validates the local link forms DebateLab uses and rejects actionable retired checkout paths.

## Context

The previous root README had grown into a historical product specification. It copied framework versions, routes, backend topology, schema examples, provider models, deployment commands, and a large source tree. Several claims were obsolete, including the local directory name. Agents loaded the file, trusted stale instructions, and spent context on details that source search could answer more accurately.

The former agent guide had better operational rules but mixed always-needed safety constraints with long staging procedures. It also described Superset helper files that were not present in the reviewed worktree.

## Why progressive disclosure

Always-loaded context is finite. Most tasks need repository identity, core commands, safety boundaries, a shallow system map, and a pointer to one deeper guide. Loading database, browser, staging, deployment, and product details for every edit wastes context and increases the chance that stale prose overrides current source.

Focused documents make ownership visible and let a reader open only the relevant path.

## Rejected alternatives

### Keep one comprehensive README

Rejected because a single file mixes onboarding, reference, explanation, operations, and historical product material. It becomes expensive to load and difficult to keep current.

### Create copies for every coding agent

Rejected because `CLAUDE.md`, Copilot instructions, and other parallel copies would repeat commands and safety rules. They would consume more context and drift independently. `AGENTS.md` is the shared project contract unless a future tool requires a small adapter that links back without copying content.

### Generate class-level architecture documentation

Rejected because component and class inventories change too often. Stable system and container boundaries are maintained; lower-level structure is discovered from source when needed.

### Install a Markdown linter

Rejected for this scope. DebateLab needs two narrow guarantees: supported local links resolve, and retired checkout commands do not return. A Node standard-library script provides those checks without another dependency or a misleading claim of full Markdown validation.

## Maintenance rules

- Keep `AGENTS.md` at or below 150 lines.
- Keep one owner for every operational fact.
- Link to source instead of copying dependency, route, schema, function, or model catalogs.
- Include new Markdown in checks by default.
- Use exact exclusions for generated, immutable evidence, security-scan, and plan/spec paths.
- Update the focused document when its owning source changes.
- Label plans, evidence snapshots, generated files, and historical notes clearly.
- Revalidate plans against the current branch before execution.

## Official guidance consulted

- [OpenAI Codex AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md)
- [OpenAI Codex customization](https://developers.openai.com/codex/concepts/customization)
- [Anthropic Claude Code memory and project instructions](https://code.claude.com/docs/en/memory)
- [Anthropic Agent Skills quickstart](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/quickstart)
- [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [Diátaxis documentation framework](https://diataxis.fr/)
- [C4 model diagrams](https://c4model.com/diagrams)
- [Google technical writing guidance on short sentences](https://developers.google.com/tech-writing/one/short-sentences)

The project applies these sources as guidance, not as runtime dependencies.
