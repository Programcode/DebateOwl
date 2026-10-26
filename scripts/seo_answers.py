"""The question and short answer under each guide's H1.

The question is the reader's main question in plain English; it is the page's
first H2. The answer is at most 100 words, answers the question in its first
sentence and says plainly when something else fits better. Use only facts the
page itself states, and date any price or competitor fact with "As of".
Name the product with {product} and the Pro price with {pro_price}.
"""

ANSWERS = {
    "best-ai-debate-tools": (
        "Which AI debate tool should you use?",
        "It depends on the job. For brainstorming or learning a topic, a general chatbot such as ChatGPT is flexible. For motion-by-motion prep plus timed practice rounds that end in a verdict, a dedicated platform such as {product} fits. As of October 2026, debatelab.ai, a separate product, says it is free and runs World Schools and Asian Parliamentary practice, and WinDebate adds round replay and progress tracking from $19.99/month. Give each tool the same motion and tasks before you decide.",
    ),
    "debatelab-pricing": (
        "How much does {product} cost?",
        "As of October 2026, {product} has a 3-day free trial with no credit card required, then Pro costs {pro_price}. There is no permanent free plan. Whether Pro is worth it depends on how often you prepare: if you debate every week or have a tournament coming, it covers heavy prep weeks with higher daily limits and all 10 models. If you need help only occasionally and want to stay free, a general chatbot's free tier or a free practice tool will suit you better.",
    ),
    "debatelab-vs-chatgpt": (
        "Which is better for debate prep, {product} or ChatGPT?",
        "It depends on the task. ChatGPT is better for learning a new topic, open brainstorming and general writing help, and it works for any subject. {product} is better when you are preparing a specific motion: it keeps your cases, sources and practice rounds together, predicts the opposing case, times your speeches and gives a verdict on practice rounds. Many debaters use both, ChatGPT for background and {product} for motion prep and practice. Neither replaces checking original sources.",
    ),
    "debatelab-vs-windebate": (
        "Which is better, {product} or WinDebate?",
        "It depends on your format, budget and how you practise. As of October 2026, WinDebate names six formats including Congressional, Policy and British Parliamentary, has a free tier with monthly limits, and adds live-round capture, replay review and progress tracking, with paid plans from $19.99/month. {product} costs {pro_price} after a 3-day trial, runs full practice rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas and Public Forum, and works in English, Spanish and Hungarian. Choose WinDebate for Policy, Congress or season tracking, and {product} for low-cost case building and sparring.",
    ),
    "debatelab-vs-debateclub": (
        "Which is better, {product} or DebateClub?",
        "They solve different problems. As of October 2026, DebateClub is voice-only sparring for high-stakes conversations such as negotiations, pitches and meetings, with opponent personas and rhetorical technique scoring, and Pro costs $19/month. It names no competitive debate formats. {product} is built for school and competitive debate: cases, rebuttals, evidence, a timer and timed rounds in School 4-6-6-3, Lincoln-Douglas and Public Forum, at {pro_price} after a 3-day trial. Choose DebateClub for workplace persuasion practice and {product} for tournament prep.",
    ),
    "ai-debate-practice": (
        "Can practising debate against an AI actually make you better?",
        "Yes, if it shortens the loop of giving a speech, finding what failed, fixing one thing and giving it again. A useful session needs a motion, a side, real speech times, an opponent that responds to what you said and a verdict that names why you won or lost. {product}'s Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds this way. AI practice adds repetitions between team practices but does not replace them: judge adaptation, delivery under pressure and strategic judgement still develop fastest with a coach and real rounds.",
    ),
    "ai-debate-case-generator": (
        "Can an AI debate case generator write a case I can actually use?",
        "It can write a usable draft, not a finished case. A good generator gives you a thesis, a framework, contentions with warrants and impacts, the case the other side is likely to run, and counters to it. Treat its citations as research leads: open every source, confirm the exact claim and record the full citation. The judgement calls, such as which contention to cut and where to pre-empt the opposition, stay with you. Rewrite the case in your own words, because judges can hear when you are reading a draft for the first time.",
    ),
    "debate-rebuttal-practice": (
        "How do you find the weak link in an argument you need to rebut?",
        "Start with the warrant, because a claim without a warrant gives the judge nothing to weigh, so the reason behind a claim is usually the link to attack. Then choose your move: deny the claim, attack the warrant, mitigate the impact, turn it or outweigh it. Write each answer as a short block with a tag line, the response and why it matters, and deliver it in under forty-five seconds. An AI analysis can point out missing warrants and overclaimed impacts, but in round you still adapt each block to what the opponent actually said.",
    ),
    "ai-debate-coach": (
        "Can an AI debate coach actually help you prepare?",
        "Yes, as a partner for thinking problems through: burdens, clash, weighing, speech structure and why a practice speech did not land. It works best with specific questions that name the format, your side and speaker role, what is already on the table and what you are stuck on. Vague questions get generic answers. Treat any sources it cites as leads to check. An AI coach has not watched you speak and does not know your judges or your partner, so take its conclusions to your human coach or team and let them correct what does not fit.",
    ),
    "debate-evidence-finder": (
        "Can AI find reliable evidence for a debate case?",
        "AI can find leads, not reliable evidence on its own. It is good at suggesting where to look and which searches to run, but a summary can lose a qualification, mix up two studies or point to a page that says something different. Open every original, check the author, date, publication, method and the text around the quote, and record the full citation. If the evidence is weak, do not read it. Narrow your claim or make the argument analytically, because a clear warrant often beats a card that falls apart under one question.",
    ),
    "argument-flowchart": (
        "When is an argument flowchart useful for debate prep?",
        "It is useful before and after a round, not during one. A flowchart maps your thesis, your arguments, the attacks on them and your rebuttals, so you can see which link breaks a chain and where two contentions rely on the same assumption. Build it from the motion outward, add the strongest attack to each contention, and note the weighing at each clash. During the round itself, a written flow on paper or a laptop is faster than any canvas, so keep your in-round notes there and use the map to plan and review.",
    ),
    "online-debate-timer": (
        "How long are debate speeches in each format?",
        "It depends on the format. Public Forum has 4-minute constructives and rebuttals, 3-minute summaries and 2-minute final focus speeches. Lincoln-Douglas runs 6, 7, 4, 6 and 3 minutes. Policy uses 8-minute constructives and 5-minute rebuttals. British Parliamentary speeches are 7 minutes, and World Schools speeches are 8, followed by 4-minute replies. Cross-examination usually takes 3 minutes, and prep time varies by league, so check your tournament's rules. The free {product} debate timer loads each of these speech orders for you.",
    ),
    "how-to-write-a-debate-case": (
        "How do you write a debate case?",
        "Start with the motion, not the arguments. Read it word by word, define the key terms fairly and write your burden in one sentence. Brainstorm widely, then keep two to four contentions, each built as claim, warrant, evidence, impact and weighing. Add a framework telling the judge how to decide, pre-empt the obvious response inside each contention, and read the case aloud against a timer until it fits. The format changes the details: Public Forum constructives usually fit two contentions, Lincoln-Douglas cases centre on a value and criterion, and BP closing teams prepare an extension instead.",
    ),
    "how-to-practice-rebuttals": (
        "What is the best way to practise debate rebuttals?",
        "Use short, frequent drills that copy the pressure of a round: arguments you did not write, a clock, and feedback on one thing. Three or four sessions of 20 to 30 minutes a week, each training one skill, beat one long session. New debaters should start with selection, picking the argument that decides the round, then move on to warrant attacks, grouping and weighing under time. Shadow rebuttals and flipping your own case work alone, while one-sentence answers and rapid fire need a partner. Score each speech on the same five questions to track progress.",
    ),
    "public-forum-debate": (
        "How do you prepare for a Public Forum debate round?",
        "Write cases for both sides, because you often learn your side shortly before the round. A constructive is four minutes, so plan two contentions with warrants and evidence. Decide in advance which one or two issues you would collapse to, since anything you want in final focus has to be in summary first. Treat crossfire as questioning that sets up your next speech. How you present depends on the judge: for lay judges, run fewer arguments, signpost clearly and speak at a normal pace. Under common rules, speeches run 4-4-3-2 minutes with three 3-minute crossfires.",
    ),
    "lincoln-douglas-debate": (
        "How do you build a Lincoln-Douglas debate case?",
        "Choose a value the resolution should be judged by and a criterion narrow enough to tell the judge which impacts count. Then write two or three contentions that each prove your side meets that criterion, and expect the negative to accept your framework and argue you fail it. Under NSDA rules the affirmative constructive is six minutes and the negative's is seven, which fits one framework and two or three contentions. Prepare cross-examination questions that pin down the opponent's framework, and blocks for the arguments you expect most.",
    ),
    "policy-debate": (
        "What do you need to prepare for policy debate?",
        "Prepare an affirmative plan with advantages you can defend under cross-examination, and a negative strategy that does not depend on one argument. Most negatives pair a counterplan with a net-benefit disadvantage, so research both and the permutation answers to them. Write frontlines for the off-case positions you expect, and check topicality against your own plan text. NSDA rounds run eight-minute constructives, three-minute cross-examinations and five-minute rebuttals, with eight minutes of prep per team.",
    ),
    "british-parliamentary-debate": (
        "How do you prepare for British Parliamentary debate?",
        "Practise all four positions, because you learn yours only with the draw. Opening teams need a clear model and two strong arguments. Closing teams need an extension that their opening half did not run, so prepare several candidates and choose during the debate. Every speech is seven minutes, preparation is fifteen minutes after the motion with no internet, and points of information run between the first and sixth minute. Judges rank all four teams, so weigh against the team on your own bench as well as the other side.",
    ),
    "congress-debate": (
        "How do you prepare for Congressional debate?",
        "Read every bill on the docket and prepare short arguments on both sides of each, so you can speak whenever the presiding officer calls you. Speeches are up to three minutes, so plan one or two points that answer a named earlier speaker and add something new. Prepare questions as well, since scorers count how you ask and answer them. Toward the end of a bill's debate, a crystallization speech that explains who won the key clashes is often the strongest speech in the cycle.",
    ),
    "world-schools-debate": (
        "How does World Schools debate work, and how should a team prepare?",
        "Two teams of three speakers each give eight-minute substantive speeches, then each team gives a four-minute reply, opposition first, delivered by its first or second speaker. Prepare by interpreting the motion: define terms, give a model for policy motions, name the stakeholders and write each side's burden. Practise every role, because first, second, third and reply speakers owe the team different things. Motions are prepared or impromptu, so also practise preparing within an hour. Offer short Points of Information aimed at a warrant, and as a general rule accept at least two.",
    ),
    "how-to-weigh-in-debate": (
        "How do you weigh arguments in a debate?",
        "Compare your impact with your opponent's on a named measure and say why that measure matters. The six common measures are magnitude, probability, timeframe, reversibility, scope and link strength. Which one is strongest depends on the round, but probability and link strength often persuade more than magnitude, because every team claims its impact is huge. When their impact wins on one measure and yours on another, explain why your measure should count more here. Start weighing in your first speech and build on it in rebuttal, rather than saving it for the end.",
    ),
    "how-to-cross-examine-in-debate": (
        "How do you cross-examine well in a debate?",
        "Ask short, closed questions that get commitments you can use in your next speech, rather than open questions that let the speaker repeat their case. A good line commits the speaker to something, narrows it, then stops before they can explain it away. A three-minute period fits two or three lines, so pick the ones that attack the warrant the round depends on. Repeat any concession in your speech and weigh it, because judges decide on what the next speech does with cross-ex. In World Schools and British Parliamentary, Points of Information do this job instead.",
    ),
    "how-to-prepare-for-a-debate-tournament": (
        "How do you prepare for a debate tournament?",
        "Start with topic analysis when the topic is released: identify the key clashes, research both sides and build case templates. Then write block files, which are pre-written responses to the arguments you expect to face. On tournament day, bring extra pens, backup evidence, water, snacks, a timer and a plan for each round. Mental stamina matters as much as preparation.",
    ),
    "how-to-flow-in-debate": (
        "How do you flow a debate round?",
        "Take notes in columns, one per speech in speaking order, with a separate sheet or section for each side's case. Write each argument's tag in a few words with the warrant underneath, use two colours, and leave space. A short, consistent set of abbreviations lets you keep up. Mark any argument with nothing next to it in the next column as dropped, since most formats treat it as conceded. Paper and a laptop both work. In British Parliamentary and World Schools, many debaters flow by clash instead of strictly by speech.",
    ),
    "ai-rebuttal-generator": (
        "Is an AI rebuttal generator worth using for debate prep?",
        "It is worth it for preparation when the output is structured for a round: the exact words being attacked, the broken link, a response you can say, a cross-ex question and the missing weighing. A general chatbot tends to write a counter-essay instead, which is rarely usable. Run it on opposing cases and on your own case. It cannot hear how your opponent framed an argument or know what a judge will find persuasive, and most leagues restrict AI during rounds. Rewrite responses in your own words and check any evidence it cites.",
    ),
    "debate-topics-for-students": (
        "What are good debate topics for students?",
        "It depends on level. Beginners do best with topics from daily life, such as banning homework in primary schools, optional school uniforms or a four-day school week, so they can focus on structure instead of research. Intermediate debaters can take on lowering the voting age to 16 or taxing sugary drinks. Advanced teams can handle universal basic income or autonomous weapons. At any level, a good practice topic is balanced, has real clash and stakes, and is accessible without specialist knowledge. Competitive leagues set their own topics.",
    ),
    "debate-clash-points": (
        "How do you find the key clash in a debate?",
        "Ask which disagreement, if resolved in your favor, wins you the round. A clash is any point where the two sides disagree, but the key clash is the one the judge must resolve to decide the round, so focus your prep there. In your speeches, tell the judge why this clash matters and why your side wins it. If you frame the clash, you frame the ballot.",
    ),
    "debate-fallacies": (
        "How do you attack a logical fallacy in a debate?",
        "Do not just name the fallacy. Explain why the logic fails, why the conclusion does not follow, and what the judge should do about it. Pointing out a fallacy and explaining why the argument fails can win you the clash. The most common fallacies in debate are ad hominem, straw man, false dichotomy, slippery slope, hasty generalization, appeal to authority and circular reasoning.",
    ),
    "debate-prep-time-management": (
        "How should you spend your prep time in debate?",
        "Spend it on the clashes that decide the round, not on reading every card. One split is to give the first third to case structure, the second third to rebuttal blocks and the last third to speech organization and weighing. Before a round, organize your evidence, confirm your arguments and practice the opening. During prep time, prioritize blocks over new research.",
    ),
    "debate-judge-adaptation": (
        "How do you adapt your debating to different types of judges?",
        "It depends on the judge. Lay judges want clear stories, so slow down. Flow judges want structured clash. Tech judges want speed and evidence, so you can speed up. Whatever the judge type, explain your weighing clearly and give the judge a reason to vote for you that fits their style. The aim is to make the judge's job easy.",
    ),
    "ai-vs-traditional-debate-prep": (
        "Is AI debate prep better than traditional research and coaching?",
        "Neither replaces the other. AI is faster at structure: case outlines, rebuttal blocks, topic brainstorming and evidence leads, which saves time on the repetitive parts of prep. Traditional prep does better at original source reading, real coaching feedback, tournament-specific strategy and adapting to a specific opponent, because those need human judgment. The practical answer is to combine them: use AI for scaffolding, traditional research for depth and coaching for strategy.",
    ),
    "debate-block-file-guide": (
        "How do you build a debate block file?",
        "Collect pre-written responses to common arguments and organize them by clash rather than by topic. Each clash should have blocks for both sides, so you are ready whichever side you are assigned. A good block file saves prep time and improves the quality of your responses in round. AI can help you brainstorm likely arguments and draft first blocks, but verify the logic and evidence yourself before using any of them.",
    ),
    "debate-speech-structure": (
        "How should you structure a debate speech?",
        "It depends on the speech. In an opening speech, state your position, define key terms, present contentions with warrants and impacts, and preview your weighing. In a rebuttal or final speech, respond to the key clash, extend your offense, weigh the comparison and end by telling the judge why you win. In every speech, the judge should never be confused about where you are, because a well-structured speech is easier to flow, easier to judge and easier to win.",
    ),
    "debate-motion-analysis": (
        "How do you analyze a debate motion?",
        "Read the motion carefully, define each term, identify what each side must prove, and map the likely clashes. Choose definitions that are fair, defensible and favorable to your side, since definitions can frame the round. Then pin down your burden, which is what you must prove to win. If you do not meet your burden, you lose regardless of how well you argue, so build your case strategy around it.",
    ),
    "debate-collapsing-strategy": (
        "What does collapsing mean in debate, and how do you do it?",
        "Collapsing means choosing the few arguments that win and abandoning the rest, so you spend more time on the argument that actually decides the round. Pick the clash where you have the strongest evidence, the clearest warrant and the best weighing. Then signal that you are collapsing, explain why the dropped arguments do not matter, and spend your remaining time on that clash. If you spread yourself thin, you lose.",
    ),
    "debate-pronunciation-and-delivery": (
        "How can I improve my debate speech delivery?",
        "Slow down on tags and author names, pause between contentions and emphasize your weighing phrases. The judge cannot vote for an argument they did not hear clearly, so speed without clarity is wasted effort. Practice with a timer and record yourself to catch the common problems: speaking too fast, mumbling, monotone delivery and forgetting to pause. Each of these can cost you rounds even when your arguments are strong.",
    ),
}
