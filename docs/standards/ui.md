# UI, language, and accessibility

Part of the [coding standards](../../CODING_STANDARDS.md). [docs/architecture.md](../architecture.md#language-behavior) owns how interface and AI-output language work. [docs/testing.md](../testing.md) owns the Hungarian parity checks.

## Every string is translated

- Every user-facing string, including toasts, errors, and accessible names, goes through `t()`. `src/test/i18n-keys.test.ts` fails when a literal key is missing from the catalogs or a `count` call lacks its plural forms. It cannot see dynamic keys (``t(`nav.${key}`)``) or raw values rendered as text, so check those by hand: an English word in a Hungarian screen is the usual sign ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004217), [#43](https://github.com/Programcode/DebateOwl/pull/43#discussion_r4048412531)).
- Store a translation key or error kind in state and translate at render time. English strings stored in state stay English after a reload ([#12](https://github.com/Programcode/DebateOwl/pull/12#discussion_r3893641290)).
- Use the localized feature name everywhere in a catalog: "Interrogatorio", "Keresztkérdezés" ([#12](https://github.com/Programcode/DebateOwl/pull/12#discussion_r3893641268), [#13 review](https://github.com/Programcode/DebateOwl/pull/13#issuecomment-5477866033)). The glossary below is the one name per language for each tool, role, and format.
- A count goes into the string as `count`, so i18next picks the plural form: `t('libraryPage.sourceCount', { count })`, never `` `${n} ${t('sources')}` ``. Format numbers and dates with `src/lib/date-format.ts`, which follows the interface language.
- `src/test/i18n-untranslated.test.ts` fails when a Spanish or Hungarian value is identical to English. When that is intended, such as a product or format name, add it to the test's list under a reason.

### Glossary

| Concept | English | Spanish | Hungarian |
| --- | --- | --- | --- |
| Crossfire (tool and saved round) | Crossfire | Interrogatorio | Keresztkérdezés |
| Sparring (tool and saved round) | Sparring | Sparring | Vitapárbaj |
| Timer | Timer | Cronómetro | Időmérő |
| Case | Case | Caso | Eset (Vitaeset in titles) |
| Ruthless (difficulty, intensity) | Ruthless | Despiadado | Kíméletlen |
| School format | School 4-6-6-3 | Formato escolar 4-6-6-3 | Iskolai 4-6-6-3 |
| School-format roles (the Timer spells out R1 and R2) | Introductor, R1, R2, Conclusor | Introductor, R1, R2, Conclusor | Bevezető, R1, R2, Záró |
| Sides in a Sparring turn | Pro, Con | a favor, en contra | Pro, Kontra |
| Competition formats | Public Forum, Lincoln-Douglas, Policy, British Parliamentary, World Schools, Asian Parliamentary | same as English | same as English |
| Load (button) / Loading | Load / Loading | Cargar / Cargando | Megnyitás / Betöltés |
| AI | AI | IA | MI |
| DebateLab with a suffix | | | DebateLabba, DebateLabban, DebateLabhoz, DebateLabot (no hyphen, back vowels) |

## Accessible names

- Icon-only links and buttons get an `aria-label`. The nav label hides below `xl`, which left the link nameless ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3894071703)).
- Repeated row actions include the row's name ("Delete <title>"), so screen readers and role queries can tell them apart ([#19](https://github.com/Programcode/DebateOwl/pull/19#discussion_r3896430613)).
- A label for a group of buttons uses `role="group"` and `aria-labelledby` ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004206)).
- Lists rendered from model output use index keys, because model strings can repeat ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004180)).

## Motion

When `shouldReduceMotion` is true, render a static element. Passing the flag to the phase but not to `initial`/`animate` still animates ([#20](https://github.com/Programcode/DebateOwl/pull/20#discussion_r3896378557)).

## Tell the user when the app refuses

- When a store action rejects input (too long, expired, invalid), the UI shows why. A submit button that silently does nothing looks broken ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649646)).
- Clear a composer only after the handler accepts the message, so a rejected draft is not lost ([#66 outside diff](https://github.com/Programcode/DebateOwl/pull/66)).
- Enforce rules such as deadlines in the store, and add the UI guard as a second layer ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649625)).

## Pending actions

- Keep a confirmation dialog open while its request is pending, and close it only on success. Radix closes on click unless you call `preventDefault()` ([#26](https://github.com/Programcode/DebateOwl/pull/26#discussion_r3897947151)).
- Side effects such as scrolling run on a success signal, not on "loading became false" ([#20](https://github.com/Programcode/DebateOwl/pull/20#discussion_r3896378580)).
- Open a new tab within the click handler. After an awaited request the user activation has expired and popup blockers drop the tab. Show a fallback link ([#63](https://github.com/Programcode/DebateOwl/pull/63#discussion_r4081818952)).
- On phones (below `md`) the bottom tab bar is the navigation. From `md` up the header nav is the navigation; there is no menu button at any width, so never show two navs at once ([#20](https://github.com/Programcode/DebateOwl/pull/20#discussion_r3896378566)).
