// Invented content for the staging seed (scripts/staging/seed.mjs). Every
// person, publication, figure and URL here is made up. Row ids are fixed so a
// rerun updates rows instead of adding copies. Output shapes follow what the
// client saves and renders: GenerateOutput, AttackOutput, BrainstormOutput
// (src/lib/ai/schemas/) and FactoidsOutput (src/lib/ai/schemas/factoids.ts).

const id = (n) => `5eed0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const contention = (n, claim, reasoning, evidence, impact) => ({
  id: String(n), claim, reasoning, evidence, needsSource: false, impact,
});

const idea = (n, side, title, description, strength = "strong") => ({
  id: `i${n}`, title, description, side, strength, tradeoffs: [], relatedTo: [],
});

const factoid = (n, shortClaim, keyFigure, context, publisher, url, relevanceScore) => ({
  id: `f${n}`,
  shortClaim,
  keyFigure,
  context,
  limitations: "Single fictional study; treat as illustrative.",
  citation: { title: shortClaim, publisher, date: "2026-03-14", url, verified: "verified" },
  howToUse: "Use it as the impact link in your second contention.",
  relevanceScore,
});

const source = (n, title, publication, url, paragraphs) => ({
  id: id(n),
  title,
  type: "url",
  origin: url,
  folder: "General",
  is_active: true,
  metadata: { url, sourceType: "news", qualityLabel: "moderate", capturedVia: "staging-seed" },
  content: [`${title}\n${publication}`, ...paragraphs].join("\n\n"),
});

export const DEBATES = [
  {
    id: id(1),
    motion: "This House would ban private cars from city centres",
    settings: { format: "bp", role: "r1" },
    instructions: "Opening Government. Keep the case on public health and street space; avoid the climate framing, the judges have heard it all season.",
    sources: [
      source(101, "Car-free cores: what three mid-sized cities learned", "The Northfield Ledger (fictional)", "https://example.com/northfield/car-free-cores", [
        "When the fictional city of Ardmoor closed its historic core to private cars in 2021, shop owners predicted ruin. Three years on, the city's own footfall counters show weekday visits up 18 percent, with the strongest growth in cafes and small grocers.",
        "The picture is not uniformly positive. Deliveries now cluster in a two-hour morning window, and disability advocates say the shuttle service that replaced door-to-door access runs too rarely after 7 pm.",
        "Planners in Ardmoor and its neighbours agree on one lesson: the ban worked where frequent buses and protected cycle lanes arrived before the closure, not after it.",
      ]),
      source(102, "Air quality after the Ardmoor closure", "Institute for Urban Health Studies (fictional)", "https://example.org/iuhs/ardmoor-air", [
        "Nitrogen dioxide readings at four central monitoring stations fell by an average of 31 percent in the first year after private cars were excluded, against 6 percent at comparable stations outside the zone.",
        "Hospital admissions for childhood asthma in the central postcode area fell from 112 to 87 over the same period. The authors caution that the sample is small and that admissions were already trending down.",
      ]),
      source(103, "The hidden cost of car-free zones", "Metro Business Review (fictional)", "https://example.com/mbr/hidden-cost", [
        "Retail landlords on the edge of car-free districts report vacancy rates two to three points higher than before the policy, as larger stores relocate to out-of-town parks with free parking.",
        "Tradespeople are the loudest critics. A plumber carrying 40 kilograms of tools cannot take the tram, and permit schemes for commercial vans have become a paperwork burden.",
      ]),
    ],
    results: {
      cases: [{
        id: id(201),
        title: "Car-free centres: OG case",
        side: "pro",
        output: {
          caseStructure: {
            thesis: "City centres belong to the people who use them on foot, and private cars are the single largest obstacle to that.",
            framework: "Weigh public health and equal access to shared space against the convenience of a minority of drivers.",
            keyDefinitions: ["City centre: the historic commercial core, roughly the area inside the inner ring road.", "Private car: privately owned passenger vehicles; buses, taxis, emergency and delivery vehicles are exempt."],
            burdenOfProof: "Show that the health and access gains outweigh the cost to drivers and businesses, with a workable transition.",
          },
          contentions: [
            contention(1, "Removing cars cuts air pollution where the most people breathe it.", "Central streets concentrate both traffic and pedestrians, so exposure falls fastest there.", "Ardmoor's central stations recorded a 31 percent drop in nitrogen dioxide in year one (Institute for Urban Health Studies, fictional).", "Fewer childhood asthma admissions and better long-term lung health."),
            contention(2, "Street space is a public good that cars monopolise.", "A parked car occupies roughly 12 square metres for most of the day while moving almost nobody.", "Ardmoor turned 40 percent of its former parking into seating, cycle lanes and market space.", "Space is redistributed to the majority who arrive on foot, by bike or by bus."),
            contention(3, "Car-free cores revive local commerce.", "Pedestrians linger and make more frequent small purchases than drivers.", "Weekday footfall in Ardmoor rose 18 percent after the closure.", "Small businesses gain at the expense of out-of-town retail parks."),
          ],
          predictedOpponentCase: {
            likelyArguments: ["Disabled and elderly residents lose door-to-door access.", "Tradespeople and businesses face higher costs.", "Displacement just moves congestion to the ring road."],
            strategicWeaknesses: ["Opposition must defend the status quo of pollution in the densest areas.", "Access concerns are answerable with exemptions and shuttles."],
            keyClashes: ["Who bears the cost of the transition.", "Whether exemptions make the ban unworkable."],
          },
          counters: [{
            targetArgument: "Accessibility",
            counterpoint: "Blue-badge holders, taxis and on-demand shuttles are exempt in our model.",
            rebuttal: "Today's car-dominated streets are already hostile to wheelchair users; wider pavements help them most.",
          }],
          metadata: { side: "pro", format: "bp", generatedAt: "2026-09-02T09:14:00.000Z" },
        },
      }],
      attacks: [{
        id: id(211),
        title: "Stress test: the commerce contention",
        side: "pro",
        output: {
          overallAssessment: {
            score: 64,
            summary: "The health line is solid, but the commerce contention leans on one city and invites an easy counterexample.",
            strengthAreas: ["Clear framework", "Concrete pollution evidence"],
          },
          weaknesses: [{
            id: "w1",
            severity: "major",
            type: "evidential",
            description: "Footfall is not the same as spending.",
            whyWeak: "Opposition can grant more visitors and still argue that revenue moved to retail parks.",
            howOpponentAttacks: "Cite the vacancy rates on the zone's edge from Metro Business Review.",
            improvedVersion: "Pair footfall with turnover data for independent shops, and concede that large-format retail moves out.",
          }, {
            id: "w2",
            severity: "minor",
            type: "logical",
            description: "The space argument assumes freed space is used well.",
            whyWeak: "Empty plazas are a common failure mode.",
            howOpponentAttacks: "Ask what happens to the space in winter.",
            improvedVersion: "Commit to a mechanism: market licences and seating funded from the old parking revenue.",
          }],
          fallaciesDetected: [{ name: "Hasty generalisation", location: "Contention 3", explanation: "One fictional city's footfall is extended to every city centre." }],
          crossExQuestions: [{ question: "Where does the plumber park?", purpose: "Expose the commercial access gap.", expectedTrap: "A promise of permits without a cap on the paperwork." }],
          weighingAnalysis: {
            currentWeighing: "Health is asserted to outweigh business cost without comparing magnitudes.",
            missingComparisons: ["Hospital costs avoided versus revenue lost."],
            improvementSuggestions: ["Weigh on reversibility: lost health is permanent, lost trade can return."],
          },
        },
      }],
      factoids: [{
        id: id(221),
        title: "Evidence: pollution and footfall",
        side: "pro",
        output: {
          factoids: [
            factoid(1, "Central NO2 fell sharply after the Ardmoor closure", "31% drop in year one", "Average across four central monitoring stations, against 6% outside the zone.", "Institute for Urban Health Studies (fictional)", "https://example.org/iuhs/ardmoor-air", 92),
            factoid(2, "Weekday footfall rose in the car-free core", "+18% weekday visits", "City footfall counters, three years after the closure.", "The Northfield Ledger (fictional)", "https://example.com/northfield/car-free-cores", 81),
          ],
          searchSuggestions: ["turnover of independent shops in car-free zones"],
          warnings: [],
          verificationStatus: "complete",
        },
      }],
      brainstorms: [],
    },
    chats: [],
  },
  {
    id: id(2),
    motion: "This House believes that social media companies should be legally liable for misinformation on their platforms",
    settings: { format: "policy", role: "general" },
    instructions: "We are Opposition. The judge is a law student, so expect questions on mechanism and free expression.",
    sources: [
      source(111, "Liability regimes compared", "Comparative Media Law Quarterly (fictional)", "https://example.org/cmlq/liability-regimes", [
        "Of the twelve fictional jurisdictions surveyed, the four that introduced platform liability for false content saw takedown volumes rise fivefold within a year. Independent audits found that roughly a third of removed posts were lawful opinion or satire.",
        "Smaller platforms responded differently from large ones: two exited the regulated markets entirely, citing compliance costs equal to a quarter of their revenue.",
      ]),
      source(112, "Who decides what is false?", "The Civic Review (fictional)", "https://example.com/civic-review/who-decides", [
        "Fact-checking bodies disagree with each other more often than the public assumes. In a fictional panel study, three established fact-checkers reached the same verdict on only 61 percent of contested health claims.",
        "When liability attaches to the platform, the cheapest compliance strategy is to remove anything contested, the author argues.",
      ]),
    ],
    results: {
      cases: [{
        id: id(231),
        title: "Opposition case: liability chills speech",
        side: "con",
        output: {
          caseStructure: {
            thesis: "Making platforms liable for misinformation hands private companies a legal incentive to silence anything contested.",
            framework: "Protect the conditions for open public debate; weigh harms by who decides what counts as false.",
            keyDefinitions: ["Legally liable: exposed to civil damages or regulatory fines for user-posted false content."],
            burdenOfProof: "Show that liability causes more harm to legitimate speech than it prevents in misinformation.",
          },
          contentions: [
            contention(1, "Liability drives over-removal.", "Platforms face fines for leaving content up but nothing for taking it down.", "Takedowns rose fivefold under liability regimes, with a third of removals lawful (Comparative Media Law Quarterly, fictional).", "Lawful dissent, satire and minority views disappear first."),
            contention(2, "Truth is contested, and liability freezes one answer.", "Today's misinformation is sometimes tomorrow's consensus.", "Fact-checkers agreed on only 61 percent of contested health claims (The Civic Review, fictional).", "Science and politics lose the ability to correct themselves in public."),
          ],
          predictedOpponentCase: {
            likelyArguments: ["Misinformation causes real deaths, for example vaccine hesitancy.", "Platforms profit from engagement with false content."],
            strategicWeaknesses: ["Government must define misinformation precisely enough to litigate."],
            keyClashes: ["Over-removal versus under-removal.", "Who holds the definitional power."],
          },
          counters: [{
            targetArgument: "Platforms profit from falsehood",
            counterpoint: "Fix the incentive directly with transparency and algorithmic audits.",
            rebuttal: "Liability punishes the speech, not the amplification model.",
          }],
          metadata: { side: "con", format: "policy", generatedAt: "2026-09-08T16:40:00.000Z" },
        },
      }],
      brainstorms: [{
        id: id(241),
        title: "Brainstorm: platform liability",
        side: "both",
        output: {
          needsMoreInfo: false,
          topFive: [
            { rank: 1, idea: idea(1, "con", "Collateral censorship", "Intermediaries remove more than the law requires because the costs of error are one-sided."), whyTop: "It is the core mechanism and hard for Government to deny." },
            { rank: 2, idea: idea(2, "pro", "Engagement profits from falsehood", "Ranking systems reward outrage, and outrage correlates with falsehood."), whyTop: "Government's strongest moral claim; prep a response." },
            { rank: 3, idea: idea(3, "con", "Market exit of small platforms", "Compliance costs entrench the largest incumbents."), whyTop: "Turns Government's anti-big-tech instinct against them." },
            { rank: 4, idea: idea(4, "pro", "Notice-and-action is already normal", "Copyright law already makes platforms act on notice.", "moderate"), whyTop: "Government's precedent argument." },
            { rank: 5, idea: idea(5, "con", "Definitional capture", "Whoever writes the definition of misinformation gains a censorship tool.", "moderate"), whyTop: "Strong in front of a law-trained judge." },
          ],
          nextSteps: ["Find a comparative study on over-removal.", "Prepare an answer to the copyright precedent."],
          warningsAndTradeoffs: ["Don't defend misinformation itself; attack the mechanism."],
        },
      }],
      attacks: [],
      factoids: [],
    },
    chats: [{
      id: id(251),
      title: "How to answer the vaccine example",
      side: "con",
      messages: [
        { id: id(252), role: "user", content: "Government will open with vaccine misinformation causing deaths. How do we answer without sounding callous?" },
        { id: id(253), role: "assistant", content: "Grant the harm early and move the clash to mechanism. Say: 'We agree vaccine falsehoods kill. The question is whether fining platforms reduces them or just removes everything near the topic, including doctors raising legitimate side-effect questions.' Then use the over-removal figure from your first contention." },
        { id: id(254), role: "user", content: "And if they say transparency rules are too weak?" },
        { id: id(255), role: "assistant", content: "Ask what evidence shows liability outperforms transparency. Their burden is comparative: they need liability to beat the best alternative, not the status quo." },
      ],
    }],
  },
  {
    id: id(3),
    motion: "This House believes that standardised testing does more harm than good",
    settings: { format: "classroom", role: "general" },
    instructions: "Practice debate for the Year 10 club. Keep language accessible.",
    sources: [
      source(121, "Teaching to the test: a five-year classroom study", "Journal of School Practice (fictional)", "https://example.org/jsp/teaching-to-the-test", [
        "Across 48 fictional secondary schools, teachers in high-stakes testing years spent an average of 11 weeks per year on direct exam preparation, compared with 4 weeks in years without national tests.",
        "Pupils' scores on the national test rose, but their performance on an unseen problem-solving task did not change.",
      ]),
      source(122, "Tests as a safeguard for disadvantaged pupils", "Education Equity Forum (fictional)", "https://example.com/eef/tests-as-safeguard", [
        "Where schools dropped standardised tests in favour of teacher assessment, the attainment gap between pupils on free school meals and their peers appeared to narrow, but blind re-marking showed teacher grades favoured pupils whose behaviour was rated as good.",
        "Without a common yardstick, the author argues, under-performing schools serving poorer areas are harder to identify and support.",
      ]),
    ],
    results: {
      brainstorms: [{
        id: id(261),
        title: "Brainstorm: standardised testing",
        side: "pro",
        output: {
          needsMoreInfo: false,
          topFive: [
            { rank: 1, idea: idea(11, "pro", "Teaching to the test narrows learning", "Weeks of exam drill crowd out curiosity and problem solving."), whyTop: "Concrete, relatable to the Year 10 audience." },
            { rank: 2, idea: idea(12, "pro", "Test anxiety harms wellbeing", "High stakes create stress that falls hardest on younger pupils.", "moderate"), whyTop: "Emotional weight for a classroom judge." },
            { rank: 3, idea: idea(13, "con", "Tests protect disadvantaged pupils", "A common yardstick exposes schools that fail poorer pupils."), whyTop: "The strongest opposition line; prepare for it." },
            { rank: 4, idea: idea(14, "pro", "Scores measure the school's catchment, not its teaching", "Results track family income more than teaching quality.", "moderate"), whyTop: "Undermines the accountability argument." },
            { rank: 5, idea: idea(15, "con", "Teacher assessment is biased", "Unblinded grades reflect behaviour and background.", "moderate"), whyTop: "Opposition's answer to idea 4." },
          ],
          nextSteps: ["Find wellbeing data for exam years."],
          warningsAndTradeoffs: ["Don't claim tests have no value; argue the harms outweigh it."],
        },
      }],
      factoids: [{
        id: id(271),
        title: "Evidence: exam preparation time",
        side: "pro",
        output: {
          factoids: [
            factoid(3, "Exam years consume far more prep time", "11 weeks vs 4 weeks", "Average direct exam preparation per year across 48 schools.", "Journal of School Practice (fictional)", "https://example.org/jsp/teaching-to-the-test", 88),
          ],
          searchSuggestions: ["pupil wellbeing surveys in national test years"],
          warnings: ["Opposition will cite the teacher-assessment bias finding."],
          verificationStatus: "complete",
        },
      }],
      cases: [],
      attacks: [],
    },
    chats: [],
  },
];
