// One reading of a generated case for every place that shows or exports it.
// New cases have an opening, arguments, an "If they say…" list, a closing line
// and a sources list. R2 brings no new arguments: it backs up the team's
// earlier ones (`reinforce`), and the Conclusor sums up why we win. Saved cases from before keep their old keys (exordio,
// framework, burden of proof, definitions, the predicted opponent case and a
// separate rebuttal), so those come through as `legacy` and show only when
// they have content.
import type { CaseSource, GenerateOutput, Reinforcement } from './schemas/generate';

export interface CaseArgument {
  id: string;
  title?: string;
  point: string;
  explanation: string;
  evidence: string;
  whyItMatters: string;
  needsSource: boolean;
  sourceQuery?: string;
}

export interface CaseAnswer {
  theySay: string;
  weAnswer: string;
  /** Older cases' second phrasing of the answer, when it adds something. */
  inRound?: string;
  source?: string;
}

export interface CaseView {
  opening: {
    hook?: string;
    definition?: string;
    /** "We will show N arguments that prove…"; older cases' thesis. */
    roadmap?: string;
  };
  arguments: CaseArgument[];
  /** R2: the team's earlier arguments, backed up again. */
  reinforce: Reinforcement[];
  ifTheySay: CaseAnswer[];
  whyWeWin: string[];
  closingLine?: string;
  sources: CaseSource[];
  legacy: {
    framework?: string;
    burdenOfProof?: string;
    definitions: string[];
    likelyArguments: string[];
    weaknesses: string[];
    clashes: string[];
  };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

/** Saved and shared cases come from storage, so only a web link is ever linked. */
function webUrl(value: unknown): string | undefined {
  const url = text(value);
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function joined(...parts: Array<string | undefined>): string | undefined {
  const present = parts.filter(Boolean);
  return present.length ? present.join(' ') : undefined;
}

export function readCase(result: GenerateOutput): CaseView {
  const structure = result.caseStructure ?? { thesis: '' };
  const counters = Array.isArray(result.counters) ? result.counters : [];
  const opponent = result.predictedOpponentCase;
  const answered = new Set(counters.map((counter) => text(counter?.targetArgument)?.toLowerCase()));
  return {
    opening: {
      hook: text(result.opening?.hook) ?? joined(text(result.exordio?.hook), text(result.exordio?.transition)),
      definition: text(result.opening?.definition),
      roadmap: text(structure.thesis),
    },
    arguments: (Array.isArray(result.contentions) ? result.contentions : []).map((contention, index) => ({
      id: contention?.id || String(index + 1),
      title: text(contention?.title),
      point: text(contention?.claim) ?? '',
      explanation: text(contention?.reasoning) ?? '',
      evidence: text(contention?.evidence) ?? '',
      whyItMatters: text(contention?.impact) ?? '',
      needsSource: Boolean(contention?.needsSource),
      sourceQuery: text(contention?.sourceQuery),
    })),
    reinforce: (Array.isArray(result.reinforce) ? result.reinforce : []).flatMap((item) => {
      const body = text(item?.text);
      return body ? [{ argument: text(item?.argument) ?? '', text: body }] : [];
    }),
    ifTheySay: counters.flatMap((counter) => {
      const theySay = text(counter?.targetArgument);
      const counterpoint = text(counter?.counterpoint);
      const rebuttal = text(counter?.rebuttal);
      const weAnswer = counterpoint ?? rebuttal;
      if (!theySay && !weAnswer) return [];
      return [{
        theySay: theySay ?? '',
        weAnswer: weAnswer ?? '',
        inRound: counterpoint && rebuttal && rebuttal !== counterpoint ? rebuttal : undefined,
        source: text(counter?.source),
      }];
    }),
    whyWeWin: texts(result.whyWeWin),
    closingLine: text(result.closingLine),
    sources: (Array.isArray(result.sources) ? result.sources : []).flatMap((source) => {
      const org = text(source?.org);
      const claim = text(source?.claim);
      if (!org && !claim) return [];
      return [{ org: org ?? '', claim: claim ?? '', year: text(source?.year), url: webUrl(source?.url) }];
    }),
    legacy: {
      framework: text(structure.framework),
      burdenOfProof: text(structure.burdenOfProof),
      definitions: texts(structure.keyDefinitions),
      // An argument the list already answers is not repeated as a bare bullet.
      likelyArguments: texts(opponent?.likelyArguments).filter((argument) => !answered.has(argument.toLowerCase())),
      weaknesses: texts(opponent?.strategicWeaknesses),
      clashes: texts(opponent?.keyClashes),
    },
  };
}

/** "UNICEF (2025)", or just the organisation when the year is unknown. */
export function sourceLabel(source: Pick<CaseSource, 'org' | 'year'>): string {
  return [source.org, source.year && `(${source.year})`].filter(Boolean).join(' ');
}

/** "UNICEF (2025) – Most minors use AI to learn – https://…" for exports and plain text. */
export function sourceLine(source: CaseSource): string {
  return [sourceLabel(source), source.claim, source.url].filter(Boolean).join(' – ');
}

/**
 * A regenerated section can cite new sources while the rest of the case still
 * cites the old ones, so the list keeps both, each source once.
 */
export function mergeCaseSources(current: CaseSource[] | null | undefined, next: CaseSource[] | null | undefined): CaseSource[] | undefined {
  const seen = new Set<string>();
  const merged = [...(next ?? []), ...(current ?? [])].filter((source) => {
    const key = (source.url || `${source.org}|${source.claim}`).trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return merged.length ? merged : undefined;
}
