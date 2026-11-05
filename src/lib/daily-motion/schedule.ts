import type { SparringFormat } from '@/lib/ai/schemas/sparring';

/**
 * The Daily Motion: one numbered practice motion per day for everyone, with
 * the format it is set for, the clash, one line for each side and what the
 * ballot will turn on. Day 1 is DAILY_MOTION_EPOCH; days change at midnight UTC,
 * as the /ai-debate demo's daily limit does. Each day's page, /motion/<number>,
 * is a permalink: never reorder, renumber or remove a day, only append.
 *
 * The motions come from the motion generator's bank (src/lib/free-tools/practice-motions.ts),
 * copied here with both wordings so the landing page, which shows today's, does not load the bank.
 */
export const DAILY_MOTION_EPOCH = '2026-11-05';

export type DailyMotionFormat = 'pf' | 'ld' | 'school';

interface ScheduledDay {
  /** The practice motion's id, its permalink in the motion generator (`?m=`). */
  motionId: string;
  /** "This House would …", the wording for BP, World Schools and the School 4-6-6-3 format. */
  house: string;
  /** "Resolved: …", the wording for PF and LD. */
  resolved: string;
  format: DailyMotionFormat;
  /** The question the round is really about, in one or two sentences. */
  clash: string;
  /** The strongest line for the side that supports the motion. */
  pro: string;
  /** The strongest line against it. */
  con: string;
  /** What a judge will most likely decide the round on. */
  ballot: string;
}

const SCHEDULE: readonly ScheduledDay[] = [
  {
    motionId: 'edu-006',
    house: 'This House would make students lock their phones in sealed pouches for the whole school day',
    resolved: 'Resolved: Students should be required to lock their phones in sealed pouches for the whole school day.',
    format: 'pf',
    clash: 'Whether a phone in a sealed pouch removes a distraction or removes a tool students and parents rely on.',
    pro: 'Attention is the scarcest thing in a classroom; a rule that holds for every student all day ends the constant negotiation over when a phone may come out.',
    con: 'A blanket lock punishes the students who use phones well, cuts off contact in emergencies and teaches nothing about self-control once they leave school.',
    ballot: 'Weigh scope against certainty: Pro needs to show the learning gain reaches most students, Con needs a harm that is likely, not just possible.',
  },
  {
    motionId: 'eth-003',
    house: 'This House believes that it is sometimes right to break a promise',
    resolved: 'Resolved: It is sometimes right to break a promise.',
    format: 'ld',
    clash: 'Whether a promise binds absolutely, or only as long as keeping it serves the reasons we make promises at all.',
    pro: 'Promises exist to protect people; when keeping one would seriously harm someone, breaking it honours the purpose of promising better than keeping it does.',
    con: 'A promise that can be broken whenever the promiser thinks it right is only a forecast; trust depends on promises holding when they become inconvenient.',
    ballot: 'The round turns on the value: if the judge accepts well-being as the standard, the Affirmative only needs one clear case; if trust or respect for persons wins, the Negative does.',
  },
  {
    motionId: 'soc-009',
    house: 'This House would require social media platforms to switch off infinite scrolling by default',
    resolved: 'Resolved: Social media platforms should switch off infinite scrolling by default.',
    format: 'school',
    clash: 'Whether endless feeds are a design choice that exploits users or a convenience they would choose anyway.',
    pro: 'A default is a decision made for millions of people; turning infinite scroll off by default gives back a natural stopping point without banning anything.',
    con: 'Users who want endless feeds will switch it straight back on, so the rule changes little while forcing every platform into the same design.',
    ballot: 'Conclusors should compare how many people a default actually moves; the side that proves or disproves the size of that effect usually wins.',
  },
  {
    motionId: 'health-002',
    house: 'This House would start the school day no earlier than 9:30 to let teenagers sleep',
    resolved: 'Resolved: The school day should start no earlier than 9:30 to let teenagers sleep.',
    format: 'pf',
    clash: 'Whether teenagers get more sleep when school starts later, or simply go to bed later.',
    pro: 'Adolescent sleep cycles shift later in puberty, so a 9:30 start lines school up with when teenagers can actually learn.',
    con: 'A later start pushes back sports, jobs and family schedules; the costs land on working parents and on the students with the longest commutes.',
    ballot: 'Probability decides it: whichever team carries better evidence on whether students sleep more, not just later, into final focus is ahead.',
  },
  {
    motionId: 'tech-003',
    house: 'This House believes that AI chatbots should always tell people they are not human',
    resolved: 'Resolved: AI chatbots ought to always tell people that they are not human.',
    format: 'ld',
    clash: 'Whether people have a right to know when they are talking to a machine.',
    pro: 'Consent requires knowing who you are dealing with; a chatbot that passes as human manipulates the trust people give to other people.',
    con: 'A disclosure rule protects no one who already knows and helps no one in a harmless exchange; what matters is honesty about what the system does, not what it is.',
    ballot: 'Expect the judge to weigh autonomy against utility; the Affirmative should link every argument back to informed choice.',
  },
  {
    motionId: 'env-002',
    house: 'This House would close the streets outside schools to cars at drop-off and pick-up times',
    resolved: 'Resolved: Streets outside schools should be closed to cars at drop-off and pick-up times.',
    format: 'school',
    clash: 'Whether closing school streets makes children safer or just moves the traffic around the corner.',
    pro: 'Drop-off is the most dangerous half hour on the street; removing cars there protects children exactly when they are most exposed and makes walking normal.',
    con: 'Closures push cars onto the next roads and hit families who have no realistic way to arrive but by car.',
    ballot: 'R2 speakers must engage the displacement point directly; an unanswered "the traffic just moves" usually decides this motion.',
  },
  {
    motionId: 'pol-009',
    house: 'This House would make voting compulsory',
    resolved: 'Resolved: Voting should be compulsory.',
    format: 'pf',
    clash: 'Whether a government that hears from everyone is worth forcing people to vote.',
    pro: 'When turnout is compulsory, politicians must appeal to the young and the poor instead of only to the groups that already vote.',
    con: 'Forcing the uninterested to vote adds random ballots, not considered ones, and punishes people for a choice that is part of free expression.',
    ballot: 'Magnitude against principle: Pro should quantify how policy changes, Con should argue that the liberty cost applies to every citizen.',
  },
  {
    motionId: 'just-003',
    house: 'This House believes that prisons should focus on helping prisoners change rather than on punishment',
    resolved: 'Resolved: Prisons ought to focus on helping prisoners change rather than on punishment.',
    format: 'ld',
    clash: 'Whether justice owes an offender a path back, or owes society and victims a proportionate response.',
    pro: 'Almost every prisoner is released; a system that does not change them makes the next victim more likely, which is the opposite of justice.',
    con: 'Punishment is what an offender deserves; treating prison only as therapy erases the wrong done to the victim.',
    ballot: 'The criterion clash is the round: reducing harm against giving people what they deserve. Win the framework and the evidence follows.',
  },
  {
    motionId: 'edu-009',
    house: 'This House would replace letter grades with written feedback for all students under 16',
    resolved: 'Resolved: Schools should replace letter grades with written feedback for all students under 16.',
    format: 'school',
    clash: 'Whether grades motivate students or stop them reading the feedback that would help them improve.',
    pro: 'A letter grade ends the conversation; written feedback tells a student what to fix and keeps the focus on learning, not ranking.',
    con: 'Grades are a clear, comparable signal for students, parents and the next school; vague comments can hide falling standards.',
    ballot: 'Judges will reward the side that shows what actually happens in a classroom of thirty, not the ideal version of either system.',
  },
  {
    motionId: 'tech-009',
    house: 'This House would require all AI-generated images to carry a visible label',
    resolved: 'Resolved: All AI-generated images should carry a visible label.',
    format: 'pf',
    clash: 'Whether a visible label stops people being fooled by fake images, or just teaches them to trust unlabeled fakes.',
    pro: 'Labels give ordinary viewers a fast cue in the moment they decide to share, which is when misinformation spreads.',
    con: 'Bad actors will strip or never add the label, so honest creators carry the cost while unlabeled fakes look more trustworthy.',
    ballot: 'Probability of compliance is the weighing mechanism; whoever proves who actually labels images wins the link.',
  },
  {
    motionId: 'econ-011',
    house: 'This House believes that inheritance is unfair',
    resolved: 'Resolved: Inheritance is unfair.',
    format: 'ld',
    clash: 'Whether passing wealth to your children is a family right or an unearned head start.',
    pro: 'Fairness means rewards follow effort; inheritance hands the largest advantages to people who did nothing to earn them.',
    con: 'Parents earned that wealth, and providing for one\'s children is among the most basic things people work for.',
    ballot: 'Define "unfair" early. If fairness means equal opportunity, the Affirmative leads; if it means respecting what people rightly own, the Negative does.',
  },
  {
    motionId: 'sport-010',
    house: 'This House would ban heading the ball in youth soccer',
    resolved: 'Resolved: Heading the ball should be banned in youth soccer.',
    format: 'school',
    clash: 'Whether the risk of repeated heading justifies changing how children learn the game.',
    pro: 'Young brains are still developing; small repeated impacts add up, and children can learn heading later when they are physically ready.',
    con: 'A ban leaves young players unprepared for the adult game and pushes clubs to skip the safe technique coaching that reduces injuries.',
    ballot: 'This is a precaution debate: conclusors should weigh the size of an uncertain harm against the certainty of the cost to the game.',
  },
  {
    motionId: 'health-009',
    house: 'This House would make organ donation opt-out rather than opt-in',
    resolved: 'Resolved: Organ donation should be opt-out rather than opt-in.',
    format: 'pf',
    clash: 'Whether presumed consent saves lives or just changes paperwork.',
    pro: 'Most people support donation but never register; opt-out matches the rules to what people already want and shortens waiting lists.',
    con: 'Donation rates depend on hospital systems and family consent, not the default, and presumed consent weakens trust in doctors.',
    ballot: 'Expect the judge to want comparative evidence from countries that switched; the team with the better causal story wins the weighing.',
  },
  {
    motionId: 'just-011',
    house: 'This House believes that the media should not name people accused of crimes until they are convicted',
    resolved: 'Resolved: The media ought not to name people accused of crimes until they are convicted.',
    format: 'ld',
    clash: 'Whether the public\'s right to know outweighs an accused person\'s right to be presumed innocent.',
    pro: 'Naming someone before trial punishes them before any verdict, and an acquittal never undoes the headline.',
    con: 'Open justice protects against secret arrests and lets other victims come forward; anonymity serves the powerful most.',
    ballot: 'Both sides claim justice as a value; the criterion decides it, so spell out whose rights the system exists to protect.',
  },
  {
    motionId: 'soc-001',
    house: 'This House would ban children under 14 from having social media accounts',
    resolved: 'Resolved: Children under 14 should be banned from having social media accounts.',
    format: 'school',
    clash: 'Whether an age limit protects children or just pushes them onto platforms with fewer safeguards.',
    pro: 'Under-14s are the group most hurt by comparison and contact from strangers; a clear legal line gives parents backing to say no.',
    con: 'Children will lie about their age; a ban removes them from the safest, moderated spaces and the parental controls that come with them.',
    ballot: 'Enforcement is the hinge. The Con side wins if the ban does not hold; the Pro side wins if even partial compliance protects the youngest.',
  },
  {
    motionId: 'econ-009',
    house: 'This House would introduce a four-day working week with no cut in pay',
    resolved: 'Resolved: Employers should introduce a four-day working week with no cut in pay.',
    format: 'pf',
    clash: 'Whether rested workers produce as much in four days, or whether the fifth day\'s work simply goes undone.',
    pro: 'Trials show productivity holds while burnout and sick days fall, so employers keep output and keep their staff.',
    con: 'Trials select willing office firms; hospitals, schools and shops cannot compress shifts and would need more staff they cannot afford.',
    ballot: 'Scope is everything: Pro must show the results generalise, Con must show where they break down. Final focus should name those workers.',
  },
  {
    motionId: 'tech-017',
    house: 'This House believes that AI should never be used to grade student essays',
    resolved: 'Resolved: AI ought never to be used to grade student essays.',
    format: 'ld',
    clash: 'Whether grading is a judgment that must stay human, or a task where consistency matters most.',
    pro: 'An essay is a person trying to persuade a person; reducing it to a machine score teaches students to write for an algorithm.',
    con: 'Human grading is tired, biased and slow; a tool that gives fast, consistent feedback can serve students better than a teacher at midnight.',
    ballot: 'Note the word "never". The Negative only needs one justified use; the Affirmative should argue a principle that covers every case.',
  },
  {
    motionId: 'env-010',
    house: 'This House would ban flights on routes where the same trip takes under five hours by train',
    resolved: 'Resolved: Flights should be banned on routes where the same trip takes under five hours by train.',
    format: 'school',
    clash: 'Whether forcing travellers onto trains cuts emissions or just cuts mobility for those who cannot afford rail fares.',
    pro: 'Short flights produce the most emissions per kilometre and have a real alternative; a ban removes them where the cost to travellers is lowest.',
    con: 'Rail is often more expensive and slower door to door; the ban prices out poorer travellers while doing little for total aviation emissions.',
    ballot: 'Comparative weighing wins: set the emissions saved against who loses access, and show why your side\'s impact is larger.',
  },
  {
    motionId: 'pol-001',
    house: 'This House would let 16-year-olds vote in local elections but not national ones',
    resolved: 'Resolved: Sixteen-year-olds should be able to vote in local elections but not national ones.',
    format: 'pf',
    clash: 'Whether local politics is the right place for sixteen-year-olds to start voting.',
    pro: 'Local councils decide on buses, parks and youth services that teenagers use daily; voting young builds a lifelong habit.',
    con: 'If sixteen-year-olds are capable voters, limiting them to local elections is arbitrary; if they are not, the vote should not start there.',
    ballot: 'The Con consistency argument is the trap. Pro wins by explaining why local is different in kind, not just a smaller stake.',
  },
  {
    motionId: 'eth-011',
    house: 'This House believes that people have a moral duty to give a tenth of their income to effective charities',
    resolved: 'Resolved: People have a moral duty to give a tenth of their income to effective charities.',
    format: 'ld',
    clash: 'Whether doing a lot of good cheaply is a duty or an admirable choice.',
    pro: 'If a tenth of your income can save lives at little cost to you, failing to give is a choice to let preventable harm happen.',
    con: 'Morality that demands a fixed share of income from everyone ignores different circumstances and turns generosity into a tax.',
    ballot: 'A "duty" is a strong claim. Expect the judge to ask how demanding morality can be; the Affirmative needs a limit that still requires a tenth.',
  },
  {
    motionId: 'cult-009',
    house: 'This House would return cultural artifacts in museums to the countries they were taken from',
    resolved: 'Resolved: Museums should return cultural artifacts to the countries they were taken from.',
    format: 'school',
    clash: 'Whether an object belongs where it was made or where it is best cared for and seen.',
    pro: 'Artifacts taken in conquest or under colonial rule were never fairly acquired; returning them corrects a wrong that is still visible.',
    con: 'Universal museums let millions see world cultures side by side; claims can be complex when borders and peoples have changed.',
    ballot: 'Judges reward the side that handles the hardest case on its own side, not the easiest case for it.',
  },
  {
    motionId: 'tech-010',
    house: 'This House would ban shops from using facial recognition to identify customers',
    resolved: 'Resolved: Shops should be banned from using facial recognition to identify customers.',
    format: 'pf',
    clash: 'Whether shop security justifies scanning the face of every customer who walks in.',
    pro: 'Facial recognition records everyone to catch a few; false matches fall hardest on people the systems recognise least accurately.',
    con: 'Retail theft is rising and staff face violence; the technology lets shops stop known offenders without more guards.',
    ballot: 'Weigh frequency against severity: millions of private scans set against the theft and the staff safety the Con side quantifies.',
  },
  {
    motionId: 'pol-016',
    house: 'This House believes that politicians should vote according to their conscience rather than what their voters want',
    resolved: 'Resolved: Politicians ought to vote according to their conscience rather than what their voters want.',
    format: 'ld',
    clash: 'Whether a representative is a trustee of good judgment or a delegate of the voters\' will.',
    pro: 'Voters elect people to think, not to poll; conscience protects minorities from a majority\'s passing anger.',
    con: 'Democracy means people govern themselves; a politician who overrides voters substitutes one person\'s values for theirs.',
    ballot: 'This is a classic value clash: legitimacy against good outcomes. Whichever framework survives cross-examination usually takes the ballot.',
  },
  {
    motionId: 'econ-016',
    house: 'This House would give every citizen a lump sum of money on their 18th birthday',
    resolved: 'Resolved: Every citizen should receive a lump sum of money on their 18th birthday.',
    format: 'school',
    clash: 'Whether a lump sum at eighteen opens doors or gets spent in a month.',
    pro: 'Wealth gaps begin at the start line; a sum for training, a deposit or a business gives every young adult a real first choice.',
    con: 'Unrestricted cash at eighteen is easily wasted or captured by family debts; the same money spent on services helps more people.',
    ballot: 'R1 and R2 should fight over what eighteen-year-olds actually do with the money; the conclusor that wins that picture wins the round.',
  },
  {
    motionId: 'health-010',
    house: 'This House would ban advertising of junk food anywhere children are likely to see it',
    resolved: 'Resolved: Junk food advertising should be banned anywhere children are likely to see it.',
    format: 'pf',
    clash: 'Whether advertising shapes what children eat, or only which brand they choose.',
    pro: 'Children cannot see that an advert is selling to them, and advertising drives the pestering that shapes family shopping.',
    con: 'Diet is set by price, habit and family income; ad bans have had small measured effects while hitting broadcasters and sports sponsorship.',
    ballot: 'The evidence quality on effect size decides this; summary speakers should pick one study and defend it rather than list five.',
  },
  {
    motionId: 'eth-016',
    house: 'This House believes that a good intention can excuse a bad outcome',
    resolved: 'Resolved: A good intention can excuse a bad outcome.',
    format: 'ld',
    clash: 'Whether we judge actions by what people meant or by what they caused.',
    pro: 'People control their intentions, not every outcome; blaming the well-meaning for bad luck makes morality a lottery.',
    con: 'Victims live with outcomes, not intentions; letting good intentions excuse harm removes the reason to be careful.',
    ballot: 'Watch the word "excuse". If the Affirmative shows intent can reduce blame, not erase it, the motion may be easier than it looks.',
  },
  {
    motionId: 'edu-015',
    house: 'This House would pay students a small weekly sum for full attendance',
    resolved: 'Resolved: Schools should pay students a small weekly sum for full attendance.',
    format: 'school',
    clash: 'Whether paying for attendance builds a habit or replaces a reason to learn with a reason to show up.',
    pro: 'Students who miss school fall behind for life; a small payment can tip the decision for the students most at risk of dropping out.',
    con: 'Paying for attendance tells students that learning is a job, and payments stop working once they stop.',
    ballot: 'Long-term against short-term: conclusors should say which matters more and why their side wins the comparison.',
  },
  {
    motionId: 'just-002',
    house: 'This House would require police officers to wear body cameras at all times on duty',
    resolved: 'Resolved: Police officers should wear body cameras at all times on duty.',
    format: 'pf',
    clash: 'Whether constant recording builds trust between police and the public or erodes privacy for everyone they meet.',
    pro: 'Cameras give an objective record that protects both citizens and honest officers, and complaints fall when everyone knows they are filmed.',
    con: 'Always-on cameras record victims, witnesses and people in their homes, and footage policies decide who actually sees the evidence.',
    ballot: 'The key word is "at all times". Con can win on privacy in specific settings even if cameras are good in general.',
  },
  {
    motionId: 'intl-011',
    house: 'This House believes that foreign aid should come with conditions on how it is spent',
    resolved: 'Resolved: Foreign aid ought to come with conditions on how it is spent.',
    format: 'ld',
    clash: 'Whether donors have the right to direct how aid is spent, or recipients have the right to decide for themselves.',
    pro: 'Donors answer to the taxpayers who funded the aid; conditions make sure it reaches people rather than corrupt elites.',
    con: 'Conditions let rich countries impose policies on poorer ones; respecting self-government means trusting recipients with their own choices.',
    ballot: 'Accountability against autonomy. The Negative should press on who sets the conditions and whose interests they serve.',
  },
  {
    motionId: 'edu-013',
    house: 'This House, as a selective university, would admit students by lottery from among all qualified applicants',
    resolved: 'Resolved: Selective universities should admit students by lottery from among all qualified applicants.',
    format: 'school',
    clash: 'Whether a lottery is fairer than a selection process that rewards advantages wealthy families can buy.',
    pro: 'Above a qualifying bar, selection measures privilege more than talent; a lottery is honest about chance and widens access.',
    con: 'A lottery ignores real differences in effort and achievement and tells students that working harder past the bar is pointless.',
    ballot: 'Conclusors must say what fairness means here; the side whose definition the judge adopts usually wins the weighing.',
  },
];

export interface DailyMotion extends ScheduledDay {
  /** Day number, from 1. */
  number: number;
  /** The day it is the Daily Motion, as YYYY-MM-DD (UTC). */
  date: string;
  /** The wording for this day's format: "Resolved: …" for PF and LD, "This House …" for School 4-6-6-3. */
  wording: string;
}

const DAY_MS = 86_400_000;
const EPOCH_MS = Date.parse(`${DAILY_MOTION_EPOCH}T00:00:00Z`);

let clock = () => new Date();

/** The prerender sets the day it builds for (DAILY_MOTION_TODAY); everything else reads the real clock. */
export function setDailyMotionClock(now: () => Date) {
  clock = now;
}

/** The day number for a date, by its UTC calendar day. Day 1 is the epoch; earlier dates give 0 or less. */
export function dayNumberOn(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - EPOCH_MS) / DAY_MS) + 1;
}

/** Today's number, capped at the last scheduled day so a schedule that runs out repeats nothing. */
export function latestDayNumber(): number {
  return Math.min(Math.max(dayNumberOn(clock()), 1), SCHEDULE.length);
}

export function dateOfDay(number: number): string {
  return new Date(EPOCH_MS + (number - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** A day that has arrived and is scheduled, or undefined. Future days stay hidden until their date. */
export function dailyMotion(number: number): DailyMotion | undefined {
  if (!Number.isInteger(number) || number < 1 || number > latestDayNumber()) return undefined;
  const day = SCHEDULE[number - 1];
  return { ...day, number, date: dateOfDay(number), wording: day.format === 'school' ? day.house : day.resolved };
}

/** Every day up to today, newest first. */
export function pastDailyMotions(): DailyMotion[] {
  return Array.from({ length: latestDayNumber() }, (_, index) => dailyMotion(latestDayNumber() - index)!);
}

export const FORMAT_NAMES: Record<DailyMotionFormat, string> = { pf: 'Public Forum', ld: 'Lincoln-Douglas', school: 'School 4-6-6-3' };

/** The Sparring format that runs each day's format against the AI opponent. */
export const SPARRING_FORMATS: Record<DailyMotionFormat, SparringFormat> = { pf: 'pf', ld: 'ld', school: 'standard' };

/** What each format's ballot rewards, in the words a debater needs before the round. */
export const BALLOT_GUIDE: Record<DailyMotionFormat, string> = {
  pf: 'Public Forum judges are often lay or parent judges. They vote on the arguments that reach final focus: anything not carried through summary is usually treated as dropped. Weigh in every speech from rebuttal on (magnitude, probability, timeframe) and tell the judge in plain words why your impact matters more.',
  ld: 'Lincoln-Douglas is a values debate. Each side sets a value and a criterion for measuring it, and the judge first decides whose framework is better, then who best meets it. A strong 2AR or NR explains why its framework wins and how its arguments satisfy it, rather than repeating every point.',
  school: 'In the School 4-6-6-3 format the introductors set out each side\'s case, R1 and R2 attack and rebuild, and the conclusors bring no new arguments: they give two or three reasons their side won. Judges reward clear clash and a conclusor who weighs, not one who summarises.',
};
