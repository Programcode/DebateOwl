/**
 * Speech orders and times for the free debate tools (timer, flow sheet, speech
 * calculator). Every number comes from the source listed with its format;
 * leagues and tournaments vary, so the timer lets a coach change any of them.
 */

export type SegmentKind = 'speech' | 'reply' | 'cross-examination' | 'crossfire';
/** `a` speaks first in the format's own terms (Affirmative, Government, Team A); `both` is a shared period. */
export type SegmentSide = 'a' | 'b' | 'both';

export interface RoundSegment {
  id: string;
  /** Short name on buttons and flow-sheet columns: "1AC", "PM". */
  short: string;
  /** Full name: "First Affirmative Constructive". */
  label: string;
  side: SegmentSide;
  kind: SegmentKind;
  seconds: number;
  /** Elapsed seconds between which points of information may be offered; outside it the speech is protected. */
  poi?: { opensAt: number; closesAt: number };
  /** What both sides' speech in this slot is called ("constructive"), when the short name names a side. */
  role?: string;
}

export interface FormatSource {
  label: string;
  url: string;
}

export interface RoundFormat {
  id: string;
  name: string;
  shortName: string;
  sideNames: readonly [string, string];
  segments: readonly RoundSegment[];
  /** In-round prep time each side may use, in seconds; 0 when the format has none. */
  prepSeconds: number;
  /** Seconds past time a speech may run before judges stop listening, where the rules give one. */
  graceSeconds?: number;
  sources: readonly FormatSource[];
  /** What varies between leagues, in one or two sentences. */
  note: string;
}

export const BUILT_IN_FORMAT_IDS = ['pf', 'ld', 'policy', 'bp', 'wsdc', 'ap', 'school'] as const;
export type BuiltInFormatId = (typeof BUILT_IN_FORMAT_IDS)[number];

const MIN = 60;

const NSDA_MANUAL: FormatSource = {
  label: 'NSDA High School Unified Manual',
  url: 'https://www.speechanddebate.org/high-school-unified-manual/',
};

const speech = (id: string, short: string, label: string, side: SegmentSide, seconds: number, poi?: RoundSegment['poi'], role?: string): RoundSegment =>
  ({ id, short, label, side, kind: 'speech', seconds, ...(poi ? { poi } : {}), ...(role ? { role } : {}) });
const question = (id: string, short: string, label: string, side: SegmentSide, kind: 'cross-examination' | 'crossfire', seconds: number): RoundSegment =>
  ({ id, short, label, side, kind, seconds });
const reply = (id: string, short: string, label: string, side: SegmentSide, seconds: number): RoundSegment =>
  ({ id, short, label, side, kind: 'reply', seconds, role: 'reply' });

/** POIs between the end of the first minute and the start of the last. */
const protectedEnds = (seconds: number) => ({ opensAt: MIN, closesAt: seconds - MIN });

export const FORMATS: Record<BuiltInFormatId, RoundFormat> = {
  pf: {
    id: 'pf',
    name: 'Public Forum',
    shortName: 'PF',
    sideNames: ['Team A', 'Team B'],
    segments: [
      speech('a1', 'A Const', 'Team A constructive (first speaker)', 'a', 4 * MIN, undefined, 'constructive'),
      speech('b1', 'B Const', 'Team B constructive (first speaker)', 'b', 4 * MIN, undefined, 'constructive'),
      question('cf1', 'CF 1', 'Crossfire (first speakers)', 'both', 'crossfire', 3 * MIN),
      speech('a2', 'A Rebuttal', 'Team A rebuttal (second speaker)', 'a', 4 * MIN, undefined, 'rebuttal'),
      speech('b2', 'B Rebuttal', 'Team B rebuttal (second speaker)', 'b', 4 * MIN, undefined, 'rebuttal'),
      question('cf2', 'CF 2', 'Crossfire (second speakers)', 'both', 'crossfire', 3 * MIN),
      speech('a3', 'A Summary', 'Team A summary (first speaker)', 'a', 3 * MIN, undefined, 'summary'),
      speech('b3', 'B Summary', 'Team B summary (first speaker)', 'b', 3 * MIN, undefined, 'summary'),
      question('gcf', 'Grand CF', 'Grand crossfire (all four debaters)', 'both', 'crossfire', 3 * MIN),
      speech('a4', 'A Final Focus', 'Team A final focus (second speaker)', 'a', 2 * MIN, undefined, 'final focus'),
      speech('b4', 'B Final Focus', 'Team B final focus (second speaker)', 'b', 2 * MIN, undefined, 'final focus'),
    ],
    prepSeconds: 3 * MIN,
    sources: [NSDA_MANUAL],
    note: 'A coin toss decides which team speaks first, so Team A can be Pro or Con. NSDA moved summaries and prep from 2 to 3 minutes in 2020; some local leagues still use 2 and 2.',
  },
  ld: {
    id: 'ld',
    name: 'Lincoln-Douglas',
    shortName: 'LD',
    sideNames: ['Affirmative', 'Negative'],
    segments: [
      speech('ac', 'AC', 'Affirmative constructive', 'a', 6 * MIN),
      question('cx1', 'CX', 'Negative cross-examines the Affirmative', 'b', 'cross-examination', 3 * MIN),
      speech('nc', 'NC', 'Negative constructive', 'b', 7 * MIN),
      question('cx2', 'CX', 'Affirmative cross-examines the Negative', 'a', 'cross-examination', 3 * MIN),
      speech('1ar', '1AR', 'First affirmative rebuttal', 'a', 4 * MIN),
      speech('nr', 'NR', 'Negative rebuttal', 'b', 6 * MIN),
      speech('2ar', '2AR', 'Second affirmative rebuttal', 'a', 3 * MIN),
    ],
    prepSeconds: 4 * MIN,
    sources: [NSDA_MANUAL],
    note: 'Four minutes of prep per debater is the NSDA standard; some tournaments allow up to five, so check the invitation.',
  },
  policy: {
    id: 'policy',
    name: 'Policy (CX)',
    shortName: 'Policy',
    sideNames: ['Affirmative', 'Negative'],
    segments: [
      speech('1ac', '1AC', 'First affirmative constructive', 'a', 8 * MIN),
      question('cx1', 'CX', 'Negative cross-examines the 1AC', 'b', 'cross-examination', 3 * MIN),
      speech('1nc', '1NC', 'First negative constructive', 'b', 8 * MIN),
      question('cx2', 'CX', 'Affirmative cross-examines the 1NC', 'a', 'cross-examination', 3 * MIN),
      speech('2ac', '2AC', 'Second affirmative constructive', 'a', 8 * MIN),
      question('cx3', 'CX', 'Negative cross-examines the 2AC', 'b', 'cross-examination', 3 * MIN),
      speech('2nc', '2NC', 'Second negative constructive', 'b', 8 * MIN),
      question('cx4', 'CX', 'Affirmative cross-examines the 2NC', 'a', 'cross-examination', 3 * MIN),
      speech('1nr', '1NR', 'First negative rebuttal', 'b', 5 * MIN),
      speech('1ar', '1AR', 'First affirmative rebuttal', 'a', 5 * MIN),
      speech('2nr', '2NR', 'Second negative rebuttal', 'b', 5 * MIN),
      speech('2ar', '2AR', 'Second affirmative rebuttal', 'a', 5 * MIN),
    ],
    prepSeconds: 8 * MIN,
    sources: [NSDA_MANUAL],
    note: 'This is the NSDA 8-3-5 structure with 8 minutes of prep per team. Older material lists 5 minutes of prep, and some state circuits still run 4-minute rebuttals.',
  },
  bp: {
    id: 'bp',
    name: 'British Parliamentary',
    shortName: 'BP',
    sideNames: ['Government', 'Opposition'],
    segments: [
      speech('pm', 'PM', 'Prime Minister (Opening Government)', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('lo', 'LO', 'Leader of the Opposition (Opening Opposition)', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('dpm', 'DPM', 'Deputy Prime Minister (Opening Government)', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('dlo', 'DLO', 'Deputy Leader of the Opposition (Opening Opposition)', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('mg', 'MG', 'Member of Government (Closing Government)', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('mo', 'MO', 'Member of Opposition (Closing Opposition)', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('gw', 'GW', 'Government Whip (Closing Government)', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('ow', 'OW', 'Opposition Whip (Closing Opposition)', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
    ],
    prepSeconds: 0,
    graceSeconds: 15,
    sources: [
      { label: 'WUDC Debating & Judging Manual (2024 revision)', url: 'https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf' },
    ],
    note: 'Teams get 15 minutes of preparation after the motion is released, before the round. Signals sound at 1:00, 6:00 and 7:00; judges disregard material after 7:15.',
  },
  wsdc: {
    id: 'wsdc',
    name: 'World Schools',
    shortName: 'WSDC',
    sideNames: ['Proposition', 'Opposition'],
    segments: [
      speech('p1', 'Prop 1', 'First Proposition', 'a', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      speech('o1', 'Opp 1', 'First Opposition', 'b', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      speech('p2', 'Prop 2', 'Second Proposition', 'a', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      speech('o2', 'Opp 2', 'Second Opposition', 'b', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      speech('p3', 'Prop 3', 'Third Proposition', 'a', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      speech('o3', 'Opp 3', 'Third Opposition', 'b', 8 * MIN, protectedEnds(8 * MIN), 'substantive speech'),
      reply('or', 'Opp Reply', 'Opposition reply (first or second speaker)', 'b', 4 * MIN),
      reply('pr', 'Prop Reply', 'Proposition reply (first or second speaker)', 'a', 4 * MIN),
    ],
    prepSeconds: 0,
    sources: [
      { label: 'WSDC Tournament Committee & Debate Rules (August 2026)', url: 'https://www.wsdcdebating.org/_files/ugd/669183_8ee4b95d4bf4409a893cc22e5f1f35b9.pdf' },
      { label: 'NSDA USA World Schools Debate Invitational manual', url: 'https://docs.google.com/document/d/1w5t9sQhQGBoRQBUomjVgx-2vThAXctWDlU3oECzQ0-g' },
    ],
    note: 'Reply speeches run in reverse order, Opposition first, and take no points of information. Impromptu motions come with one hour of preparation; prepared motions are released weeks ahead.',
  },
  ap: {
    id: 'ap',
    name: 'Asian Parliamentary',
    shortName: 'AP',
    sideNames: ['Government', 'Opposition'],
    segments: [
      speech('pm', 'PM', 'Prime Minister', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('lo', 'LO', 'Leader of the Opposition', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('dpm', 'DPM', 'Deputy Prime Minister', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('dlo', 'DLO', 'Deputy Leader of the Opposition', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('gw', 'GW', 'Government Whip', 'a', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      speech('ow', 'OW', 'Opposition Whip', 'b', 7 * MIN, protectedEnds(7 * MIN), 'substantive speech'),
      reply('or', 'Opp Reply', 'Opposition reply (first or second speaker)', 'b', 4 * MIN),
      reply('gr', 'Gov Reply', 'Government reply (first or second speaker)', 'a', 4 * MIN),
    ],
    prepSeconds: 0,
    graceSeconds: 15,
    sources: [
      { label: 'UADC 2023 Debating and Judging Handbook', url: 'https://ugc.production.linktr.ee/e32c9614-640c-4ce1-8522-3b613a228a89_Malaysia-UADC-2023---Debate---Judging-Handbook.pdf' },
    ],
    note: 'There is no single official rulebook; this follows the UADC handbook, with 30 minutes of preparation before the round. Some school leagues shorten speeches, so check your tournament.',
  },
  school: {
    id: 'school',
    name: 'School 4-6-6-3',
    shortName: '4-6-6-3',
    sideNames: ['Pro', 'Con'],
    segments: [
      speech('pi', 'Pro Intro', 'Pro introductor', 'a', 4 * MIN, undefined, 'introductor'),
      speech('ci', 'Con Intro', 'Con introductor', 'b', 4 * MIN, undefined, 'introductor'),
      speech('pr1', 'Pro R1', 'Pro first rebuttal', 'a', 6 * MIN, undefined, 'first rebuttal'),
      speech('cr1', 'Con R1', 'Con first rebuttal', 'b', 6 * MIN, undefined, 'first rebuttal'),
      speech('pr2', 'Pro R2', 'Pro second rebuttal', 'a', 6 * MIN, undefined, 'second rebuttal'),
      speech('cr2', 'Con R2', 'Con second rebuttal', 'b', 6 * MIN, undefined, 'second rebuttal'),
      speech('pc', 'Pro Concl', 'Pro conclusor', 'a', 3 * MIN, undefined, 'conclusor'),
      speech('cc', 'Con Concl', 'Con conclusor', 'b', 3 * MIN, undefined, 'conclusor'),
    ],
    prepSeconds: 0,
    sources: [],
    note: 'The school format DebateOwl uses for its own sparring rounds: introductor, two rebuttals and a conclusor per side. It is not a national league format.',
  },
};

export const BUILT_IN_FORMATS: readonly RoundFormat[] = BUILT_IN_FORMAT_IDS.map((id) => FORMATS[id]);

export function isBuiltInFormatId(value: string | null | undefined): value is BuiltInFormatId {
  return typeof value === 'string' && (BUILT_IN_FORMAT_IDS as readonly string[]).includes(value);
}

/** The speeches a flow sheet gets a column for and a speech can be timed against: no questioning periods. */
export function speakingSegments(format: RoundFormat): RoundSegment[] {
  return format.segments.filter((segment) => segment.kind === 'speech' || segment.kind === 'reply');
}

export const segmentRole = (segment: RoundSegment) => segment.role ?? segment.short;

export function questioningSegments(format: RoundFormat): RoundSegment[] {
  return format.segments.filter((segment) => segment.kind === 'cross-examination' || segment.kind === 'crossfire');
}

export function roundSeconds(format: RoundFormat): number {
  return format.segments.reduce((total, segment) => total + segment.seconds, 0) + 2 * format.prepSeconds;
}

/** "4:00", "7:30", "1:00:00". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
