// What a published mini round may show. Every field (the motion, each
// argument, rebuttal and judge note) passes through redactPersonalData before
// it is stored, and isSubstantial decides whether the page may be indexed.
//
// The patterns catch the personal data people actually type into a debate
// argument: contact details, links, handles, long numbers, and a name given
// with "my name is" or a title (Mr, Dr, Sra.). They cannot recognise a bare
// name; the opt-in tells visitors not to publish one, and any redaction keeps
// the page out of search results.

interface Pattern {
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string | null;
}

const NAME = "[\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+)?";

const PATTERNS: Pattern[] = [
  { pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu, replace: () => "[email removed]" },
  { pattern: /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu, replace: () => "[link removed]" },
  // A bare domain, with or without a path, in any case and script: example.com,
  // school.hu/class, EVIL.COM, Spam-Shop.Xyz, пример.рф. Any top-level domain counts, so a
  // page cannot carry a site name a list did not foresee. Words that only look
  // like one ("Node.js", or "casa.Es" with a missing space) go too; that costs
  // the page its indexing, nothing more.
  {
    pattern: /(?<![\p{L}\p{N}@.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,24}(?![\p{L}\p{N}])(?:\/[^\s<>"]*)?/gu,
    replace: () => "[link removed]",
  },
  { pattern: /(?<![\p{L}\p{N}])@[\p{L}\p{N}_.]{2,}/gu, replace: () => "[handle removed]" },
  // Nine or more digits with phone-style separators: a phone or an ID number,
  // never a year or a statistic. "+36 30 123 4567", "555-123-4567", "612345678".
  {
    pattern: /\+?\d(?:[\d\s().-]*\d)?/g,
    replace: (match) => ((match.match(/\d/g)?.length ?? 0) >= 9 ? "[number removed]" : null),
  },
  // A name the writer gives, in any case: "my name is Anna Kovács", "my name is
  // anna kovács", "me llamo Lucía", "a nevem Péter". The two words after the
  // phrase go, since a first name and a surname look like any other words in
  // lower case; "my name is not the point" loses "not the", which costs the
  // page its indexing, nothing more.
  {
    pattern: /(?<![\p{L}\p{N}])((?:my name is|my name's|i am called|i'm called|me llamo|mi nombre es|a nevem|nevem)\s+)[\p{L}'’-]+(?:\s+[\p{L}'’-]+)?/giu,
    replace: (_match, intro) => `${intro}[name removed]`,
  },
  // A person named with a title: "Mr Smith", "Dr. Kovács", "Sra. García".
  {
    pattern: new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sr|Sra|Srta|Señor|Señora|Señorita)\\.?\\s+${NAME}`, "gu"),
    replace: () => "[name removed]",
  },
];

/** The text with personal data replaced by a bracketed note, and how many replacements were made. */
export function redactPersonalData(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let result = text;
  for (const { pattern, replace } of PATTERNS) {
    result = result.replace(pattern, (match: string, ...groups: unknown[]) => {
      const replacement = replace(match, ...groups.filter((group): group is string => typeof group === "string"));
      if (replacement === null) return match;
      redactions += 1;
      return replacement;
    });
  }
  return { text: result, redactions };
}

/** The visitor's words across both turns that an indexable page needs. */
export const MIN_INDEXABLE_WORDS = 60;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Whether a published round has enough of its own content for search: both
 * turns, a rebuttal and a judge note in each, MIN_INDEXABLE_WORDS from the
 * visitor, and nothing redacted (a redacted page reads as broken, and may
 * still hold a name the patterns missed).
 */
export function isSubstantial(
  turns: ReadonlyArray<{ argument: string; rebuttal: string; judgeNote: string }>,
  redactions: number,
): boolean {
  if (redactions > 0 || turns.length !== 2) return false;
  if (turns.some((turn) => !turn.rebuttal.trim() || !turn.judgeNote.trim())) return false;
  return turns.reduce((total, turn) => total + words(turn.argument), 0) >= MIN_INDEXABLE_WORDS;
}
