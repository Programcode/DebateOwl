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
        "For preparing a specific motion, {product} gives you a case you can read out loud, \"If they say X, we answer Y\" replies and timed practice rounds ({trial_days}-day free trial, then $5/month). General chatbots are better for open brainstorming, and research tools for finding sources. Other debate platforms differ in formats, practice style and price; the table below compares six tools as of October 2026. Give each tool the same motion and tasks before you decide.",
    ),
    "debateowl-pricing": (
        "How much does {product} cost?",
        "As of October 2026, {product} has a 3-day free trial with no credit card required, then Pro costs {pro_price}. There is no permanent free plan. Whether Pro is worth it depends on how often you prepare: if you debate every week or have a tournament coming, it covers heavy prep weeks with higher daily limits and all 10 models. If you need help only occasionally and want to stay free, a general chatbot's free tier or a free practice tool will suit you better.",
    ),
    "debateowl-vs-chatgpt": (
        "Which is better for debate prep, {product} or ChatGPT?",
        "It depends on the task. ChatGPT is better for learning a new topic, open brainstorming and general writing help, and it works for any subject. {product} is better when you are preparing a specific motion: it keeps your cases, sources and practice rounds together, drafts answers to what the other side will say, times your speeches and gives a verdict on practice rounds. Many debaters use both, ChatGPT for background and {product} for motion prep and practice. Neither replaces checking original sources.",
    ),
    "debateowl-vs-windebate": (
        "Which is better, {product} or WinDebate?",
        "It depends on your format, budget and how you practise. As of October 2026, WinDebate names six formats including Congressional, Policy and British Parliamentary, has a free tier with monthly limits, and adds live-round capture, replay review and progress tracking, with paid plans from $19.99/month. {product} costs {pro_price} after a 3-day trial, runs full practice rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas and Public Forum, and works in English, Spanish and Hungarian. Choose WinDebate for Policy, Congress or season tracking, and {product} for low-cost case building and sparring.",
    ),
    "debateowl-vs-debateclub": (
        "Which is better, {product} or DebateClub?",
        "They solve different problems. As of October 2026, DebateClub is voice-only sparring for high-stakes conversations such as negotiations, pitches and meetings, with opponent personas and rhetorical technique scoring, and Pro costs $19/month. It names no competitive debate formats. {product} is built for school and competitive debate: cases, rebuttals, evidence, a timer and timed rounds in School 4-6-6-3, Lincoln-Douglas and Public Forum, at {pro_price} after a 3-day trial. Choose DebateClub for workplace persuasion practice and {product} for tournament prep.",
    ),
    "ai-debate-practice": (
        "Can practising debate against an AI actually make you better?",
        "Yes, if it shortens the loop of giving a speech, finding what failed, fixing one thing and giving it again. A useful session needs a motion, a side, real speech times, an opponent that responds to what you said and a verdict that names why you won or lost. {product}'s Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds this way. AI practice adds repetitions between team practices but does not replace them: judge adaptation, delivery under pressure and strategic judgement still develop fastest with a coach and real rounds.",
    ),
    "ai-debate-case-generator": (
        "Can an AI debate case generator write a case I can actually use?",
        "Yes, as a draft. {product}'s case generator turns a motion into a ready-to-read case: an opening, arguments with explanation, evidence and why it matters, \"If they say… we answer…\" replies, a closing line and the sources it used. You then verify it and rewrite it in your own words. Treat its citations as research leads: open every source and confirm the exact claim. The judgement calls, such as which argument to cut and where to answer the opposition early, stay with you.",
    ),
    "debate-rebuttal-practice": (
        "How do you find the weak link in an argument you need to rebut?",
        "Start with the reason behind the claim: does it actually prove the point? An unexplained claim gives the judge little reason to believe it. Then choose your move: deny the claim, challenge the reason, reduce the claimed harm, turn it or outweigh it. Write each answer as a short block with a tag line, the response and why it matters, and deliver it in under forty-five seconds. An AI analysis can point out missing reasons and overstated effects, but in round you still adapt each block to what the opponent actually said.",
    ),
    "ai-debate-coach": (
        "Can an AI debate coach actually help you prepare?",
        "Yes. {product}'s Ask coach is an AI debate coach that answers specific prep questions about what your side has to prove, which argument decides the round and how to structure a speech, and gives feedback on practice speeches; it works best when you name the format, side and speaker role. Vague questions get generic answers. Treat any sources it cites as leads to check. An AI coach has not watched you speak and does not know your judges or your partner, so take its conclusions to your human coach or team.",
    ),
    "debate-evidence-finder": (
        "Can AI find reliable evidence for a debate case?",
        "AI can find leads, not reliable evidence on its own. It is good at suggesting where to look and which searches to run, but a summary can lose a qualification, mix up two studies or point to a page that says something different. Open every original, check the author, date, publication, method and the text around the quote, and record the full citation. If the evidence is weak, do not read it. Narrow your claim or make the argument analytically, because clear reasoning often beats a quote that falls apart under one question.",
    ),
    "argument-flowchart": (
        "When is an argument flowchart useful for debate prep?",
        "It is useful before and after a round, not during one. A flowchart maps your case's main line, your arguments, the attacks on them and your answers, so you can see which link breaks a chain and where two arguments rely on the same assumption. Build it from the motion outward, add the strongest attack to each argument, and note at each clash why your side matters more. During the round itself, a written flow on paper or a laptop is faster than any canvas, so keep your in-round notes there and use the map to plan and review.",
    ),
    "online-debate-timer": (
        "How long are debate speeches in each format?",
        "It depends on the format. Public Forum has 4-minute constructives and rebuttals, 3-minute summaries and 2-minute final focus speeches. Lincoln-Douglas runs 6, 7, 4, 6 and 3 minutes. Policy uses 8-minute constructives and 5-minute rebuttals. British Parliamentary speeches are 7 minutes, and World Schools speeches are 8, followed by 4-minute replies. Cross-examination usually takes 3 minutes, and prep time varies by league, so check your tournament's rules. The free {product} debate timer loads each of these speech orders for you.",
    ),
    "how-to-write-a-debate-case": (
        "How do you write a debate case?",
        "A {product} case has an opening, two to four arguments (three by default) each with an explanation, evidence and why it matters, \"If they say… we answer…\" replies, a closing line and the sources it used. Start by defining the motion fairly and writing what your side must prove. Check every source, rewrite the draft in your own words and time a reading aloud. Adjust for your format: Public Forum usually fits two arguments; Lincoln-Douglas uses a goal and a test for meeting it; BP closing teams need a new angle.",
    ),
    "how-to-practice-rebuttals": (
        "What is the best way to practise debate rebuttals?",
        "Use short, frequent drills that copy the pressure of a round: arguments you did not write, a clock, and feedback on one thing. Three or four sessions of 20 to 30 minutes a week, each training one skill, beat one long session. New debaters should start with selection, picking the argument that decides the round, then move on to challenging reasons, grouping and weighing under time. Shadow rebuttals and flipping your own case work alone, while one-sentence answers and rapid fire need a partner. Score each speech on the same five questions to track progress.",
    ),
    "public-forum-debate": (
        "How do you prepare for a Public Forum debate round?",
        "Write cases for both sides, because you often learn your side shortly before the round. A constructive is four minutes, so plan two arguments, each with an explanation, evidence and why it matters. Decide in advance which one or two issues you would collapse to, since anything you want in final focus has to be in summary first. Treat crossfire as questioning that sets up your next speech. How you present depends on the judge: for lay judges, run fewer arguments, signpost clearly and speak at a normal pace. Under common rules, speeches run 4-4-3-2 minutes with three 3-minute crossfires.",
    ),
    "lincoln-douglas-debate": (
        "How do you build a Lincoln-Douglas debate case?",
        "Choose a value (the goal the judge should protect) and a criterion (the test for meeting that goal). Then write two or three contentions that each prove your side meets that criterion, and expect the negative to accept your framework (how the judge should decide) and argue you fail its test. Under NSDA rules the affirmative constructive is six minutes and the negative's is seven, which fits one framework and two or three contentions. Prepare cross-examination questions that pin down the opponent's framework, and blocks for the arguments you expect most.",
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
        "Two teams of three speakers each give eight-minute substantive speeches, then each team gives a four-minute reply, opposition first, delivered by its first or second speaker. Prepare by interpreting the motion: define terms, give a model for policy motions, name the stakeholders and write each side's burden. Practise every role, because first, second, third and reply speakers owe the team different things. Motions are prepared or impromptu, so also practise preparing within an hour. Offer short Points of Information aimed at the reason behind a point, and as a general rule accept at least two.",
    ),
    "how-to-weigh-in-debate": (
        "How do you weigh arguments in a debate?",
        "Compare your impact with your opponent's on a named measure and say why that measure matters. The six common measures are magnitude, probability, timeframe, reversibility, scope and link strength. Which one is strongest depends on the round, but probability and link strength often persuade more than magnitude, because every team claims its impact is huge. When their impact wins on one measure and yours on another, explain why your measure should count more here. Start weighing in your first speech and build on it in rebuttal, rather than saving it for the end.",
    ),
    "how-to-cross-examine-in-debate": (
        "How do you cross-examine well in a debate?",
        "Ask short, closed questions that get commitments you can use in your next speech, rather than open questions that let the speaker repeat their case. A good line commits the speaker to something, narrows it, then stops before they can explain it away. A three-minute period fits two or three lines, so pick the ones that challenge the reason the round depends on. Repeat any concession in your speech and weigh it, because judges decide on what the next speech does with cross-ex. In World Schools and British Parliamentary, Points of Information do this job instead.",
    ),
    "how-to-prepare-for-a-debate-tournament": (
        "How do you prepare for a debate tournament?",
        "Give a new topic about two weeks. In the first, read both sides, list the likely clashes and write a short case for each side. In the second, write blocks against the arguments you expect and run practice rounds at real speech times. Stop adding material two days out and check every source instead. In round, save most of your prep time for the final speeches, where you choose what to collapse to. For impromptu formats, practise building cases inside the real prep window.",
    ),
    "how-to-flow-in-debate": (
        "How do you flow a debate round?",
        "Take notes in columns, one per speech in speaking order, with a separate sheet or section for each side's case. Write each argument's tag in a few words with the reason it is true underneath, use two colours, and leave space. A short, consistent set of abbreviations lets you keep up. Mark any argument with nothing next to it in the next column as dropped, since most formats treat it as conceded. Paper and a laptop both work. In British Parliamentary and World Schools, many debaters flow by clash instead of strictly by speech.",
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
        "How do you find the key clash in a debate and collapse to it?",
        "List every open disagreement on your flow, then ask of each one whether winning it alone wins you the round and whether losing it loses you the round. The clash that passes both tests, and where your reasoning is stronger, is the one to go for. In your last speeches, say plainly that you are going for it, respond to the opponent's attacks on it and weigh it against their best point. Drop the rest, unless an argument has been turned against you, which you still have to answer.",
    ),
    "debate-fallacies": (
        "How do you attack a logical fallacy in a debate?",
        "Point to the step that fails and say what the argument no longer proves once it does. Judges reward that explanation, not the name of the fallacy. A one-sentence answer usually works: a straw man misstates our model, a false dilemma ignores other options, a slippery slope has no reasons between its steps. Check first that the argument really is invalid rather than only weak, and use cross-examination to make the opponent state the missing link out loud.",
    ),
    "debate-judge-adaptation": (
        "How do you adapt your debating to different types of judges?",
        "Find out what the judge prefers before the round, from a published paradigm or by asking. Lay judges reward a clear story, plain language and a few arguments at a normal pace. Flow judges reward line-by-line answers, named extensions and explicit weighing. Technical judges add evidence quality and strategy. Change how many arguments you run and how you present them, not the claims you defend, and watch the judge's note-taking to adjust during the round.",
    ),
    "debate-speech-structure": (
        "How should you structure and deliver a debate speech?",
        "Open with a one-sentence roadmap, signpost each section, and explain each point, why it is true and why it matters. Constructives build the case and preview weighing; rebuttals start with the arguments the ballot depends on; final speeches collapse to one or two clashes and weigh them without new arguments. Budget each section's time before you speak. When delivering, slow down on signposts and the weighing line, pause so the judge can find their place, and practise any names you need to pronounce.",
    ),
    "debate-motion-analysis": (
        "How do you analyze a debate motion?",
        "Identify the motion type first, because a policy, value, regret or actor motion each sets a different burden. Define just the words that shape the round, the way a reasonable person would read them, and add a model for policy motions. Write each side's burden in one sentence, list who the motion affects, and name the two or three clashes the round is likely to turn on. Decide which clash to prepare first before writing any argument.",
    ),
}
