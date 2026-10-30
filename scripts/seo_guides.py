"""Long-form copy for the guide pages that have their own content.

generate_seo_content.py merges each entry over the PAGES item with the same
slug. Name the product with {product} and the Pro price with {pro_price}; the
generator fills them from src/config/site.json. {mode_count}, {mode_names} and
{utility_names} come from the tool lists in tool-links.tsx. A section is (heading, blocks), where a block is a
paragraph string or a dict with one of: h3, steps, list, table ({"head": [...], "rows": [[...]]}), example.
A format guide's speech times must match src/lib/free-tools/formats.ts, which the free timer runs.
"""

GUIDES = {
    "ai-debate-practice": {
        "modified": "2026-10-30",
        "pricing_cta": True,
        "features": [
            ("Practice against AI opponents", "Run a full Sparring round in School 4-6-6-3, Lincoln-Douglas or Public Forum, type or speak each speech, and finish with a judged verdict."),
            ("Turn feedback into drills", "Take the weakest point from a verdict or a Crossfire debrief, rebuild it with Attack or Ask, and run that speech again."),
            ("Keep private prep out of search", "Cases, sources, rounds and history stay inside your Current Debate behind sign-in. Only these public guides are indexed."),
        ],
        "sections": [
            ("The checklist: seven things a practice tool should do", [
                "Before you compare products, decide what you are practising. Tick the lines that matter for your next month; the matrix below shows which tools do each one.",
                {"checklist": [
                    "An opponent argues back against what you actually said.",
                    "Rounds follow my format's speech order and times.",
                    "Feedback names a reason I won or lost, not only a number.",
                    "I can say my speeches out loud, not only type them.",
                    "It helps me write the case before I practise it.",
                    "It remembers my motion and side between sessions.",
                    "There is a free way to try it first.",
                ]},
                "No tool does all seven equally well, and you may not need all seven. A debater with a tournament motion needs the first five. Someone building confidence before their first round mostly needs the first and the fourth.",
            ]),
            ("Comparison matrix (as of October 2026)", [
                {"table": {
                    "caption": "Each competitor cell comes from that product's own page, checked October 30, 2026. Not stated means its pages do not say.",
                    "head": ["Tool", "Opponent", "Real format times", "Feedback", "Out loud", "Writes the case first", "Keeps your motion", "Free way to try"],
                    "rows": [
                        ["[{product}](/)", "An AI that argues the other side", "Yes: School 4-6-6-3, LD and PF in Sparring", "A judged verdict that names the reason", "Yes, typed or spoken", "Yes: opening, arguments, \"If they say… we answer…\", closing, sources", "Yes: one Current Debate per motion", "3-day free trial; free timer and tools with no account"],
                        ["[Debate Ladder](https://debateladder.com/)", "An AI, voice first", "No: its own opening, rebuttal and closing", "AI judge on five criteria, with feedback", "Yes; practice mode lets you type", "Not listed", "Saves your custom debates", "100 free credits"],
                        ["[ArguFight](https://www.argufight.com/)", "People; an AI for a warm-up", "No: 5 written rounds over 24 hours, or 3 in 1 hour", "Up to three AI judges, 0–100 with reasons", "Speech-to-text input", "Not listed", "Debate history", "Free to start"],
                        ["[PublicForumAI](https://publicforumai.com/pricing)", "An AI", "Public Forum only", "Tech and lay judge feedback", "Not stated", "Yes: Public Forum cases", "Rounds kept 30 days on the free plan", "3 full rounds a month"],
                        ["[MindDuel](https://play.google.com/store/apps/details?id=com.serdaryalkabov.brightmint)", "An AI", "No: 10 turns of 5–60 seconds", "0–100 score in five areas, short explanation", "Yes, voice-to-text", "Not listed", "Debate history", "In-app purchases; prices not stated"],
                        ["[ChatGPT](https://chatgpt.com/pricing)", "The chat, if you set it up", "Only if you set it up", "Only if you ask", "Voice chats, limited on the free plan", "By prompting", "With memory, limited on the free plan", "Free version for everyone"],
                        ["[Claude](https://claude.com/pricing)", "The chat, if you set it up", "Only if you set it up", "Only if you ask", "Not stated on its pricing page", "By prompting", "Memory across conversations", "Free plan, $0"],
                    ],
                }},
                "Read the matrix against your ticks, not against a total. A tool with fewer \"yes\" cells can still be the right one if it does the two things you need.",
            ]),
            ("Which tool for which debater", [
                {"list": [
                    "A set motion and a date: {product}, the top pick for a case you can read out loud, \"If they say X, we answer Y\" replies and timed practice rounds.",
                    "Ranked speaking reps on any topic: Debate Ladder. See [{product} vs Debate Ladder](/debateowl-vs-debate-ladder).",
                    "Written rounds against real people, judged by AI: ArguFight, which is free to start. See [{product} vs ArguFight](/debateowl-vs-argufight).",
                    "Public Forum only, on a free plan: PublicForumAI. See [the best AI for Public Forum](/best-ai-for-public-forum).",
                    "Short spoken drills on an Android phone: MindDuel. See [{product} vs MindDuel](/debateowl-vs-mindduel).",
                    "A free partner for ideas: ChatGPT or Claude. See [ChatGPT vs Claude for debate](/chatgpt-vs-claude-for-debate).",
                ]},
                "Whichever you choose, open every source an AI suggests before it goes into a speech.",
            ]),
            ("What a useful AI practice session looks like", [
                "Most debaters improve through repetitions with feedback: give a speech, find out what failed, fix one thing, give it again. AI practice is valuable when it shortens that loop, not when it hands you a finished speech to read.",
                "A chat window can produce arguments on request, but it does not hold a round together. It forgets which side you are on, does not time you, and rarely tells you which of your points the judge would have dropped. Practice needs a motion, a side, a format with real speech times, an opponent that responds to what you actually said, and a verdict that names the reason you lost or won.",
                "{product} is built around that loop. You start a Current Debate for one motion, and every case, source, round and debrief you create stays filed under it. That means the AI opponent in your third practice round argues the same motion you wrote your case for, and your History shows how the debate developed across sessions.",
            ]),
            ("A 45-minute practice session, step by step", [
                "This plan fits a weeknight. It assumes you have a motion but no case yet.",
                {"steps": [
                    "Start a Current Debate with the motion written exactly as it will be announced (2 minutes). Add any articles or notes you already trust to the Library so later answers are grounded in them.",
                    "Run Brainstorm on the motion and pick the two or three angles you can explain in one sentence each (5 minutes). Discard angles that need evidence you do not have.",
                    "Generate a case for your side (10 minutes). Read its \"If they say…\" answers before your own arguments: they tell you what you will have to answer.",
                    "Run a Sparring round in your format (15 minutes). Give every speech in full, at time, without pausing to edit. Voice mode lets you speak instead of type.",
                    "Read the verdict and write down the single reason it gives for the decision (3 minutes).",
                    "Rebuild only that part (5 minutes): ask Attack to stress-test the rewritten argument, or regenerate the one case section that failed.",
                    "Give the rebuilt speech again against the timer (5 minutes). Compare it with the first attempt.",
                ]},
                "The discipline is in step six. Fixing one problem per session sticks; rewriting the whole case after every round mostly produces new problems.",
            ]),
            ("Worked example: one practice round", [
                {"example": {"title": "Motion: This house would ban smartphones in secondary schools", "rows": [
                    ("Side and format:", "Proposition, run as a School 4-6-6-3 Sparring round."),
                    ("First argument:", "Phones fragment attention in class, and attention is the input every other kind of learning depends on."),
                    ("AI opponent's response:", "Schools already confiscate phones during lessons, so a ban changes only break times, where the harm you described does not happen."),
                    ("What the verdict flagged:", "Proposition never explained what a ban adds over existing classroom rules, so the opposition's mitigation stood unanswered."),
                    ("The drill:", "Ask Attack to find the gap in the argument, then rewrite it around breaks: social exclusion, cyberbullying during the school day, and the cost of teachers enforcing rules lesson by lesson."),
                    ("Second attempt:", "The R1 speech now opens with the comparison: classroom rules depend on every teacher enforcing them every hour, while a ban sets one rule at the school gate. The opponent's mitigation becomes a point in your favour."),
                ]}},
                "The example shows the pattern to look for. The first version was not wrong; it was incomplete in a way only a responsive opponent exposes. That is the gap AI practice fills between team practices.",
            ]),
            ("Format-specific practice tips", [
                {"h3": "World Schools (WSDC)"},
                "WSDC rounds reward a consistent team line, so practise as a team even when you use AI. Agree the line in one sentence, then have each speaker run their own section against the AI and check that the line survives. Points of Information matter in every substantive speech: use Crossfire with the AI asking the questions to rehearse taking a POI, answering in under fifteen seconds, and returning to your structure. Sparring does not run a WSDC round, so time the eight-minute substantives and four-minute reply yourself.",
                {"h3": "British Parliamentary (BP)"},
                "In BP, two teams on each bench compete with each other as well as with the other side. Practise both halves. For opening, generate a case with the Current Debate's format set to British Parliamentary and drill a clear definition and model in the first two minutes. For closing, take an opening case you have already generated and practise finding an extension it does not contain, then deliver it in seven minutes without repeating opening material.",
                {"h3": "Public Forum (PF)"},
                "Sparring runs Public Forum with four-minute constructives and rebuttals, three-minute summaries and two-minute final focuses. Use the round to practise the hardest skill in PF: keeping summary and final focus consistent. Before each summary, write the two issues you will collapse on, and check after the round whether your final focus extended exactly those issues and nothing new.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The Lincoln-Douglas round follows the standard times: six-minute affirmative constructive, seven-minute negative constructive, four-minute first affirmative rebuttal, six-minute negative rebuttal and three-minute second affirmative rebuttal. The 1AR is where most affirmatives lose. Run it repeatedly against the same negative constructive and group similar responses, and use the same test for how the judge should decide across several arguments. That helps four minutes cover seven.",
            ]),
            ("How to tell whether practice is working", [
                "Keep a short log for each session on paper or in a document. Track the same four things every time:",
                {"list": [
                    "Arguments you dropped: anything the opponent said that you never answered. This number should fall first.",
                    "Time use: whether you finished each speech within ten seconds of the limit without rushing the last point.",
                    "Weighing: whether your final speech compared impacts explicitly, or just repeated them.",
                    "Verdict reasons: whether the judge's reason for the decision changes from session to session, or keeps naming the same weakness.",
                ]},
                "If the same verdict reason appears three sessions in a row, stop running full rounds and drill that one skill in isolation until it changes.",
            ]),
            ("AI vs traditional prep", [
                "AI and traditional preparation are good at different parts of the work. AI is fast at structure; reading, coaching and real rounds are where judgement comes from. Most strong debaters use both and give each the tasks it does well.",
                {"table": {"head": ["Task", "AI does it well", "Traditional prep does it better"], "rows": [
                    ["First case outline", "Drafts an opening, arguments with evidence and \"If they say…\" answers in minutes", "Choosing which outline fits your team and your circuit"],
                    ["Rebuttal blocks", "Lists likely arguments and first-draft answers", "Testing answers against opponents you have actually met"],
                    ["Research", "Suggests evidence leads and search directions", "Reading the original source, checking dates and context"],
                    ["Practice rounds", "A responsive opponent at any hour, at real speech times", "Unpredictable opponents, panels and live crossfire"],
                    ["Feedback", "A consistent verdict that names a reason", "A coach who knows your habits and the judges you will face"],
                ]}},
                "A simple split works for most teams: use AI to get from a blank page to a first draft and for extra practice volume, then spend coaching time and team practice on strategy, delivery and the arguments the AI draft got wrong. Never read AI-suggested evidence in round until you have opened the original source yourself.",
            ]),
            ("Where AI practice stops being enough", [
                "An AI opponent is consistent and always available, which is exactly what makes it a good training partner and a limited judge. It will not reproduce the judge who dislikes speed, the panel that splits, or the opponent who asks a question you never anticipated. Use AI rounds for volume between real practices, and save team practices and coached rounds for adaptation, delivery and the feedback only an experienced person can give.",
            ]),
            ("Sources (checked October 2026)", [
                {"list": [
                    "[debateladder.com](https://debateladder.com/): voice-first rounds, AI judge on five criteria, Elo from 500, 100 free credits, custom debates.",
                    "[argufight.com](https://www.argufight.com/): human challenges in 5-round or 3-round written modes, AI judge panel scoring 0–100, AI warm-up, speech-to-text, free to start. Its /pricing address returned 404. Its [schools page](https://www.argufight.com/for-schools) adds a debate history for every student.",
                    "[publicforumai.com/pricing](https://publicforumai.com/pricing): free plan with 3 full rounds a month and Premium at $9.99/month or $79/year.",
                    "[MindDuel on Google Play](https://play.google.com/store/apps/details?id=com.serdaryalkabov.brightmint): 10 rounds, 5–60 second turns, voice-to-text, 0–100 score, in-app purchases. We found no website for it.",
                    "[chatgpt.com/pricing](https://chatgpt.com/pricing): free version for everyone, limited voice and memory on the free plan.",
                    "[claude.com/pricing](https://claude.com/pricing): free plan at $0 with memory across conversations.",
                ]},
            ]),
        ],
        "faqs": [
            ("Is there a free AI debate practice tool?", "Yes. As of October 2026, ArguFight is free to start, Debate Ladder gives new accounts 100 credits, PublicForumAI includes 3 full rounds a month, and ChatGPT and Claude have free plans. {product}'s debate timer and other tools are free with no account; its app is paid after a {trial_days}-day trial."),
            ("Which formats can I spar against the AI in?", "Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds with their speech order and times. For WSDC, British Parliamentary and other formats you can still generate cases, get coaching and drill rebuttals, and time speeches yourself."),
            ("Can I give my practice speeches out loud?", "Yes. Sparring and Crossfire can run as spoken rounds in the browser, so you can practise delivery as well as content."),
            ("How often should I practise against an AI opponent?", "Two or three focused sessions a week usually beats one long one. Each session should end with one specific fix that you drill before the next round."),
            ("Does AI practice replace a coach or real rounds?", "No. It adds repetitions between team practices. Judge adaptation, delivery under pressure and strategic judgement still develop fastest with people."),
            ("Is AI debate prep better than traditional prep?", "Neither is better on its own. AI is faster at outlines, block drafts and evidence leads; reading sources, coaching and real rounds build the judgement AI drafts lack."),
            ("Are my practice rounds private?", "Yes. Rounds, verdicts and debriefs are saved to your account inside the Current Debate they belong to, behind sign-in. Search engines only see these public guides."),
        ],
    },
    "ai-debate-coach": {
        "modified": "2026-10-28",
        "definition": ("What is an AI debate coach?", "AI debate coach", "A chat tool that answers a debater's prep questions about strategy, arguments, answers to the other side and speech structure, and gives feedback on practice speeches, for the debater to test and adapt."),
        "features": [
            ("Strategy help", "Ask which argument decides the round, what your side has to prove and where to spend your speaking time, with answers that use your debate's motion and sources."),
            ("Speech structure", "Get an outline for a constructive, rebuttal, summary or reply speech: the order of points and how long to give each one."),
            ("Practice feedback", "Paste a speech or a flow and ask what was unclear, under-warranted or dropped, then pick one fix to drill."),
        ],
        "sections": [
            ("What an AI debate coach is for", [
                "A good human coach rarely gives you an answer first. They ask what the round is about, which side you are on, what you have to prove, and what the judge will be comparing at the end. The AI coach in {product} works best the same way: as a partner you think out loud with, not a machine that writes speeches.",
                "Ask is a coaching chat that streams its answer as it writes, and it already knows your Current Debate: the motion and the Library sources you have marked active. That context is the main difference from a general chatbot. You do not have to paste the motion and your research into every question, and the advice stays tied to one debate instead of drifting between topics.",
            ]),
            ("How to ask a coaching question that gets a useful answer", [
                "Vague questions get generic answers. Compare these two:",
                {"list": [
                    "Weak: How do I win this debate?",
                    "Strong: I am second opposition in a WSDC round on this motion. Our first speaker argued the policy is unworkable. What should I add so I am not repeating her, and which proposition argument should I spend most of my rebuttal on?",
                ]},
                "The strong version names the format, the speaker role, what has already been said and the decision you actually have to make. A reliable template is: format, side and speaker, what is already on the table, what you are stuck on, and what kind of answer you want (a list, an outline or a single recommendation).",
            ]),
            ("Five coaching conversations worth having before a tournament", [
                {"steps": [
                    "Burden check: ask what each side has to prove for the motion to stand or fall, and where the line between them sits. Many rounds are lost on a burden nobody named.",
                    "Clash map: ask for the three places where the cases will meet. Plan your speeches around those, not around your own arguments.",
                    "Weighing rehearsal: give the coach your impact and the likely opposing impact and ask for the comparison in two sentences. Repeat until you can say it without notes.",
                    "Speech audit: paste a practice speech and ask which point never said why it is true, which point ran too long, and what a judge would remember from it.",
                    "Opponent prediction: ask how a strong team on the other side would frame the debate, then ask what your first response to that framing should be.",
                ]},
            ]),
            ("Worked example: coaching a weak rebuttal", [
                {"example": {"title": "Motion: This house believes social media companies should be legally liable for misinformation on their platforms", "rows": [
                    ("Student's rebuttal:", "Their argument is wrong because free speech is important and this would destroy it."),
                    ("Coach's diagnosis:", "The response asserts a value but never connects it to the proposition's mechanism. It does not say how liability leads to less speech, so the judge has nothing to weigh."),
                    ("Coach's question back:", "What would a platform rationally do if it could be sued for every false post?"),
                    ("Rebuilt rebuttal:", "Liability makes every borderline post a legal risk. A platform facing that risk removes anything it cannot verify quickly, which includes breaking news, whistleblowers and minority viewpoints. So the proposition does not just remove misinformation; it removes true speech that is hard to check, and the people who lose most are those with no other platform."),
                    ("Follow-up drill:", "Deliver the rebuilt response in forty-five seconds, then ask the coach for the strongest proposition answer to it and prepare a single-sentence reply."),
                ]}},
                "Notice that the coach did not write the rebuttal outright. It asked the question that exposed the missing link, which is the habit you want to build for rounds where no coach is available.",
            ]),
            ("Coaching by format", [
                {"h3": "World Schools (WSDC)"},
                "Ask the coach to check your team split: what the first and second speakers each own, and whether the third speaker can rebut without introducing a new argument. For the reply speech, ask for a structure built around the two or three questions the debate turned on, told from your side, without new material.",
                {"h3": "British Parliamentary (BP)"},
                "Role fulfilment decides BP rooms. Ask the coach whether your member speech is a true extension or a restatement of your opening bench, and ask what a whip speech should do with the five other speeches already in the room: group them into clashes, not summaries of each speaker.",
                {"h3": "Public Forum (PF)"},
                "Use coaching to plan the summary before the round. Ask which two issues you can realistically extend from constructive through final focus, and what the second rebuttal must frontline so those issues survive. Also ask for crossfire questions that set up your summary rather than score points.",
                {"h3": "Lincoln-Douglas (LD)"},
                "In LD, much of the coaching is about how the judge should decide the round: your value and criterion. Ask the coach whether your criterion actually measures your value, how each argument ties back to the criterion, and when it is safer to accept the opponent's value and criterion (their framework) and show that you win under them anyway.",
            ]),
            ("Getting answers with sources", [
                "When a coaching answer depends on facts, turn on Citations in Ask. The coach then answers with sources you can open. Treat those as leads: read the original, confirm it says what the answer claims, and only then use it in a speech. Adding your own trusted articles to the Library has the same effect from the other direction, because active sources that fit the question are used in its answers for that debate.",
            ]),
            ("What an AI coach cannot do", [
                "It has not watched you speak, it does not know the judges at your tournament, and it cannot tell you how your partner works under pressure. Bring the conclusions from AI coaching sessions to your human coach or team, and let them correct the advice that does not fit the people in the room.",
            ]),
        ],
        "faqs": [
            ("What can I ask the AI debate coach?", "Anything you would ask a coach between rounds: what your side has to prove, which argument decides the round, speech structure, how to answer a specific argument, or why a practice speech did not land. Specific questions with format, side and speaker role get the best answers."),
            ("Does the coach know my case?", "It knows your Current Debate: the motion, and the Library sources you have marked active. Paste a speech or a case section into the question when you want feedback on that exact text."),
            ("Can the AI coach cite sources?", "Yes. Turn on Citations in Ask and the answer includes sources you can open. Check each one against the original before using it in a round."),
            ("Will the coach write my speeches for me?", "It can draft an outline or a passage, but you will speak better from structure you understand. Use it to find what is missing, then write the speech in your own words."),
            ("How is this different from a general AI chatbot?", "The coach works inside one debate at a time, so it keeps your motion, debate settings and sources in context, and it is set up for debate questions rather than essays."),
            ("Is there a free AI debate coach?", "Not a permanent one in {product}. The Ask coach comes with the app's 3-day free trial, no credit card needed, and after that with Pro at {pro_price}. The tools you can use free without an account, the debate timer, motion generator, flow sheet and speech time calculator, do not include coaching."),
            ("Can an AI judge my debate speech?", "Partly. Sparring rounds end with a judged verdict that names the reason for the decision, and the Ask coach can tell you what was unclear, under-warranted or dropped in a speech you paste in. It has not watched you speak and does not know the judges at your tournament, so treat its verdict as practice feedback, not a prediction of a real ballot."),
        ],
    },
    "ai-debate-case-generator": {
        "modified": "2026-10-28",
        "definition": ("What is an AI debate case generator?", "AI debate case generator", "A tool that turns a motion into a draft debate case for one side and speaker role, with an opening, arguments backed by evidence, answers to what the other side will say and a source list, for a debater to verify and adapt."),
        "features": [
            ("A case you can read out", "Each draft has an opening, arguments with an explanation, evidence and why it matters, \"If they say… we answer…\" replies, a closing line and the sources it cites."),
            ("Evidence leads", "Every draft is researched on the web, names the source and year in each piece of evidence and lists its sources at the end. Check each one against the original before it goes on a card."),
            ("Roles and length", "Pick your side and speaker role, then set the case length, the audience level and the tone of the draft."),
        ],
        "sections": [
            ("What the case generator produces", [
                "Generate takes the motion from your Current Debate and returns a case you can read out, not a block of prose. Every draft has the same parts, in the order you would say them:",
                {"list": [
                    "Opening: a hook that makes the judge listen, then the line \"Today we will show N arguments that prove…\".",
                    "Arguments: each with a short title, the point in one sentence, an explanation of why it is true, evidence that names its source and year, and why it matters.",
                    "If they say…: the claims the other side is likely to make, each with our answer and, when there is one, the source behind it.",
                    "Closing line: one sentence that ties back to the opening.",
                    "Sources: every source the case cites, with the organisation, the year, the claim it supports and the link.",
                ]},
                "Your speaker role shapes the speech. The introductor gets the opening and short headline arguments, plus one line on what a motion term means when it is genuinely unclear. R1 gets the full arguments. R2 brings no new arguments: it spends about two minutes backing up the team's arguments, then answers the other side with five or six \"If they say…\" blocks. The conclusor brings no new arguments: it gets two or three reasons why your side won and the closing line.",
                "Because the answers to the other side are part of the draft, you start preparing rebuttals at the same time as your own case. When one section is weak, regenerate just that section; the rest of the case stays where it is. Finished cases export to PDF or DOCX.",
            ]),
            ("Generated draft vs. finished case: what you still do", [
                {"table": {"caption": "What the case generator gives you, and what you check before the round", "head": ["Section", "The generator gives", "You check"], "rows": [
                    ["Opening", "A hook and the line \"Today we will show N arguments that prove…\"", "That the hook is true, the line answers the motion exactly as worded and you can say it without notes"],
                    ["Arguments", "A title, the point, an explanation, evidence and why it matters", "Which ones meet what the other side will say; cut the rest to fit your speech time"],
                    ["If they say…", "The other side's likely claims, each with our answer", "That each answer meets the claim as they would make it and is short enough to say in a rebuttal"],
                    ["Closing line", "One sentence that ties back to the opening", "That it sums up the case in words you would actually say"],
                    ["Sources", "Every source the case cites, with arguments that still need evidence marked Needs Source", "Open every original, confirm the exact claim and record the full citation"],
                ]}},
            ]),
            ("From motion to verified case in seven steps", [
                {"steps": [
                    "Start a Current Debate with the exact motion wording. Small wording changes, such as should against would, change the burden.",
                    "Add the sources you already trust to the Library. Active sources are used when the case is generated, so the draft builds on your research instead of ignoring it.",
                    "Choose your side and speaker role: introductor, R1, R2 or conclusor. Under More options, set the length, the audience level and the tone. Length sets two, three or four arguments for the introductor and R1, and for R2 how many \"If they say…\" answers you get. If you need a particular angle, for example a principled argument or an economic one, put it in the Current Debate's Instructions.",
                    "Generate the case. Generate researches the motion on the web every time, lists the sources it found under the draft, and saves the relevant ones to the debate's Library.",
                    "Read the \"If they say…\" answers first and decide which of your arguments actually meets each claim. Cut arguments that do not clash with anything.",
                    "Regenerate any section that is vague, then verify every evidence lead against its original source.",
                    "Rewrite the final case in your own words and time a full reading of it before you call it ready.",
                ]},
            ]),
            ("Worked example: a generated case, and what the debater changed", [
                {"example": {"title": "Motion: This house would introduce a four-day school week", "rows": [
                    ("Side and role:", "Proposition, R1."),
                    ("Opening:", "A school that cannot pay more can still offer its teachers time. Today we will show two arguments that prove a four-day week helps students learn."),
                    ("Argument 1, keeping teachers:", "Point: a four-day week keeps experienced teachers. Explanation: schools competing for staff cannot always raise salaries, but they can offer time. Why it matters: experienced teachers are among the strongest in-school drivers of student learning."),
                    ("If they say:", "Working parents will pay for childcare on the fifth day, and students who are already behind lose teaching time."),
                    ("We answer:", "Schools can run an optional fifth-day programme for families who need it, and longer remaining days protect total teaching hours."),
                    ("Closing line:", "That is why a four-day week is the cheapest way to keep the teachers students learn most from."),
                    ("Evidence lead to verify:", "Research on districts that moved to four-day weeks, looking at attendance, teacher turnover and test results. Read the methodology: results differ between rural and urban districts."),
                    ("What the debater changed:", "Cut a weaker cost-saving argument the opposition would easily answer, and moved the teaching-hours answer into the first speech so it was on the table before the opposition raised it."),
                ]}},
                "The draft gave the debater a full structure in minutes. The judgement calls, which argument to cut and where to answer the opposition early, were still theirs, and that is where the round was won.",
            ]),
            ("Checking citations before they reach a card", [
                "Generated evidence is a starting point. Before any source goes into a speech:",
                {"list": [
                    "Open the original. If you cannot find it, do not use it.",
                    "Find the exact sentence that supports your claim, and check that the surrounding paragraph does not qualify it.",
                    "Check the date, the author and who published it. A think-tank brief and a peer-reviewed study carry different weight.",
                    "Make sure the evidence supports your point, not just your topic. A study showing four-day weeks save money does not prove they improve learning.",
                    "Record the full citation so you can produce it if an opponent or judge asks.",
                ]},
                "Factoids is useful here: give it a single statement from your case and it researches that statement and suggests searches you can use to confirm it.",
            ]),
            ("Adapting a generated case to your format", [
                {"h3": "World Schools (WSDC)"},
                "A WSDC case is split between the first and second speakers, with a team line both can repeat. Use the opening's \"we will show\" line as the team line, give the first speaker the opening and the first argument, and keep the strongest argument for the second speaker so the case builds rather than front-loads. Leave the Current Debate's format on Custom and describe this split in its Instructions.",
                {"h3": "British Parliamentary (BP)"},
                "Set the Current Debate's format to British Parliamentary and name your team position in its Instructions; Generate's own role options follow the School 4-6-6-3 speakers. Opening government needs a clear definition and mechanism, so describe them in the Instructions if the draft does not give them. Closing teams should treat the generated case as material the opening half will probably use, and look in the \"If they say…\" answers for an extension nobody else in the room is likely to run.",
                {"h3": "Public Forum (PF)"},
                "A PF constructive is four minutes, which usually means two arguments with evidence, not four. Since PF teams often find out their side shortly before the round, generate both sides of the resolution in the same debate and prepare the answers for each.",
                {"h3": "Lincoln-Douglas (LD)"},
                "Generate does not write a value and criterion for you, so put yours in the Current Debate's Instructions before you generate. Then check that each argument's why it matters links back to the criterion; if one does not, regenerate the arguments. Prepare a short defence of the criterion itself, because the negative will often attack it first.",
            ]),
            ("Mistakes to avoid with generated cases", [
                {"list": [
                    "Reading the draft in round. Judges hear the difference between a case you wrote and one you are reading for the first time.",
                    "Keeping every argument. Three well-defended points beat five thin ones.",
                    "Skipping the \"If they say…\" answers. They are the fastest route to your rebuttals.",
                    "Citing an evidence lead you never opened.",
                ]},
            ]),
        ],
        "faqs": [
            ("Does the case generator write a complete case?", "It writes a complete draft: an opening, arguments with explanation, evidence and why each matters, \"If they say… we answer…\" replies, a closing line and the sources it cites. Treat it as a structure to cut, verify and rewrite in your own words."),
            ("Are the generated citations reliable?", "They are research leads. Every draft is researched on the web and lists the sources it cites, and an argument that still needs evidence is marked Needs Source. Open every source, confirm the exact claim and record the full citation before using it."),
            ("Which debate formats does the generator support?", "Set the Current Debate's format to British Parliamentary, Policy, Classroom or Custom, and Generate reads it along with the debate's Instructions. Generate's own speaker roles (introductor, R1, R2 and conclusor) follow the School 4-6-6-3 format. For WSDC, Public Forum and Lincoln-Douglas, use Custom and describe the structure in the Instructions."),
            ("Can I change one part of a case without starting over?", "Yes. Regenerate a single section and the rest of the case stays on screen unchanged."),
            ("Can I export a generated case?", "Yes. Cases export to PDF and DOCX, and cases created in a Current Debate are saved to it automatically."),
            ("Is there a free AI debate case generator?", "{product}'s case generator is included in the 3-day free trial, with no credit card, and then in Pro at {pro_price}; there is no permanent free plan. Without an account you can use the free debate timer, motion generator, flow sheet and speech time calculator, but not the case generator."),
            ("Can AI write a Public Forum case?", "It can draft one. Set the Current Debate's format to Custom and describe the Public Forum structure in its Instructions, since Generate's own speaker roles follow School 4-6-6-3. A PF constructive is four minutes, which usually fits two arguments with evidence, so cut the draft to that and verify every source."),
            ("Is using an AI case generator cheating?", "Using it to draft and research before a round is preparation, but check your league's and your school's rules first: most leagues forbid electronic help during a round. Verify every source, rewrite the case in your own words and make sure you can defend each argument, because a case you cannot explain is easy to beat."),
        ],
    },
    "best-ai-debate-tools": {
        "software": True,
        "modified": "2026-10-29",
        "callout": ("Short answer by goal:", "/best-ai-for-debate", "which AI is best for debate"),
        "features": [
            ("Six tools side by side", "{product}, ChatGPT, Claude, debatelab.ai, WinDebate and Debate Ladder on cases, replies, timed rounds and price."),
            ("Format coverage", "Which formats a tool actually models, from Public Forum and Lincoln-Douglas to WSDC and British Parliamentary, and where you still prep by hand."),
            ("Workflow differences", "Whether cases, sources, practice rounds and feedback stay connected to one motion, or end up scattered across chats and documents."),
        ],
        "sections": [
            ("Feature comparison", [
                {"table": {
                    "caption": "AI debate tools compared, as of October 2026. Facts about other products come from their own websites; \"Not stated\" means we did not find it there.",
                    "head": ["Tool", "Best for", "Case you can read out", "Rebuttal / \"If they say\" practice", "Timed rounds", "Price (as of Oct 2026)"],
                    "rows": [
                        ["[{product}](/)", "Preparing a specific motion for a school or competitive round", "Yes: an opening, two to four arguments, \"If they say… we answer…\" replies, a closing line and sources", "Yes: replies in every case, plus Attack and Crossfire drills", "Yes: Sparring in School 4-6-6-3, Lincoln-Douglas and Public Forum, ending in a verdict", "{trial_days}-day free trial, then {pro_price}; no free plan. The [free debate tools](/tools) need no account."],
                        ["[ChatGPT](https://chatgpt.com)", "Open brainstorming and counter-arguments", "Only if you prompt for it", "Only if you prompt for it", "No built-in debate timer", "Free version; paid Go, Plus and Pro plans"],
                        ["[Claude](https://claude.ai)", "Critique of a long case you paste in", "Only if you prompt for it", "Only if you prompt for it", "No built-in debate timer", "Free plan; Pro $20/month, or $17/month billed annually"],
                        ["[debatelab.ai](https://debatelab.ai) (a separate product)", "Free practice against an AI opponent in World Schools or Asian Parliamentary style", "Not stated", "Drills for rebuttal, structure, weighing and evidence", "Speeches of 3, 5 or 7 minutes against an AI opponent", "Says it is completely free"],
                        ["[WinDebate](https://windebate.ai)", "Policy, Congress or British Parliamentary prep and season tracking", "Not stated", "Drills for attack, defense, weighing and speeches, plus rebuttal trees", "Not stated; it lists a Live Round Assistant and replay review", "Free tier with monthly limits; Plus $19.99/month, Pro $39.99/month"],
                        ["[Debate Ladder](https://debateladder.com)", "Ranked out-loud practice with an Elo rating", "Not stated", "You speak a rebuttal in each debate against an AI", "Not stated; you speak an opening, rebuttal and closing", "100 free credits for new accounts, then credits (about 1 per minute of speaking)"],
                    ],
                }},
                "{product} makes one of these tools. Check each product's own site before you pay: prices and plans change. The [{product} vs WinDebate](/debateowl-vs-windebate) page compares those two in more detail.",
            ]),
            ("The four kinds of AI debate tool", [
                "Debaters use AI tools for different jobs, and the categories overlap less than the marketing suggests. Most prep setups combine at least two of these.",
                {"h3": "General AI chatbots"},
                "Assistants such as ChatGPT, Claude and Gemini are flexible and good at brainstorming, explaining a concept or tightening a paragraph. Their weakness for debate is structure: they do not hold a motion, side and format across sessions unless you rebuild the context each time, and they will produce confident claims without sources unless you ask.",
                {"h3": "Research and citation tools"},
                "AI search and research assistants are strongest at finding sources quickly. They help with evidence but not with turning evidence into arguments, rebuttals or speeches.",
                {"h3": "Dedicated debate platforms"},
                "These are built around debate concepts: cases with arguments, rebuttals, opponents and verdicts. They vary a great deal in which formats they model and whether they let you practise or only generate text.",
                {"h3": "Practice utilities"},
                "Timers, flowing templates and argument maps. Often simple, sometimes not AI-based at all, and still essential for practice that matches tournament conditions.",
            ]),
            ("Eight criteria for comparing AI debate tools", [
                {"steps": [
                    "Structure: does each argument say what is true, why, and why it matters, or is it a wall of text?",
                    "Format awareness: does it know your speech order, times and roles, or treat every debate as an essay?",
                    "Sources: can you see where a claim comes from, and can you add your own material for it to use?",
                    "Opposition: does it predict and argue the other side, or only help with yours?",
                    "Practice: can you deliver a speech and get a response to it, not just read generated text?",
                    "Feedback: does it tell you why an argument failed, with something specific to fix?",
                    "Continuity: does work stay organised by motion, or do you lose it in a long chat history?",
                    "Limits and privacy: what is the daily or monthly allowance, and who can see your prep?",
                ]},
                "Weight the criteria by what you need. A novice benefits most from structure and feedback; an experienced competitor often cares most about sources, opposition and practice.",
            ]),
            ("A one-hour test you can run on any tool", [
                "Reviews and feature lists only go so far. The fairest comparison is to give every tool the same motion and the same tasks:",
                {"steps": [
                    "Pick a motion in your format that you know well, so you can judge the quality of the answers.",
                    "Ask each tool for a case on one side. Score it on structure and on whether the reasons it gives actually prove its points.",
                    "Ask each tool for the strongest argument against that case. Score whether it found the real weak point or a generic objection.",
                    "Paste one of your own past speeches and ask what it would change. Score how specific the feedback is.",
                    "Ask for evidence on one factual claim. Open every source and score how many check out.",
                    "Note how much context you had to repeat between steps.",
                ]},
                "Fifteen minutes per tool is enough to see the difference. Keep the scores; they are more useful than any ranking list, including this one.",
            ]),
            ("Worked example: scoring answers to one motion", [
                {"example": {"title": "Motion: This house would make voting compulsory", "rows": [
                    ("Task:", "Find the weakest link in the proposition argument that compulsory voting produces a more representative government."),
                    ("Strong answer:", "Points out that turnout and representation are different: compelled voters who know little about the candidates may vote randomly or for the first name on the ballot, so higher turnout may not mean preferences are better represented."),
                    ("Weak answer:", "Says compulsory voting violates freedom. That is an opposition argument, not an attack on the proposition's link, and it does not engage with representation at all."),
                    ("How to score it:", "Give the point only if the tool attacked the reason behind the claim (why more voters means better representation) rather than changing the subject."),
                ]}},
                "Running the same task through several tools shows quickly which ones understand debate structure and which ones produce plausible but generic text.",
            ]),
            ("Which tools fit which format", [
                {"h3": "World Schools (WSDC)"},
                "WSDC prep is team prep under time pressure, often for impromptu motions. Prioritise fast brainstorming and motion analysis, plus a way to practise Points of Information. Few tools model the full WSDC round, so expect to time speeches yourself.",
                {"h3": "British Parliamentary (BP)"},
                "BP rewards role knowledge and extensions. Look for tools that let you set the format and your team position, and that can show you what the opening half is likely to say so closing teams can plan something new.",
                {"h3": "Public Forum (PF)"},
                "PF depends on evidence and on keeping summary and final focus consistent. Strong source handling matters more here than in most formats, along with practice rounds that use real PF speech times.",
                {"h3": "Lincoln-Douglas (LD)"},
                "LD needs tools that handle value and criterion, not just policy arguments. Test whether a tool can defend a value and criterion (the standard the judge uses to decide) and tie each argument back to it, and whether it can practise the time-pressured 1AR.",
            ]),
            ("Where {product} fits", [
                "{product} is a dedicated debate platform that keeps every case, source, round and debrief inside one Current Debate. It covers case generation with \"If they say…\" answers to the other side, Library sources that ground its answers, Attack for finding weak links, Brainstorm, Factoids for checking claims, an Ask coaching chat with optional citations, Crossfire and full Sparring rounds with a verdict, a speech timer and an argument flowchart.",
                "Its limits are worth stating plainly. Sparring currently runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds, so WSDC and BP practice uses the prep and coaching tools rather than a full simulated round. Like every AI tool, its evidence leads need checking against the original source. Run the one-hour test above and decide on your own results.",
            ]),
        ],
        "faqs": [
            ("What is the best AI tool for debate?", "For preparing a specific motion, {product} gives you a case you can read out loud, \"If they say X, we answer Y\" replies and timed practice rounds. General chatbots are flexible for brainstorming and research tools find sources. Most debaters do best with a dedicated platform plus a way to verify sources."),
            ("Is a general chatbot good enough for debate prep?", "For brainstorming and explaining concepts, often yes. It is weaker at keeping a motion, side and format in context, predicting the opposing case, timing speeches and giving round-style feedback."),
            ("Are free AI debate tools enough?", "Free tiers are a good way to run the comparison test. Check the daily or monthly limits against how many practice sessions you plan before a tournament."),
            ("Can I use AI tools during a debate round?", "Usually not. Most leagues restrict or ban internet access and electronic help during rounds. Check your league's rules, and use AI tools for preparation."),
            ("What are the alternatives to {product}?", "General chatbots, AI research assistants, other dedicated debate platforms, and simple practice utilities such as timers and flowing templates. Run the one-hour test above on {product} and on each alternative you are considering."),
            ("How should I compare AI debate tools fairly?", "Give every tool the same motion and the same tasks, such as a case, the strongest counter, feedback on your speech and evidence for one claim, then score each answer against the same criteria."),
        ],
    },
    "debate-rebuttal-practice": {
        "modified": "2026-10-28",
        "features": [
            ("Find gaps in reasoning", "Paste an argument into Attack and get the links that fail: missing reasons, overstated effects and assumptions the other side never proved."),
            ("Build targeted blocks", "Each weakness comes with why it is weak, how the other side will attack it and a stronger version. Turn that into a short block; the analysis stays in your Current Debate."),
            ("Practice weighing and collapse", "Deliver rebuttals in a Sparring round and see in the verdict whether your weighing changed the outcome."),
        ],
        "sections": [
            ("The five ways to answer an argument", [
                "Every rebuttal is one of a small number of moves. Naming the move before you speak keeps the response short and makes it obvious to the judge what you have done:",
                {"list": [
                    "Deny the claim: show the thing they say happens does not happen.",
                    "Challenge the reason (debaters call this the warrant): accept that the claim could be true, but show that their explanation does not prove it.",
                    "Mitigate the impact: concede the mechanism but show the effect is smaller, rarer or slower than they said.",
                    "Turn it: show their argument actually supports your side.",
                    "Outweigh it: concede the point and show your impact matters more.",
                ]},
                "Challenging the reason is often the strongest choice, because an unexplained claim gives the judge little reason to believe it. Turns are the most powerful when they work and the most dangerous when they do not, so practise them before using them in a round.",
            ]),
            ("A 20-minute rebuttal drill", [
                {"steps": [
                    "Choose one opposing argument you expect to face. If you have generated a case, take it from its \"If they say…\" answers.",
                    "Paste it into Attack and read the weaknesses it finds. Pick the one that breaks the argument, not the one that is easiest to say.",
                    "Write a block: a five-word tag line, the response in two or three sentences, and one sentence on why it matters for the round.",
                    "Time yourself delivering the block in under forty-five seconds.",
                    "Ask the coach for the best answer to your block, and add a one-sentence reply to the bottom.",
                    "Repeat with the next most likely argument. Three tested blocks per session is a good pace.",
                ]},
                "Your Attack analyses stay in the same Current Debate, so your rebuttals sit next to the case they answer.",
            ]),
            ("Worked example: rebutting one argument", [
                {"example": {"title": "Motion: This house would ban zoos", "rows": [
                    ("Opposition argument:", "Zoos protect endangered species through captive breeding programmes, so a ban would push some species closer to extinction."),
                    ("Weak link:", "The argument assumes that captive breeding requires zoos as they exist now, with public display, rather than conservation centres run for that purpose."),
                    ("Response (challenge the reason):", "Breeding programmes need specialist facilities and genetic management, not visitors. A ban on zoos as public attractions does not stop sanctuaries and conservation centres from running them."),
                    ("Response (mitigate):", "Most animals kept in zoos are not part of reintroduction programmes, so even if some breeding is lost, the protection the opposition claims is far smaller than their argument suggests."),
                    ("Weighing:", "Even at full strength, their benefit applies to a small number of species. Our harm, keeping animals in conditions that do not meet their needs for public entertainment, applies to every animal in every zoo."),
                    ("Forty-five second version:", "Their benefit is breeding, but breeding does not need an audience. Ban the attraction, keep the conservation centres, and their argument disappears."),
                ]}},
                "The response does not argue about whether conservation matters. It targets the one assumption the argument needs, which is faster and harder to answer.",
            ]),
            ("Rebuttal tips by format", [
                {"h3": "World Schools (WSDC)"},
                "Rebuttal grows through the bench: the first opposition speaker begins it, the second speaker does the bulk of it, and the third speaker organises the debate into its main clashes and should not add new arguments. Practise third-speaker rebuttal by taking a full set of opposing points and grouping them under two or three questions, then answering each question once.",
                {"h3": "British Parliamentary (BP)"},
                "Closing teams must rebut and extend at the same time, so practise blocks that answer the opening bench across from you and then lead straight into your extension. Whips should rebut by clash, not speaker by speaker, and avoid new material.",
                {"h3": "Public Forum (PF)"},
                "In a four-minute rebuttal, the second-speaking team should answer the attacks made on its own case as well as attacking the opponent's, or those arguments will be hard to bring back in summary. Practise splitting the four minutes, and remember that what is not in summary should not appear in final focus.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The 1AR has four minutes to answer seven minutes of negative material. Group similar responses and use the same judging test across them. Give the most important answers first so the 2AR has something to build on. For the negative rebuttal, drill collapsing onto the one or two arguments that best outweigh.",
            ]),
            ("Use cross-examination to set up your rebuttal", [
                "The best rebuttals often start in cross-examination. If an argument rests on an assumption, ask a question that gets the speaker to commit to it, then attack the assumption in your speech. Crossfire lets you practise this against the AI, asking questions or answering them, and each Crossfire ends with a debrief you can turn into new blocks.",
            ]),
            ("Common rebuttal mistakes", [
                {"list": [
                    "Answering every sentence instead of the argument the round depends on.",
                    "Restating your own case rather than engaging with theirs.",
                    "Giving a response without saying why it matters for the decision.",
                    "Leaving the weighing to the final speech, when the judge has already started deciding.",
                    "Losing track of what has been dropped. Keep a flow, or map the clash in the argument flowchart, so nothing important goes unanswered.",
                ]},
            ]),
        ],
        "faqs": [
            ("How can I practise rebuttals on my own?", "Take the arguments you expect to face, find each one's weakest link with Attack, write a short block, and deliver it against a timer. Then ask the AI for the best reply to your block and prepare an answer."),
            ("How long should a rebuttal response be?", "Most single responses should take under a minute. Total rebuttal time depends on the format, from four minutes in Public Forum to most of an eight-minute WSDC speech."),
            ("What is the difference between a rebuttal and a block?", "A block is a rebuttal prepared before the round for an argument you expect. In the round you adapt the block to what the opponent actually said."),
            ("Can the AI predict my opponent's arguments?", "Yes. Each generated case includes \"If they say…\" answers: the claims the other side is likely to make, each with a reply, which is a practical list of arguments to prepare blocks against."),
            ("How do I stop dropping arguments?", "Flow every speech, mark each opposing argument as answered or not, and group similar arguments so one response covers several. Practise against a timer until it becomes routine."),
        ],
    },
    "how-to-practice-rebuttals": {
        "modified": "2026-10-28",
        "features": [
            ("A weekly drill plan", "Four short sessions a week, each training one rebuttal skill: choosing what to answer, challenging reasons, grouping responses and weighing under time."),
            ("Drills that work alone or with a partner", "Shadow rebuttals, flip-the-flow, one-sentence answers and rapid-fire rounds, with a version for solo practice and one for teams."),
            ("A way to measure progress", "A five-point checklist to score each practice rebuttal, so you can tell whether the drills are changing your speeches."),
        ],
        "sections": [
            ("Why rebuttal is a separate skill", [
                "Most debaters can write a decent case with enough time. Rebuttal is harder because it happens live: you hear an argument once, decide whether it matters, find the flaw, and explain it in under a minute while the judge is still listening. None of those steps improve by reading more about debate. They improve with repetitions that copy the pressure of a round.",
                "Good rebuttal practice therefore has three features. It uses arguments you did not write, so you cannot rely on knowing the answer in advance. It runs against a clock, so you learn to choose. And it ends with feedback on one specific thing, so the next repetition is different from the last. The drills below are built around those three rules.",
            ]),
            ("The shape of a rebuttal speech", [
                "The drills train four moves, and a finished rebuttal speech makes all four in this order:",
                {"steps": [
                    "Select. Name the clash that decides the round and answer it first. Do not try to answer every argument.",
                    "Challenge the reason behind the claim (debaters call this the warrant). Show why that reason fails to prove the point.",
                    "Extend. Bring back your own strongest argument, show it survived their responses, and say what it still proves.",
                    "Frame the ballot. End by telling the judge why your side wins the clash that matters. If you do not give them that story, they will write their own.",
                ]},
            ]),
            ("A four-session weekly plan", [
                "Each session takes 20 to 30 minutes. Run them in this order, because each one depends on the skill before it.",
                {"steps": [
                    "Selection (Monday). Read or listen to a full opposing constructive. Without answering anything, write down the one argument that decides the round if it stands, and one sentence saying why. Repeat with three different speeches. The goal is to stop treating every argument as equally important.",
                    "Challenging reasons (Tuesday). Take five opposing claims and, for each, write the reason the other side gives for it. Then write one sentence attacking that reason, not the claim. If they give no reason, point out that they have not explained why the claim is true.",
                    "Grouping (Thursday). Take a speech with six or more arguments and sort them into two or three groups that share an assumption. Answer each group once. This is the skill that saves the shortest rebuttal speeches in every format.",
                    "Weighing under time (Friday). Give a full rebuttal speech against the clock, and finish with thirty seconds that compare your impact with theirs on one measure: probability, magnitude, timeframe or who is affected.",
                ]},
                "If you have a fifth session, use it for a full practice round so the separate skills come together in one speech.",
            ]),
            ("Seven rebuttal drills", [
                {"h3": "Shadow rebuttal"},
                "Watch a recorded round or read a transcript, pause after each constructive, and give the rebuttal you would have given. Then compare it with what the real speaker said. You get high-level opposing arguments without needing an opponent.",
                {"h3": "Flip the flow"},
                "Take your own case and rebut it as if you were on the other side. The weak points you find are the ones a good opponent will find too, so fix them before the round instead of during it.",
                {"h3": "One-sentence answers"},
                "A partner reads a claim; you have ten seconds to answer in one sentence. The drill trains you to lead with the response instead of with a long setup. Keep a list of the sentences that worked.",
                {"h3": "Rapid fire"},
                "A partner reads eight short arguments in two minutes. You have two minutes to answer them all. Most debaters run out of time on the first three, which is exactly the habit the drill is meant to break: group, prioritise, move on.",
                {"h3": "Response ladder"},
                "For one argument, write five different responses: deny the claim, challenge the reason, reduce the claimed harm, turn it and outweigh it. Then rank them. Practising all five shows you which kind of response you lean on too much.",
                {"h3": "Drop audit"},
                "After a practice round, go through your flow and circle every opposing argument you did not answer. For each one, decide whether dropping it was a choice or an accident. Accidents are what you drill next.",
                {"h3": "Spar the \"If they say…\" claims"},
                "In {product}, generate a case on your side and read its \"If they say…\" answers. Paste the strongest opposing claim into Attack to see where it breaks, then run a Sparring round and answer it live. The verdict tells you whether your answer changed the outcome.",
            ]),
            ("Worked example: from first attempt to clean rebuttal", [
                {"example": {"title": "Motion: This house would lower the voting age to 16", "rows": [
                    ("Opposing argument:", "Sixteen-year-olds lack the life experience to make informed political choices, so lowering the voting age would worsen the quality of democratic decisions."),
                    ("First attempt:", "That is not true, plenty of sixteen-year-olds are very mature and some adults are not informed either, so it is unfair to single out young people."),
                    ("What went wrong:", "The answer is a counter-assertion followed by a fairness point. It never tests the idea that experience produces better choices or explains why the judge should doubt it."),
                    ("Rebuilt response:", "Their argument needs experience to be the thing that makes a vote informed. But we do not test experience for any other voter. Information comes from education, and sixteen-year-olds are still in school, studying the systems they would vote on."),
                    ("Weighing line:", "Even if some young voters are less informed, that harm is small and spread thin, while excluding a whole age group from decisions that affect them for longest is certain and lasting."),
                    ("Timed version:", "Forty seconds: name their reason, show it is not applied to anyone else, give the alternative mechanism, close with the weighing."),
                ]}},
                "The rebuilt version is not more clever than the first attempt. It is more organised: it names what the opponent needs, explains why they do not have it, and tells the judge what that means for the round.",
            ]),
            ("Build a block file", [
                "A block is a short prepared answer to an argument you expect, and a block file is your collection of them. Good blocks make rebuttals faster and more precise, because the thinking happens before the round and the speech only has to adapt it.",
                {"steps": [
                    "Organise by clash, not by source. Put every answer to \"the policy costs too much\" under one heading, whichever card it uses.",
                    "Write blocks for both sides of each clash, since you will usually debate both.",
                    "Give each block a tag, two to four numbered answers, the evidence for each, and a closing weighing line.",
                    "Keep each block short enough to read in under a minute, so you can use two or three in one speech.",
                    "After every tournament, rewrite the blocks that failed and add the arguments you did not expect.",
                ]},
                {"example": {"title": "Example block: answering \"a four-day school week saves money\"", "rows": [
                    ("1.", "Savings are small: buses and some staff costs fall, but salaries, which are most of a school budget, do not."),
                    ("2.", "Costs move to families, who pay for childcare on the fifth day."),
                    ("3.", "Even if the school saves money, it is buying the saving with less teaching time, which is the thing schools exist to provide."),
                    ("Weighing line:", "A small budget saving does not outweigh a lasting loss of learning time."),
                ]}},
                "AI is useful for the first draft of a block file: ask for the arguments you are likely to face and a first answer to each. Then check every factual claim against an original source and rewrite the answers in your own words, so you can deliver them without reading.",
            ]),
            ("How to judge your own practice", [
                "Record your practice rebuttals, or have a partner listen, and score each speech on five questions. Give one point for each yes.",
                {"list": [
                    "Did I answer the argument that decided the round first?",
                    "Did each response challenge a reason, or at least say which part of the argument it targets?",
                    "Did I group similar arguments instead of answering them one by one?",
                    "Did I explain why my response matters for the decision, not just that it is true?",
                    "Did I finish inside the time without rushing the last point?",
                ]},
                "A score of three is a solid novice rebuttal; five is what you are aiming for before a tournament. Track the scores across a few weeks. If one question keeps getting a no, drop the other drills and run the one that trains it.",
            ]),
            ("Format notes for timing practice", [
                {"h3": "Public Forum (PF)"},
                "Rebuttals are four minutes. The second-speaking team usually spends part of that time answering responses to its own case, so practise a split: about two and a half minutes on offence and a minute and a half rebuilding. The {product} timer has a Public Forum preset for the full speech order.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The four-minute first affirmative rebuttal must answer a seven-minute negative constructive. Group similar responses and use the same judging test across them, so you can answer every major argument with time left to defend your strongest point.",
                {"h3": "World Schools (WSDC)"},
                "Rebuttal runs through every substantive speech. Practise opening each speech with ninety seconds to two minutes of rebuttal before your own material, and for third speakers, practise organising the whole debate into two or three clashes.",
                {"h3": "British Parliamentary (BP)"},
                "With seven-minute speeches and four teams, the drill that matters most is selection: which of the previous speeches' arguments actually need an answer from your position. Practise naming the bench you are responding to before each response.",
            ]),
        ],
        "faqs": [
            ("How often should I practise rebuttals?", "Short, frequent sessions work better than one long one. Three or four sessions of 20 to 30 minutes a week, each focused on one skill, will improve a rebuttal faster than a single full practice round."),
            ("Can I practise rebuttals without a partner?", "Yes. Shadow rebuttals from recorded rounds, flipping your own case and answering a predicted opponent case all work alone. An AI opponent adds a responsive voice when no partner is available."),
            ("What should I practise first as a new debater?", "Selection. Learn to pick the one or two arguments that decide the round before you work on speed or style. Answering the right argument badly still beats answering the wrong one well."),
            ("How do I know if my rebuttal practice is working?", "Score each practice speech on the same five questions: right argument first, reason challenged, arguments grouped, importance explained, finished on time. Rising scores over a few weeks mean the drills are working."),
            ("How should I structure a rebuttal speech?", "Answer the clash that decides the round first, challenge the reasons behind the claims, extend your own strongest argument, and finish by telling the judge why your side wins."),
            ("Should I memorise rebuttals?", "Memorise the structure and a few strong lines, not whole speeches. In round you need to adapt each response to what the opponent actually said."),
            ("What is a block file?", "A collection of short prepared answers to the arguments you expect, organised by clash and written for both sides, so rebuttals start from tested material."),
        ],
    },
    "ai-rebuttal-generator": {
        "modified": "2026-10-28",
        "features": [
            ("Weaknesses ranked by damage", "Attack quotes the exact words it is targeting, names the broken link and orders the weaknesses from critical to minor."),
            ("Responses you can say", "Each weakness comes with one to three sentences written to be spoken in round, not a description of what you could argue."),
            ("Cross-ex questions and weighing", "Get questions tied to each weakness, a check for fallacies and an analysis of the weighing the argument is missing."),
        ],
        "sections": [
            ("What a good rebuttal generator should give you", [
                "Generic AI tools answer the request to rebut an argument by writing a counter-essay: a few paragraphs on why the other side is wrong. That is rarely usable. In a round you need to know which part of the argument to attack, what the flaw is called, and what to say in the next forty seconds.",
                "Attack in {product} is built around that need. Paste an argument or a full case and it returns a structured critique. Every weakness has to do three jobs: quote the exact words it attacks, explain why the link fails and why that matters for the ballot, and give a response you can say word for word. If the argument has fewer real weaknesses, it returns fewer rather than inventing problems.",
            ]),
            ("What one Attack analysis contains", [
                {"list": [
                    "An overall assessment: a score out of 100, a short summary and what the argument does well, so you know which parts not to waste time on.",
                    "Weaknesses, usually three to six, each marked critical, major or minor and labelled as evidential, logical or structural.",
                    "For each weakness: the quoted words, why the link is weak (no reason it is true, no evidence, no link, not unique to their side, turned or outweighed), and a response to say in round.",
                    "Fallacies detected, with where they appear and how to call them out without sounding like a textbook.",
                    "Cross-examination questions, each tied to one weakness and written so that a short honest answer exposes the gap.",
                    "A weighing analysis: the weighing the argument relies on, the comparisons it never makes, and how to out-weigh it.",
                ]},
                "Attack also runs web research on the argument, so responses can point to counter-evidence. Treat any evidence it mentions as a lead and check the original source before you use it.",
            ]),
            ("Settings that change the output", [
                {"h3": "Attack intensity"},
                "Mild gives constructive criticism, useful when you are checking your own case. Moderate balances strengths and weaknesses. Ruthless looks hardest for anything a strong opponent could exploit, which is what you want when preparing against an opposing case.",
                {"h3": "Judge paradigm"},
                "Logic-Heavy prioritises broken reasoning and points that never say why they are true. Values-Focused looks at principles and how the judge should decide, which suits Lincoln-Douglas and principled motions. Policy/Impact concentrates on links, probability and how big the harms and benefits are, which suits policy-style motions and Public Forum.",
                {"h3": "Fallacies and weighing"},
                "Both checks are on by default. Turn fallacy detection off when you only want substantive responses; keep weighing analysis on almost always, because unweighed rebuttal is the most common reason good responses do not win rounds.",
            ]),
            ("Worked example: one argument through Attack", [
                {"example": {"title": "Motion: This house would tax sugary drinks", "rows": [
                    ("Argument pasted:", "A sugar tax reduces consumption, because higher prices make people buy less. Lower consumption means less obesity, which saves lives and reduces the burden on public health systems."),
                    ("Critical weakness, logical:", "Quoted: lower consumption means less obesity. The argument assumes people who buy fewer sugary drinks do not replace those calories with other foods. Without that step, the health benefit does not follow from the mechanism."),
                    ("Response to say:", "Even if people buy fewer fizzy drinks, they can get the same sugar from sweets, juice and snacks that are not taxed. Cutting one source of calories is not the same as cutting calories."),
                    ("Major weakness, evidential:", "Quoted: saves lives. The argument gives no estimate of how much consumption falls or how that translates into health outcomes, so the judge cannot weigh the size of the benefit."),
                    ("Cross-ex question:", "If someone stops buying a sugary drink but buys a chocolate bar instead, has the tax reduced their sugar intake?"),
                    ("Weighing gap:", "The argument never compares its health benefit with the cost to low-income households, who spend a larger share of their income on these drinks. That comparison is your weighing."),
                ]}},
                "The useful part is not that the analysis disagrees with the argument. It identifies the one assumption the argument cannot survive without, gives you a sentence to attack it, and sets up a cross-ex question that makes the opponent concede it before your speech.",
            ]),
            ("From generated output to a rebuttal you own", [
                {"steps": [
                    "Start from the right input. Use a claim from the \"If they say…\" answers in a case you generated, an argument you heard in a previous round, or your own case when you want to find its weak points first.",
                    "Read the critical weaknesses and pick one. In a short speech, one well-explained weakness beats four rushed ones.",
                    "Rewrite the suggested response in your own words. Keep the structure (quote, flaw, response, why it matters) and cut anything you would not naturally say.",
                    "Check any evidence it relies on against the original source.",
                    "Time the response. Most single responses should fit in forty-five seconds.",
                    "Import the cross-examination questions into Crossfire and practise asking them against the AI, which answers from the opposing side.",
                    "Keep the analysis in your Current Debate so the block sits next to the case it answers.",
                ]},
            ]),
            ("Using generated rebuttals by format", [
                {"h3": "Public Forum (PF)"},
                "Use Policy/Impact for most PF resolutions. Prepare the response and the cross-ex question together, because PF crossfire is where you get the opponent to commit to the assumption you attack in rebuttal.",
                {"h3": "Lincoln-Douglas (LD)"},
                "Run Values-Focused on the negative case to find where its arguments fail to tie back to its own criterion. That gap often lets you win under their value and criterion as well as yours.",
                {"h3": "World Schools and British Parliamentary"},
                "Motions are often released shortly before the round, so use Attack in practice on likely arguments for motion areas you expect, and build a bank of responses to the reasoning that recurs across motions, such as slippery slopes, unproven behaviour change and ignored alternatives.",
            ]),
            ("What it cannot do", [
                "Attack responds to the text you give it. It cannot hear how your opponent actually framed an argument, and it cannot tell you what a particular judge will find persuasive. Most leagues also do not allow internet or AI tools during rounds, so it is a preparation tool: build and practise the blocks before the tournament, then adapt them by ear in the round.",
            ]),
        ],
        "faqs": [
            ("What does the AI rebuttal generator produce?", "A ranked list of weaknesses, each quoting the attacked words with an explanation and a response to say in round, plus detected fallacies, cross-examination questions and a weighing analysis."),
            ("Can I use it on my own case?", "Yes, and you should. Set the intensity to Mild or Moderate to find your weak points before an opponent does, then fix them or prepare an answer."),
            ("Is it allowed to use an AI rebuttal generator in a debate round?", "Most leagues restrict or ban internet and AI use during rounds. Check your league's rules and use the tool to prepare blocks beforehand."),
            ("Are the rebuttals backed by evidence?", "Attack runs web research and can point to counter-evidence. Treat anything it cites as a lead and check the original source before using it."),
            ("How is this different from asking a chatbot to rebut an argument?", "The output is structured for a round: each response targets quoted words, names the broken link and comes with a cross-ex question and weighing, instead of a general essay against the other side."),
        ],
    },
    "how-to-write-a-debate-case": {
        "modified": "2026-10-29",
        "features": [
            ("Motion analysis first", "Define the terms, write down what your side has to prove and find where the two sides disagree before writing a single argument."),
            ("Arguments that hold up", "Build each argument as a point, an explanation, evidence and why it matters, so a judge can follow it and an opponent cannot break it with one question."),
            ("A case you can defend", "Write \"If they say… we answer…\" replies to the obvious responses, cut what does not clash, and test the draft by attacking it yourself."),
        ],
        "sections": [
            ("What a debate case is", [
                "A debate case is the argument your side will defend for the whole round, organised so a judge can follow it on first hearing. It is not an essay. An essay can explore; a case has to survive an opponent whose job is to find the weakest sentence in it. That is why good cases are built from small, testable parts: an opening that tells the judge what you will prove, two to four arguments that each prove something specific, answers to what the other side will say, and a closing line the judge remembers.",
                "Every case {product} writes follows that shape, so you can hold a generated draft next to your own and compare them part by part. The process below works for every format. The format changes the length, the number of arguments and who gives which part, which the format section covers further down.",
            ]),
            ("Eight steps from motion to finished case", [
                {"steps": [
                    "Read the motion word by word. Note the actor (who does it), the action (what changes) and any word that sets the strength of the claim, such as should, would, ban, regulate or prioritise. A motion about regulating something is a different debate from one about banning it.",
                    "Define the key terms in plain language. Pick definitions that are fair and that a judge would accept without argument. A squirrelled definition wins the definition debate and loses the round.",
                    "Write down in one sentence what your side has to prove for the judge to vote for you. If you are proposing a policy, you usually need to show a problem, a mechanism and a net benefit. If you are opposing, you choose whether to defend the status quo, a counter-proposal or simply that the proposal does more harm than good.",
                    "Brainstorm widely, then cut hard. List every argument for your side, group the ones that share a reason, and keep the two to four groups that are strongest and most different from each other.",
                    "Build each argument in four parts: the point (what is true, in one sentence), the explanation (why it is true, step by step), the evidence (a source that backs it, named with its year) and why it matters (what it means for real people, and why that matters more than what the other side will say).",
                    "Write the opening: a hook that makes the judge listen, then one line that says what you will show, such as \"Today we will show two arguments that prove…\". In Lincoln-Douglas, your value and criterion go here too.",
                    "For each argument, write down what the other side is most likely to say and a short answer: \"If they say…, we answer…\". Put the answer to the most obvious response inside the argument itself, so the opponent's best attack does not sound new.",
                    "Finish with a closing line that ties back to the opening and a list of your sources. Then read the case aloud against a timer and cut until it fits with fifteen seconds to spare.",
                ]},
            ]),
            ("Worked example: a full case outline", [
                {"example": {"title": "Motion: This house would make public transport free", "rows": [
                    ("Side:", "Proposition."),
                    ("Definitions:", "Public transport means buses, trams and local trains run or funded by government. Free means no fare at the point of use, paid for from general taxation."),
                    ("What we have to prove:", "That removing fares produces benefits greater than the cost of replacing fare revenue."),
                    ("Opening:", "For a family on a low income, the bus fare to work can be the difference between taking a job and turning it down. Today we will show two arguments that prove free public transport is worth what it costs."),
                    ("Argument 1, access:", "Point: fares stop low-income people from reaching jobs and services. Explanation: transport is a fixed cost that takes a larger share of a small income. Why it matters: removing it widens the area in which people can work and study. Answer built in: discounted passes exist, but they require applications and proof of eligibility that many eligible people never complete."),
                    ("Argument 2, congestion and emissions:", "Point: free fares move some journeys from cars to public transport. Explanation: price is one of the things people consider when choosing how to travel. Why it matters: fewer car journeys reduce congestion and emissions for everyone in the city."),
                    ("Order:", "Argument 1 is the more certain benefit and reaches the people most affected, so it goes first; argument 2 is larger in scale but less certain, so it is an additional reason, not the case's foundation."),
                    ("If they say:", "The money is better spent on more frequent services."),
                    ("We answer:", "Frequency helps people who already ride; free fares reach people currently priced out, and the two are not mutually exclusive."),
                    ("Closing line:", "That is why free fares are the fairest way to pay for the buses a whole city depends on."),
                ]}},
                "Notice what the outline does not contain: a long introduction, rhetorical questions or a list of statistics without explanations. Every line either defines the debate, proves something, answers the other side or tells the judge what to remember.",
                "For the second speech in particular, the [worked example of how to prepare for a debate with AI](/how-to-prepare-for-a-debate-with-ai#worked-example) writes the two-minute reinforcement and the \"If they say… we answer…\" replies in full.",
            ]),
            ("How case structure changes by format", [
                {"h3": "Public Forum (PF)"},
                "A four-minute constructive usually fits two arguments, each with evidence, and sometimes a short explanation of how the judge should decide. Because you often do not know your side until shortly before the round, write a case for each side and keep them consistent in style. Put answers to the other side into the second constructive if you speak second.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The case starts with a value, the goal the judge should protect, and a criterion, the test for meeting that goal. Each argument then shows how your side passes the test. State that link at the end of every argument, because a good negative will attack any gap.",
                {"h3": "British Parliamentary (BP)"},
                "Opening Government sets the definition and, for policy motions, a model: what exactly happens, who does it and how it is enforced. Opening Opposition responds to that model. Closing teams do not write a full case of their own; they prepare an extension, a new line of analysis the opening half did not cover.",
                {"h3": "World Schools (WSDC)"},
                "The case is split between the first and second speakers under a single team line. The first speaker gives definitions, the burden and usually the first argument; the second speaker gives the remaining arguments. Write the split before you write the arguments, so neither speaker repeats the other.",
            ]),
            ("Checklist before you call the case finished", [
                {"list": [
                    "Can you state the whole case in two sentences?",
                    "Does every argument have an explanation you could give without your notes?",
                    "Is every piece of evidence one you have read in the original, with a full citation?",
                    "Does each argument say why it matters, and why that matters more than what the other side will argue?",
                    "Have you written an \"If they say…\" answer to the strongest response to each argument?",
                    "Does it fit in the time with room to slow down?",
                ]},
                "If any answer is no, fix that before you practise delivery. Polishing the speech of a case with a missing explanation only makes the gap harder to see.",
            ]),
            ("Where {product} helps", [
                "Once you have a draft, attack it before an opponent does. Paste an argument into Attack to see which link breaks first, use Brainstorm when you need more angles at step four, and use Factoids to research a single statement you want to rely on. If you would rather start from a draft, the case generator writes a ready-to-read case in the same shape: an opening, two to four arguments (three by default) with explanation, evidence and why it matters, \"If they say… we answer…\" replies, a closing line and sources. Cut and rewrite it with the steps above. For a second speech (R2), the draft brings no new arguments: about two minutes backing up the team's arguments, then about four minutes of \"If they say X, we answer Y\" blocks.",
            ]),
        ],
        "faqs": [
            ("How many contentions should a debate case have?", "Usually two to four arguments. Public Forum constructives often fit two; formats with longer speeches can take three or four. Fewer well-defended arguments beat many thin ones."),
            ("What goes into each argument?", "Say what is true, explain why it is true, give evidence you have checked and show why it matters. Add a short answer to the response you expect from the other side."),
            ("How long does it take to write a debate case?", "A first draft can take an hour once you have researched the topic. Expect to revise it several times after practice rounds expose its weak points."),
            ("Should I write my case word for word?", "In formats with prepared constructives, such as Public Forum and Lincoln-Douglas, most debaters do. In impromptu formats like BP and WSDC, prepare an outline and key lines instead."),
            ("How do I make a case harder to attack?", "Explain why every point is true, use evidence you have checked, answer the most obvious response inside each argument, and attack the draft yourself before the round."),
        ],
    },
    "debate-topics-for-students": {
        "modified": "2026-10-28",
        "features": [
            ("Topics by level", "Starter motions for new debaters, intermediate motions with more technical clash, and advanced motions for experienced teams."),
            ("Topics by format", "Motion wording for BP and WSDC, resolutions for Public Forum and value resolutions for Lincoln-Douglas."),
            ("From topic to first case", "How to tell a good practice motion from a weak one, and how to turn it into a case in one session."),
        ],
        "sections": [
            ("What makes a good debate topic", [
                "A good practice topic gives both sides real arguments. If one side has an obviously better case, the round teaches the losing side to cope with a bad position and the winning side very little. Before using a topic, check four things:",
                {"list": [
                    "Balance: could you write a strong case for either side in an hour?",
                    "Clash: do the two sides disagree about the same thing, or will they talk past each other?",
                    "Stakes: is there a real effect on real people, so impacts can be weighed?",
                    "Access: can students at this level understand the topic without specialist knowledge, or find material quickly?",
                ]},
                "The motions below are written to pass those checks. They are for practice; competitive leagues set their own topics, and the wording matters, so keep it exactly as written when you practise.",
            ]),
            ("Starter topics for new debaters", [
                "These rely on everyday experience, so students can argue them without research and focus on structure.",
                {"list": [
                    "This house would ban homework in primary schools. Clash: learning time against rest and family time.",
                    "This house would make school uniforms optional. Clash: equality and belonging against individual expression and cost.",
                    "This house would ban smartphones in secondary schools. Clash: attention and wellbeing against safety and digital skills.",
                    "This house believes that zoos do more harm than good. Clash: conservation against animal welfare.",
                    "This house would introduce a four-day school week. Clash: teacher retention and focus against childcare and lost instruction.",
                    "This house would require all students to learn a musical instrument. Clash: cultural and cognitive benefits against choice and resources.",
                    "This house believes that video games are good for young people. Clash: skills and community against time use and harm.",
                ]},
            ]),
            ("Intermediate topics", [
                "These need some background knowledge and reward weighing between competing values.",
                {"list": [
                    "This house would lower the voting age to 16.",
                    "This house would make voting compulsory.",
                    "This house would tax sugary drinks.",
                    "This house would make public transport free.",
                    "This house believes that social media companies should be legally liable for misinformation on their platforms.",
                    "This house would ban advertising aimed at children.",
                    "This house would replace exams with continuous assessment.",
                    "This house believes that wealthy countries should accept more climate refugees.",
                ]},
            ]),
            ("Advanced topics", [
                "These have technical clash, contested evidence and principled arguments on both sides.",
                {"list": [
                    "This house would introduce a universal basic income.",
                    "This house believes that developing countries should prioritise economic growth over environmental protection.",
                    "This house would ban the development of autonomous weapons.",
                    "This house believes that the rise of artificial intelligence will do more harm than good to workers.",
                    "This house would allow parents to genetically edit their children to prevent disease.",
                    "This house believes that international institutions should have the power to override national governments on climate policy.",
                ]},
            ]),
            ("Topics written for specific formats", [
                {"h3": "British Parliamentary and World Schools"},
                "Both use motions starting with This house would (a policy), This house believes that (a value judgment) or This house regrets (a judgment on something that has happened). Practise all three types, because each changes the burden. A regret motion such as This house regrets the rise of influencer culture asks you to compare the world as it is with a world where that thing never happened.",
                {"h3": "Public Forum"},
                "PF uses resolutions that name an actor and a policy, written to be argued by a general audience. Practice examples: Resolved: Schools should replace letter grades with pass or fail grading. Resolved: The benefits of nuclear energy outweigh the harms. Resolved: Governments should ban single-use plastics.",
                {"h3": "Lincoln-Douglas"},
                "LD resolutions ask about values and obligations. Practice examples: Resolved: Individuals have a moral obligation to help those in need. Resolved: A just society ought to prioritise equality over liberty. Resolved: Civil disobedience in a democracy is morally justified.",
            ]),
            ("Worked example: turning a topic into a first case", [
                {"example": {"title": "Motion: This house would replace exams with continuous assessment", "rows": [
                    ("Key terms:", "Continuous assessment means grades built from coursework, projects and regular tests across the year, instead of one final exam."),
                    ("Proposition burden:", "Show continuous assessment measures learning more fairly or more accurately than exams, without new harms that outweigh that."),
                    ("Proposition angle:", "Exams reward performance on one day, so anxiety, illness or a bad night's sleep can outweigh a year of work."),
                    ("Opposition angle:", "Coursework is easier to get help with at home, so it favours students with educated or wealthy parents."),
                    ("The clash:", "Which system is the more accurate measure of what a student can do on their own?"),
                    ("Weighing question:", "Is the unfairness of a single bad day larger or smaller than the unfairness of unequal help at home?"),
                ]}},
                "Ten minutes of this analysis gives a team enough to start writing arguments. The clash and the weighing question tell both sides where the round will be decided.",
            ]),
            ("How to use a topic list in practice", [
                {"steps": [
                    "Pick a topic and flip a coin for sides, so students practise arguing positions they do not hold.",
                    "Give fifteen minutes of preparation for impromptu formats, or a week for prepared formats.",
                    "Run the round with real speech times.",
                    "Debrief on one question: where was the clash, and who won it?",
                    "Rerun the same topic with sides swapped. The second round is usually much better, because each team now knows the other side's best arguments.",
                ]},
                "For a quick random pick, the [free debate motion generator](/tools/debate-motion-generator) draws a practice motion by topic and difficulty, with no account.",
                "In {product}, start a Current Debate with the motion and run Brainstorm to see angles for both sides, generate a case with \"If they say…\" answers to the other side, or run a Sparring round against the AI when there is no second team available.",
            ]),
        ],
        "faqs": [
            ("What are good debate topics for beginners?", "Topics students already know from daily life, such as homework, school uniforms, smartphones in school or a four-day school week. They let new debaters focus on structure instead of research."),
            ("How do I know if a debate topic is balanced?", "Try writing a short case for each side. If one side struggles to find two serious arguments, the topic is unbalanced and will make a poor practice round."),
            ("What is the difference between a motion and a resolution?", "They mean the same thing in different formats. BP and World Schools use motions such as This house would; Public Forum and Lincoln-Douglas use resolutions beginning Resolved."),
            ("Where do competition debate topics come from?", "Each league or tournament sets its own. Some publish topics in advance for prepared formats; others release motions shortly before each round. Practise with your league's past topics when they are available."),
            ("Can AI help me prepare for a debate topic?", "Yes, for brainstorming angles, drafting a first case structure and predicting the other side. Check any facts against original sources and write the final case in your own words."),
        ],
    },
    "public-forum-debate": {
        "modified": "2026-10-29",
        "features": [
            ("The PF round, speech by speech", "What each of the eight speeches and three crossfires is for, with the standard times."),
            ("Summary and final focus that agree", "How to collapse to two issues in summary and extend exactly those into final focus."),
            ("Practice with real PF times", "Run full Public Forum rounds against an AI opponent at 4-4-3-2 speech times, and drill cross-examination separately."),
        ],
        "sections": [
            ("How a Public Forum round works", [
                "Public Forum is a two-on-two format built for a general audience. Resolutions are about current issues, speeches are short, and judges are often parents, teachers or community members rather than former competitors. That shapes everything: a PF case wins by being clear and well evidenced, not by being fast or technical.",
                "Before the round, a coin toss decides which team chooses first between side (pro or con) and speaking order. Under the common NSDA rules, a round runs like this:",
                {"steps": [
                    "First speaker, team A: constructive, 4 minutes.",
                    "First speaker, team B: constructive, 4 minutes.",
                    "First crossfire between the two first speakers, 3 minutes.",
                    "Second speaker, team A: rebuttal, 4 minutes.",
                    "Second speaker, team B: rebuttal, 4 minutes.",
                    "Second crossfire between the two second speakers, 3 minutes.",
                    "First speaker, team A: summary, 3 minutes.",
                    "First speaker, team B: summary, 3 minutes.",
                    "Grand crossfire between all four debaters, 3 minutes.",
                    "Second speaker, team A: final focus, 2 minutes.",
                    "Second speaker, team B: final focus, 2 minutes.",
                ]},
                "Each team also has a few minutes of preparation time to use between speeches, usually three. Check your league's rules, because some tournaments vary times and evidence rules.",
                "The [free debate timer](/tools/debate-timer) runs this whole order, crossfires and each team's prep time included.",
            ]),
            ("What each speech has to do", [
                {"h3": "Constructive"},
                "Present your case, usually two arguments, each with an explanation, evidence and why it matters. Many teams also tell the judge how to compare the two sides. The second constructive can include a few responses to the first if time allows.",
                {"h3": "Rebuttal"},
                "Answer the opponent's case. The team speaking second should also answer the attacks already made on its own case, because arguments left unanswered after second rebuttal are very hard to bring back.",
                {"h3": "Summary"},
                "Collapse. Choose the one or two issues you are winning, explain their reasons and evidence again, answer what the opponent said about them, and start weighing. Everything you want in final focus has to be in summary.",
                {"h3": "Final focus"},
                "Tell the judge why you win in two minutes. Extend only what was in your summary, weigh it against the opponent's best remaining argument, and give the judge a simple reason to sign the ballot.",
                {"h3": "Crossfire"},
                "Crossfire is a question period, not a speech. Use it to clarify the opponent's evidence, get them to commit to an assumption you will attack, and set up your next speech. Judges notice who stays calm and precise.",
            ]),
            ("Worked example: one PF round in outline", [
                {"example": {"title": "Practice resolution: Resolved: Schools should replace letter grades with pass or fail grading", "rows": [
                    ("Pro argument 1:", "Letter grades push students toward safe courses they know they can ace; pass or fail grading encourages them to take harder classes and learn more."),
                    ("Pro argument 2:", "Grade pressure is a leading source of student stress, and removing fine-grained grades reduces it without removing accountability."),
                    ("Con argument 1:", "Letter grades give students specific feedback about how well they understood the material; pass or fail hides the difference between barely passing and mastery."),
                    ("Con argument 2:", "Colleges and scholarships use grades to compare applicants; without them, they rely more on test scores and extracurriculars that favour wealthier students."),
                    ("First crossfire question from Pro:", "Is a letter grade the only way a teacher can tell a student how well they understood the material?"),
                    ("Pro summary collapse:", "Keep argument 1 and turn the con's feedback argument: comments and rubrics give better feedback than a single letter, so pass or fail grading loses nothing on feedback and gains course choice."),
                    ("Con final focus weighing:", "Even if some students take harder courses, the equity harm in admissions affects every student who applies, and it falls on those with the fewest alternatives."),
                ]}},
                "The round is decided by which team frames the comparison between learning (Pro) and fair admissions (Con), and keeps that frame consistent from summary to final focus.",
            ]),
            ("Five habits of strong PF teams", [
                {"list": [
                    "They write cases for both sides, because they often learn their side only shortly before the round.",
                    "They read evidence carefully and can produce the full source if asked. Evidence disputes are common in PF, and a misrepresented card can lose the round.",
                    "They plan the collapse before the round: which argument each side would focus on, and why.",
                    "They weigh from the rebuttal onward instead of saving it for final focus.",
                    "They adapt to lay judges: fewer arguments, clear signposting, a normal speaking pace and a story the judge can repeat.",
                ]},
            ]),
            ("Common PF mistakes", [
                {"list": [
                    "Bringing new arguments into final focus that were not in summary. Most judges ignore them.",
                    "Spending crossfire making speeches instead of asking questions.",
                    "Second rebuttal that only attacks and never defends the team's own case.",
                    "Summaries that try to extend everything and end up extending nothing well.",
                    "Evidence quoted without author, date or source, which invites a challenge you cannot answer.",
                ]},
            ]),
            ("Practising Public Forum in {product}", [
                "Sparring runs Public Forum rounds with pro and con constructives, rebuttals, summaries and final focuses at the 4-4-3-2 times above, ending with a judged verdict. The simulated round leaves out the crossfire periods, so practise questioning separately in Crossfire. Despite the shared name, that feature is a cross-examination drill: you either question the AI, which answers from the opposing side, or let it question you about your case.",
                "A useful preparation loop: start a Current Debate with the resolution, generate a case for each side, paste the opposing case into Attack to find its weakest links, run a Sparring round on your assigned side, and finish by checking whether your final focus extended only what your summary did. The timer's Public Forum preset covers the same eight speeches when you practise with a partner.",
                "Comparing PF tools? See [the best AI for Public Forum](/best-ai-for-public-forum).",
            ]),
        ],
        "faqs": [
            ("How long is a Public Forum round?", "The speeches and crossfires take 35 minutes, plus each team's preparation time, so most rounds run around 45 minutes."),
            ("How many contentions should a PF case have?", "Usually two arguments. A four-minute constructive rarely fits more than two with a clear explanation, evidence and why each matters."),
            ("What is the difference between summary and final focus?", "Summary narrows the round to the issues you are winning and begins the weighing. Final focus extends only those issues and tells the judge why they decide the ballot."),
            ("Can I bring up new arguments in final focus?", "No. New arguments in final focus are generally ignored by judges, because the opponent has no chance to answer them. Anything you want in final focus should be in your summary."),
            ("How do I prepare for a lay judge in PF?", "Run fewer arguments, explain each one plainly, signpost clearly, speak at a normal pace and end every speech with a simple reason to vote for you."),
        ],
    },
    "debateowl-vs-chatgpt": {
        "software": True,
        "modified": "2026-10-29",
        "features": [
            ("A general assistant", "ChatGPT can brainstorm, explain, draft and revise on any subject, including debate."),
            ("A debate workspace", "{product} organises prep around one motion at a time, with structured cases, an AI opponent, a timer and judged practice rounds."),
            ("Using both", "Where each tool fits in a week of debate preparation, and how to move work between them."),
        ],
        "sections": [
            ("The short answer", [
                "ChatGPT is a general-purpose AI assistant. {product} is a debate practice workspace. Both use large language models, but they are designed for different jobs. If you want to explore an idea, learn background on a topic or tighten a paragraph, a general assistant is flexible and fast. If you want to prepare a specific motion, practise against an opponent at real speech times and get a verdict on your round, a tool built around debate structure saves the setup you would otherwise do by hand in every conversation.",
                "Many debaters use both. This page explains where each is stronger so you can decide what fits your preparation.",
                {"table": {"caption": "{product} vs ChatGPT for debate prep (as of October 2026)", "head": ["Feature", "{product}", "ChatGPT"], "rows": [
                    ["Structured case output", "Every case has an opening, arguments with explanation, evidence and why it matters, \"If they say… we answer…\" replies, a closing line and sources", "Whatever structure you ask for, in each conversation"],
                    ["Saved sources (Library)", "Sources you add to a debate's Library are given to its prep tools", "You paste the motion and your sources into each new conversation"],
                    ["Web research with a source list", "Generate researches the motion on the web and lists the sources it found; Ask can answer with citations", "Not tied to one debate; nothing is saved to a Library"],
                    ["Timed practice round with a verdict", "Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds, times each speech and ends with a verdict", "No built-in round, timing or verdict; you role-play and keep time yourself"],
                    ["Cross-examination drill", "Crossfire drills cross-examination in either direction", "Role-play on request"],
                    ["Debate timer", "A [free debate timer](/tools/debate-timer) for seven formats, plus a speech timer in the app", "None built in"],
                    ["Formats", "Case generation, Attack, Ask and Crossfire work for any motion; Sparring has three formats", "Any format you describe"],
                    ["Languages", "English, Spanish and Hungarian", "Not compared here"],
                    ["Price", "3-day free trial, then {pro_price}", "Free tier and paid plans; prices not compared here"],
                ]}},
            ]),
            ("What ChatGPT does well for debaters", [
                {"list": [
                    "Background learning: explaining an unfamiliar topic, the main positions in a policy area or a philosophical idea behind a value resolution.",
                    "Open brainstorming: generating many possible angles quickly, including unusual ones.",
                    "Writing help: tightening a sentence, simplifying a paragraph for a lay judge or suggesting a clearer tag line.",
                    "Flexibility: it handles any request, so you can use it for tasks no debate tool was built for.",
                ]},
                "Those are real strengths. The limits come from the same flexibility: a general chat does not know which motion you are preparing, which side you are on, what format you debate or what sources you trust, unless you tell it again, and it has no concept of a round to practise in.",
            ]),
            ("What a debate workspace adds", [
                {"h3": "One motion, one place"},
                "In {product}, everything belongs to a Current Debate: the motion, the Library sources you have added, generated cases, Attack analyses, practice rounds and debriefs. The prep tools read that context, so you never paste the motion and your research into a new conversation.",
                {"h3": "Structured output"},
                "Generated cases always have the same parts: an opening, arguments with explanation, evidence and why each matters, \"If they say… we answer…\" replies to the other side, a closing line and a source list. Attack always returns ranked weaknesses that quote the attacked words, with a response to say in round, cross-examination questions and a weighing analysis. Fixed structure makes the output easier to check and to turn into speeches.",
                {"h3": "Timed practice rounds"},
                "Sparring runs full rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas and Public Forum, with each speech timed, and ends with a verdict that names the reason for the decision. Crossfire drills cross-examination in either direction. A speech timer covers Standard, Lincoln-Douglas, Public Forum and Policy speech orders.",
                {"h3": "Sources you control"},
                "Sources you add to the Library and mark active are given to the prep tools for that debate, which use the ones that fit each request. Ask can answer with citations, and Factoids researches a single claim. Evidence still needs checking against the original, as with any AI tool.",
            ]),
            ("Worked example: the same task in both tools", [
                {"example": {"title": "Task: prepare to answer the opposition on This house would make voting compulsory", "rows": [
                    ("In a general chat:", "You describe the motion, your side and your format, then ask for the opposition's arguments. You get a useful list. To get responses, you ask again; to check one argument in depth, you paste it back; to practise, you would need to role-play a round and keep track of time yourself."),
                    ("In {product}:", "You start a Current Debate with the motion, generate your proposition case and read its \"If they say…\" answers to the opposition. You paste the strongest opposition argument into Attack, which returns its weakest link, a response to say and a cross-ex question. You import the questions into Crossfire to practise them, then run a timed Sparring round and read the verdict."),
                    ("The difference:", "Individual sentences can be similar in quality. What changes is how much setup you repeat, and whether you end up practising a round or only reading text."),
                ]}},
            ]),
            ("Which should you use?", [
                {"list": [
                    "Learning about a topic from scratch: a general assistant is a good start.",
                    "Writing a case for a specific motion: a debate workspace gives a consistent structure and answers to what the other side will say.",
                    "Finding the weak point in an opposing argument: a tool that returns structured weaknesses and responses is faster to use in prep.",
                    "Practising speeches and rounds: you need timing, an opponent and a verdict, which a general chat does not provide.",
                    "Polishing wording: either works; use the one you are already in.",
                ]},
                "A practical split is to use a general assistant for open-ended learning and {product} for motion-specific preparation and practice. [ChatGPT vs Claude for debate](/chatgpt-vs-claude-for-debate) is the page for where each general chatbot fits, and when a debate tool saves the setup.",
            ]),
            ("Things that are true of both", [
                "Both can state things confidently that are not true, so neither replaces reading original sources before you quote them. Neither should be used during a round where your league forbids electronic help, which is most leagues. And neither replaces a coach or teammates who have watched you debate.",
            ]),
        ],
        "faqs": [
            ("Is {product} better than ChatGPT for debate?", "For motion-specific preparation and practice rounds, a dedicated workspace saves setup and adds timing, an AI opponent and verdicts. For open-ended learning and general writing, ChatGPT is more flexible. Many debaters use both."),
            ("Can I practise a debate round with ChatGPT?", "You can ask it to role-play an opponent, but you have to manage the format, the speech order and the timing yourself, and there is no built-in verdict. {product}'s Sparring runs the round structure for you."),
            ("Does {product} keep my debate prep organised?", "Yes. Cases, sources, analyses and practice rounds are saved inside the Current Debate they belong to, behind sign-in."),
            ("Do I still need to check evidence from either tool?", "Yes. Any AI tool can produce errors or misread sources. Open the original and confirm the exact claim before you use it in a round."),
            ("Which formats does {product} support?", "Case generation, Attack, Ask and Crossfire work for any motion. Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds, and the timer adds a Policy preset."),
        ],
    },
    "online-debate-timer": {
        "modified": "2026-10-27",
        # The first sentence under the H1 points at the timer itself, which owns "online debate timer".
        "lead": "Need the timer itself? The free {product} debate timer at [/tools/debate-timer](/tools/debate-timer) loads these times for you. Below: speech lengths, cross-examination and prep time for each format, and how to practise against the clock.",
        "features": [
            ("Speech times by format", "The speech order and lengths for Public Forum, Lincoln-Douglas, Policy, British Parliamentary and World Schools under their common rules."),
            ("Cross-ex and prep time", "How long questioning periods and prep time run in each format, next to the speeches."),
            ("Drills against the clock", "Short timed drills that build pacing, from thirty-second blocks to a full round in speaking order."),
        ],
        "sections": [
            ("Timing changes strategy", [
                "A strong argument still loses if it arrives too late or runs too long. Speaking against the clock forces the choices a round will force anyway: which argument goes first, which one gets cut, and how much time the weighing needs.",
                "Most debaters overestimate how much they can say in a minute. A timed run of a speech you thought was four minutes long usually shows where the time actually goes, and that is the first thing to fix.",
            ]),
            ("Speech times by format", [
                "These are the speech lengths under each format's most common rules. Leagues and tournaments change them, so check the invitation before you practise.",
                # Built from src/lib/free-tools/formats.ts, the free timer's own data, by generate_seo_content.py.
                {"speech_times": True},
                "Public Forum's three crossfires follow the constructives, the rebuttals and the summaries; the last is a grand crossfire for all four debaters. British Parliamentary teams prepare for 15 minutes after the motion is released, Asian Parliamentary teams for 30 minutes, and World Schools impromptu motions come with one hour.",
                "The [free debate timer](/tools/debate-timer) runs any of these speech orders, cross-examination, crossfire and prep time included, with no account. It also has Asian Parliamentary and the school 4-6-6-3 format.",
            ]),
            ("What the {product} timer covers", [
                "Inside the {product} app, choose a format and the timer loads its speech order. Each speech has its own length, and moving to the next speaker resets the clock for that speech.",
                {"list": [
                    "Standard (4-6-6-3): introductor, two refutation speeches and a conclusor.",
                    "Lincoln-Douglas: 6-minute affirmative constructive, 7-minute negative constructive, 4-minute first affirmative rebuttal, 6-minute negative rebuttal and 3-minute second affirmative rebuttal.",
                    "Public Forum: four 4-minute constructive and rebuttal speeches, two 3-minute summaries and two 2-minute final focus speeches.",
                    "Policy: four 8-minute constructives and four 5-minute rebuttals.",
                ]},
                "The app presets cover speeches only, with no cross-examination, crossfire or prep time on the clock, and there is no World Schools or British Parliamentary preset. The [free debate timer](/tools/debate-timer) covers all of those.",
            ]),
            ("Drills to run against the clock", [
                {"steps": [
                    "Thirty-second blocks. Deliver one prepared rebuttal block in thirty seconds. If it runs over, cut the setup, not the response.",
                    "Full speech. Give a whole constructive at its real length. Note where the one-minute beep lands; if you are still on your first argument, the structure needs work.",
                    "Short-clock rebuttal. Give a rebuttal with a minute less than the format allows. The real speech will then feel like it has room for weighing.",
                    "Cross-ex timing. Run a three-minute question period against the clock and count how many questions actually led somewhere.",
                    "Full round order. Step through the whole format with a partner, using the arrow keys to move between speakers, so you practise the gaps as well as the speeches.",
                ]},
                "Drill one skill per session. A timer shows how long a speech took, not why, so the next step matters as much as the timing.",
            ]),
            ("Pair timing with feedback", [
                "After each timed speech, write down three things: where the one-minute signal caught you, what you cut, and what you would cut next time. Then fix one of them and run the speech again.",
                "For feedback on the content, run the same speech in a Sparring round in {product}. The verdict says which arguments carried the round and which ones the judge did not weigh, which is usually where the time went.",
            ]),
        ],
        "faqs": [
            ("How long is a debate speech?", "Between two and eight minutes, depending on the format and the speech. Public Forum final focus speeches are the shortest at two minutes; Policy constructives and World Schools substantive speeches run eight."),
            ("Which formats does the free debate timer support?", "Public Forum, Lincoln-Douglas, Policy, British Parliamentary, World Schools, Asian Parliamentary and the school 4-6-6-3 format, and you can build your own. The timer inside the {product} app has presets for Standard 4-6-6-3, Lincoln-Douglas, Public Forum and Policy."),
            ("Does the timer include prep time or cross-examination?", "The free debate timer does: it times cross-examination and crossfire as part of the round and keeps a prep bank for each side in Public Forum, Lincoln-Douglas and Policy. The timer inside the {product} app times speeches only."),
            ("Can I use the timer without looking at the screen?", "Yes. It beeps once at one minute remaining and twice at time up, and you can turn the sound on or off."),
            ("What keyboard shortcuts does the timer have?", "Space starts and stops the clock, R resets it, and the arrow keys change speaker."),
            ("How often should I practise against a timer?", "Every time you practise a speech. Short timed drills several times a week build pacing faster than one long session."),
            ("How long is a Public Forum speech?", "Under NSDA rules, constructives and rebuttals are 4 minutes, summaries 3 minutes and final focus speeches 2 minutes. Each team also gets 3 minutes of prep, and the three crossfires run 3 minutes each."),
            ("How long is a Lincoln-Douglas round?", "About 40 minutes under NSDA times: 26 minutes of speeches (6, 7, 4, 6 and 3), two 3-minute cross-examinations and 4 minutes of prep per debater, plus the gaps between speeches and the judge's decision."),
            ("What is protected time in British Parliamentary?", "The first and last minute of each 7-minute speech, when points of information may not be offered. Under the WUDC manual, POIs are allowed from 1:00 to 6:00, signals sound at 1:00, 6:00 and 7:00, and judges disregard material after 7:15."),
        ],
    },
    "argument-flowchart": {
        "modified": "2026-10-28",
        "features": [
            ("Visual clash maps", "Put your case's main line, each argument, the attacks on it and your answers on one canvas, so you can see where the round will be decided."),
            ("Link and strength tracking", "Mark each argument strong, moderate or weak, and connect nodes with support, attack and rebuttal links."),
            ("Saved with your debate", "Flowcharts save to the Current Debate next to its case and rebuttals, and export as a PNG for teammates."),
        ],
        "sections": [
            ("Why map arguments at all", [
                "Arguments are chains: a point depends on its explanation, the explanation on an assumption, and why it matters on all of them. When one link breaks, the whole argument falls. A flowchart makes the chain visible, so you can see which link the other side will attack and which link of theirs you should attack.",
                "A map also shows what a written case hides. Two arguments that rely on the same assumption look independent on paper; on a map they share a node, and one good response takes out both.",
            ]),
            ("How the {product} flowchart works", [
                "A new flowchart starts with a top node for your case's main line, three example arguments, an opponent attack and a rebuttal, all of which you can edit or delete. Each node has a label, a description and a type:",
                {"list": [
                    "Thesis: your case's main line, the one sentence your side has to prove.",
                    "Argument: one of your arguments, rated strong, moderate or weak.",
                    "Attack: an opposing response to one of your arguments.",
                    "Rebuttal: your answer to an attack.",
                    "Dropped: an argument nobody answered.",
                ]},
                "Links between nodes are support, attack or rebuttal, each drawn in its own style. Save the chart to the Current Debate, load it again later, or export it as an image.",
                "A generated case can build the map for you. Choose Flowcharts under the case: the opening's \"we will show\" line goes at the top, each argument becomes a node with its point and evidence, each \"If they say…\" claim becomes an attack, and our answer becomes the rebuttal to it.",
            ]),
            ("Build from the motion outward", [
                {"steps": [
                    "Write the main line as one sentence: what your side must prove for the motion.",
                    "Add each argument as a node and link it to the main line. Rate it honestly; a weak node is one to fix or cut.",
                    "For each argument, add the strongest attack you expect. If you have generated a case, its \"If they say…\" claims are the place to find them.",
                    "Add your rebuttal to each attack. Where you cannot write one, the map has found your gap.",
                    "At each clash, note in a node's description why your side of it matters more.",
                ]},
                "Build the opposing case the same way on a second chart. Most rounds turn on two or three clashes, and the two maps side by side show which ones.",
            ]),
            ("Worked example: mapping one clash", [
                {"example": {"title": "Motion: This house would ban single-use plastics", "rows": [
                    ("Main line:", "A ban cuts plastic pollution at its largest source."),
                    ("Argument (strong):", "Single-use items are a large share of plastic waste and are rarely recycled."),
                    ("Attack:", "Substitutes such as paper and glass have a higher carbon footprint per use."),
                    ("Rebuttal:", "The comparison only holds if reusable items are used a few times; reuse, not substitution, is the goal of the ban."),
                    ("Why ours matters more:", "Plastic pollution lasts for centuries and cannot be reversed, while the footprint of substitutes falls with every reuse."),
                ]}},
                "The map makes it obvious that the round turns on the substitution clash. That is where the rebuttal speech and the comparison should go.",
            ]),
            ("Use the map in your speeches", [
                "Before you speak, look for the path that wins: the strongest argument still standing after the attacks, and the reason it matters more than theirs. Speak to that path and drop the rest. A good map helps you collapse instead of spreading yourself thin.",
                "During a round, a written flow is faster than any canvas. Use the flowchart to prepare before the round and to review the clashes after it, and keep your in-round flow on paper or a laptop.",
            ]),
        ],
        "faqs": [
            ("What is an argument flowchart in debate?", "A diagram of a case: its main line, the arguments that support it, the attacks on them and the answers, joined by links that show what depends on what."),
            ("Is a flowchart the same as flowing?", "No. Flowing is note-taking during a round, speech by speech. A flowchart is a map you build before or after a round to plan and review the clash."),
            ("Can I save and share a flowchart?", "Yes. Save it to the Current Debate to load it later, or export it as a PNG image to share with a partner or coach."),
            ("How many arguments should a flowchart have?", "As many as the case has, but the useful part is the two or three clashes that decide the round. If the map is too crowded to read, collapse it to those."),
        ],
    },
    "how-to-weigh-in-debate": {
        "modified": "2026-10-28",
        "features": [
            ("Six ways to compare impacts", "Magnitude, probability, timeframe, reversibility, scope and link strength, with when each one is the right comparison."),
            ("Weighing the weighing", "What to say when your impact wins on one measure and theirs wins on another."),
            ("Weighing in every speech", "Where weighing belongs in the constructive, the rebuttal and the final speech, so the judge never decides without it."),
        ],
        "sections": [
            ("Why weighing wins rounds", [
                "Most rounds end with both sides holding some offence. When that happens, the judge needs a reason to prefer one impact over the other. Weighing gives that reason. Without it, the judge has to compare the impacts alone, and a judge left to decide will not always pick yours.",
                "Weighing means comparing which harm or benefit matters more (also called impact calculus). Use a clear measure, such as how likely each outcome is, and explain why that measure should decide the round.",
            ]),
            ("The six measures", [
                {"list": [
                    "Magnitude: how big is the impact for the people it affects?",
                    "Probability: how likely is it to happen at all?",
                    "Timeframe: how soon does it happen, and does an earlier harm prevent or worsen a later one?",
                    "Reversibility: can it be undone if we get it wrong?",
                    "Scope: how many people does it reach, and who are they?",
                    "Link strength: how certain is the causal chain from the motion to the impact?",
                ]},
                "Magnitude is the measure debaters reach for first and the one judges trust least, because every team claims its impact is huge. Probability and link strength often do more work, because they are about the argument the judge just heard rather than a prediction.",
            ]),
            ("Compare, do not just describe", [
                "Saying your impact is large is description. Weighing is comparison: your impact against theirs, on a named measure, with a reason. A useful pattern has three parts:",
                {"steps": [
                    "Name the measure: \"Prefer our impact on probability.\"",
                    "Compare directly: \"Our harm is happening now, in every school that uses the policy; theirs depends on three things going wrong in sequence.\"",
                    "Say why the measure matters: \"A certain harm should outweigh a speculative one, because the judge cannot weigh what may never happen.\"",
                ]},
                "When their impact wins on one measure and yours on another, weigh the weighing. Explain why your measure should count more in this round, for example why an irreversible harm outweighs a larger reversible one.",
            ]),
            ("Worked example", [
                {"example": {"title": "Motion: This house would ban fossil fuel advertising", "rows": [
                    ("Proposition impact:", "Advertising slows the shift away from fossil fuels, adding to long-term climate harm."),
                    ("Opposition impact:", "A ban sets a precedent for restricting lawful speech, which governments can extend to other industries."),
                    ("Weak weighing:", "\"Climate change is the biggest problem humanity faces, so we win.\" Magnitude alone, with no comparison."),
                    ("Strong weighing:", "\"Even if the precedent concern is real, it is speculative: it needs future governments to choose to extend it. The climate harm is happening now and cannot be reversed. Prefer us on probability and reversibility.\""),
                ]}},
                "The strong version concedes nothing it does not need to, names two measures and gives the judge a reason to use them.",
            ]),
            ("When to weigh", [
                "Start in the constructive, so the judge hears your impact framed before the other side frames theirs. Reinforce it in rebuttal, where you compare each clash as you win it. Make it the centre of the final speech. Late weighing is better than none, but weighing that only appears at the end competes with a decision the judge has already begun to make.",
                "In Public Forum, weighing should be in summary if you want it in final focus. In Lincoln-Douglas, weighing usually runs through the value and criterion. In World Schools, third speakers weigh the clashes and the reply speech weighs the whole debate. British Parliamentary has no reply speech, so the whips weigh the whole debate.",
            ]),
            ("Practise weighing with {product}", [
                "Run a Sparring round and read the verdict: it says which arguments decided the round and why, which shows whether your weighing changed the outcome. Ask the coach to compare two impacts on a named measure, then write your own version and say it against the timer.",
            ]),
        ],
        "faqs": [
            ("What is weighing in debate?", "Comparing your impact with your opponent's to show the judge why yours should decide the round, using measures such as magnitude, probability, timeframe, reversibility, scope and link strength."),
            ("Does weighing mean choosing the biggest harm?", "No. Size is only one measure. A smaller harm may matter more if it is more likely, happens sooner or cannot be undone."),
            ("Which weighing measure is strongest?", "It depends on the round. Probability and link strength are often more persuasive than magnitude, because they compare the arguments the judge actually heard."),
            ("What if my impact loses on magnitude?", "Weigh on a different measure and say why that measure matters more here, for example that your harm is certain and theirs is speculative."),
            ("When should I start weighing?", "In the first speech. Early weighing frames the round; weighing that appears only in the final speech competes with a decision already forming."),
        ],
    },
    "how-to-cross-examine-in-debate": {
        "modified": "2026-10-28",
        "features": [
            ("Question design", "Short, closed questions that get a commitment, in an order that leads to the point you want to make."),
            ("Time management", "How to choose the two or three lines of questioning that matter in a three-minute period."),
            ("Using concessions", "How to carry what the opponent admitted into your next speech, where the judge will actually weigh it."),
        ],
        "sections": [
            ("What cross-examination is for", [
                "Cross-examination is not a speech. Judges rarely decide a round on what happens in cross-ex itself; they decide on what the next speech does with it. Its jobs are to clarify what the other side is arguing, to get commitments you can use, and to expose a reason that does not support the claim (debaters call this the warrant).",
                "That changes how you ask. You are not trying to win an argument with the speaker. You are collecting material for your speech, so every question should lead to something you can say later.",
            ]),
            ("Designing questions", [
                "Ask leading, closed questions that invite a yes or a no. Open questions such as \"why do you think that?\" hand the speaker a second speech. Closed questions keep control with you.",
                "Good lines of questioning have a shape: commit, then confront.",
                {"steps": [
                    "Commit the speaker to something they cannot easily deny. \"Your plan relies on schools having enough trained staff?\"",
                    "Narrow it. \"And you have not told us where those staff come from?\"",
                    "Stop. Do not ask the final question that lets them explain. Make the point in your speech instead: \"They conceded the plan needs staff it never provides.\"",
                ]},
                "Write your opening question for each line before the round. You will adapt the rest, but a prepared first question stops you from opening with something vague.",
            ]),
            ("Managing the time", [
                "A three-minute period fits two or three lines of questioning, not ten. Pick the lines that challenge the reason the round depends on, and leave minor points for the speech. If an answer is evasive, ask once more in a narrower form, then move on; the judge has seen the evasion.",
                "Common mistakes:",
                {"list": [
                    "Asking open questions that let the speaker repeat their case.",
                    "Arguing with the answer instead of asking the next question.",
                    "Asking one question too many, so the speaker gets to explain away the point.",
                    "Running out of time before reaching the line that mattered.",
                    "Getting a concession and never mentioning it again.",
                ]},
            ]),
            ("Using concessions in your speech", [
                "A concession only counts if the judge hears it again in a speech. Quote it, say what it means for the clash, and weigh it: \"In cross-ex they agreed the plan needs trained staff. They have no source of staff, so the plan does not solve.\" Concessions are strong because the other side cannot easily take them back.",
            ]),
            ("Answering cross-examination", [
                "When you are the one answering, keep answers short and accurate, and do not give up the reason your case depends on. If a question rests on an assumption you reject, say so in one sentence. It is fine to say you will answer a point in your speech; it is not fine to filibuster.",
            ]),
            ("Format notes", [
                {"h3": "Policy and Lincoln-Douglas"},
                "Each constructive is followed by a three-minute cross-examination by the opponent. Use it to set up the rebuttals, and note which answers you will need later.",
                {"h3": "Public Forum"},
                "Crossfire is three minutes, and both speakers can ask and answer. Grand crossfire involves all four debaters. With shared time, short questions and short answers matter even more.",
                {"h3": "World Schools and British Parliamentary"},
                "There is no cross-examination period. Points of Information do the same job in fifteen seconds: one sharp question or statement aimed at a gap in the reasoning.",
            ]),
            ("Practise with {product} Crossfire", [
                "Crossfire runs a question period against the AI in either direction. Question the AI while it answers from the opposing side, or let the AI question you while you defend your case. Choose a cooperative, evasive or aggressive opponent, so you can practise follow-ups against slippery answers as well as straight ones. Each session ends with a debrief. Attack can also suggest cross-ex questions for an argument, which you can open in Crossfire to practise.",
            ]),
        ],
        "faqs": [
            ("What makes a good cross-examination question?", "It is short, closed and leads somewhere: it gets a commitment you can use in your next speech, rather than inviting the speaker to explain their case again."),
            ("How many questions should I ask in cross-ex?", "Enough for two or three lines of questioning. Quality matters more than count; stop each line before the speaker can explain the problem away."),
            ("What should I do with a concession?", "Repeat it in your next speech, say what it means for the clash and weigh it. A concession the judge never hears again does not help you."),
            ("How do I answer cross-ex questions well?", "Answer briefly and accurately, reject false assumptions in one sentence, and do not give up the reason your case depends on."),
            ("Can I practise cross-examination without a partner?", "Yes. Crossfire in {product} lets you question the AI or be questioned by it, with cooperative, evasive or aggressive opponent styles."),
        ],
    },
    "how-to-flow-in-debate": {
        "modified": "2026-10-28",
        "features": [
            ("Column structure", "One column per speech, so each argument can be followed across the round from where it starts to where it is answered or dropped."),
            ("Abbreviations that keep up", "A short, consistent set of symbols, so you can write as fast as the round moves."),
            ("Dropped argument tracking", "A habit of marking what was not answered, because a dropped argument is usually a conceded one."),
        ],
        "sections": [
            ("Why flowing matters", [
                "Flowing is taking notes in a structure that follows arguments through the round. If you cannot see the structure of the debate, you cannot respond strategically: you answer what you remember, not what matters, and you miss what the other side dropped.",
                "Judges flow too. When your speech follows the same structure as their flow, the judge can see each response land on the argument it answers.",
            ]),
            ("How to set up your flow", [
                {"steps": [
                    "Use one column per speech, left to right in speaking order. In Lincoln-Douglas that is the affirmative constructive, the negative constructive, then each rebuttal.",
                    "Keep a separate sheet, or section, for each side's case. Responses to the affirmative go on the affirmative sheet next to the argument they answer.",
                    "Write each argument's short label, with the reason it is true underneath (debaters call this the warrant). The label helps you find the argument; the reason is what you need to test.",
                    "Use two colours, one for each side, so you can see at a glance who said what.",
                    "Leave space. Arguments grow across speeches, and a cramped flow is the one that loses track.",
                ]},
                "To skip ruling the columns by hand, print a [free debate flow sheet](/tools/debate-flow-sheet) with one column per speech for your format.",
            ]),
            ("Abbreviations", [
                "You cannot write full sentences at speaking speed. Keep a short list and use it every time, so you can read your own flow under pressure:",
                {"list": [
                    "Arrows for causes and leads to, and a crossed arrow for does not lead to.",
                    "Up and down arrows for increase and decrease.",
                    "Short forms for common words: gov for government, econ for economy, ev for evidence.",
                    "A circled letter or number for each argument, so responses can point to it.",
                    "A question mark for a claim the speaker gave no reason for.",
                ]},
            ]),
            ("Tracking dropped arguments", [
                "When an argument has nothing written next to it in the next column, it was dropped. Mark it straight away. In most formats a dropped argument is treated as conceded, and pointing that out is often the shortest path to winning a clash.",
                "Check your own side too. Before each speech, look along your columns for anything of yours the other side answered that you have not yet responded to. Those are the gaps a good opponent will extend.",
            ]),
            ("Use your flow to write speeches", [
                "Before you speak, look at the flow and decide which clashes you must win. Then speak down the flow in order, so the judge can follow each response to its argument. Your speech should trace the flow, not introduce random new material.",
                "In British Parliamentary and World Schools, with more speakers and no fixed pairing of speeches, many debaters flow by clash rather than strictly by speech: a section for each main question in the debate, with every team's points on it.",
            ]),
            ("How to get better at flowing", [
                "Flow recorded rounds and compare your flow with the speech afterwards to see what you missed. Start with slower speeches and build up. After a practice round, check whether anything you dropped was dropped by choice or by accident. To review the clashes after a round, rebuild them in the {product} argument flowchart, where a dropped node shows what went unanswered.",
            ]),
        ],
        "faqs": [
            ("What does flowing mean in debate?", "Taking notes on a round in columns, one per speech, so each argument can be followed from where it is made to where it is answered or dropped."),
            ("Should I flow on paper or a laptop?", "Either works. Paper is easier for drawing arrows and links; a laptop is easier to keep tidy. Use whichever you can write on quickly and read under pressure."),
            ("What is a dropped argument?", "An argument the other side never answered. In most formats a dropped argument is treated as conceded, so mark it on your flow and point it out."),
            ("How do I flow faster?", "Use a consistent set of abbreviations, write short labels and reasons rather than full sentences, and practise on recorded rounds before tournaments."),
        ],
    },
    "world-schools-debate": {
        "modified": "2026-10-28",
        "features": [
            ("Motion interpretation", "Define the model, the stakeholders and what each side has to prove before anyone writes a speech."),
            ("Team roles", "What the first, second and third speakers and the reply speaker each owe the team, and how to practise each role."),
            ("POIs and reply speeches", "Points of Information that test the reason behind a point in fifteen seconds, and reply speeches that frame the debate without new arguments."),
        ],
        "sections": [
            ("How a World Schools round works", [
                "World Schools Debating Championships (WSDC) style has two teams of three speakers. Each speaker gives an eight-minute substantive speech, alternating from the proposition, and then each team gives a four-minute reply speech, opposition first. The reply is given by the first or second speaker, never the third.",
                "Motions are either prepared, announced weeks ahead, or impromptu, with about an hour of preparation and no internet. Judges score style, content and strategy, so a well-organised team case can beat a collection of strong but disconnected arguments.",
            ]),
            ("Start with the motion", [
                "WSDC motions are broad, so the first job is to interpret them. Define the terms, set out the model if the proposition is proposing a change, name the stakeholders, and say what each side must prove. Clear framing in the first speech shapes the rest of the debate.",
                {"steps": [
                    "Define the key terms in a way a reasonable person would accept.",
                    "If the motion asks for a policy, give a model: who does what, and what it does not cover.",
                    "List the stakeholders and how the motion changes things for each.",
                    "Write the burden for each side in one sentence.",
                    "Identify the two or three clashes the debate is likely to turn on, and decide which speaker carries each one.",
                ]},
            ]),
            ("Team roles", [
                {"h3": "First speaker"},
                "Sets up the debate: definitions, model, burdens and the team line, then the first arguments. The opposition first speaker also begins rebuttal.",
                {"h3": "Second speaker"},
                "Rebuts the other side's case and extends their own team's arguments with new material. This is usually the speech with the most new analysis.",
                {"h3": "Third speaker"},
                "Organises the debate into its main clashes, rebuts within each one and weighs. Responding is the main job: a third speaker may present a small part of the team case only if the first speaker announced it when setting out the team line.",
                {"h3": "Reply speaker"},
                "Gives a short, biased summary of the whole debate: where the clashes were and why their team won them. No new arguments, and no new rebuttal.",
                "Practise each role separately. A speaker who can only do one job is a weak point when the team needs to change roles for an impromptu round.",
            ]),
            ("Points of Information", [
                "Speakers on the other side can offer a Point of Information during a substantive speech, except in the first and last minute, which are protected. The speaker chooses whether to accept, and as a general rule should accept at least two. A good POI is short, under fifteen seconds, and tests the reason the speech depends on (debaters call this the warrant).",
                "Answering POIs matters as much as offering them. Take one, answer it in a sentence, and return to your structure. Turning down every POI usually looks evasive to judges.",
            ]),
            ("Prepare for WSDC with {product}", [
                "Use Brainstorm and case generation to map arguments for both sides of a prepared motion, and run motions under a one-hour limit to practise impromptu prep. Crossfire with the AI asking the questions is a way to rehearse taking POIs and answering briefly. Attack finds the weak links in each speaker's material before the round does.",
                "{product} Sparring does not yet run the full WSDC round, and the timer inside the app has no WSDC preset. The [free debate timer](/tools/debate-timer) does, with the protected first and last minute and both reply speeches.",
            ]),
        ],
        "faqs": [
            ("How long are speeches in World Schools debate?", "Substantive speeches are eight minutes, and reply speeches are four minutes. Each team has three substantive speakers and one reply speech."),
            ("What is a Point of Information?", "A short question or statement offered by the other team during a substantive speech, outside the protected first and last minute. The speaker decides whether to accept it."),
            ("Can the third speaker bring new arguments?", "Only a small part of the team case, and only if the first speaker announced it when setting out the team line. The third speaker's main job is to rebut, organise the debate into clashes and weigh."),
            ("Who gives the reply speech?", "The first or second speaker of each team, never the third. The opposition reply comes first."),
            ("How do I practise impromptu WSDC motions?", "Set a one-hour timer, prepare a case with your team, and practise each role. Then review where the team line held and where it did not."),
        ],
    },
    "debate-evidence-finder": {
        "modified": "2026-10-28",
        "features": [
            ("Evidence leads", "Research directions for a claim: the kinds of sources that could support it and searches you can run to confirm it."),
            ("Citation checks", "A checklist for each source before it goes on a card: author, date, method and whether the quote says what you claim."),
            ("Impact links", "Evidence tied to the reason behind the argument and the disagreement it helps resolve, not added to a speech as decoration."),
        ],
        "sections": [
            ("Evidence is not the argument", [
                "Evidence helps only when it supports a clear reason why your claim is true (debaters call this the warrant). A source should answer a burden in the round, not decorate a speech. Before you look for a card, write the claim it needs to prove in one sentence. If you cannot, more research will not help.",
                "The most useful evidence sits on a specific clash: solvency, harms, trade-offs, comparative examples and the weighing.",
            ]),
            ("AI research is a starting point", [
                "AI tools are good at suggesting where to look: which kinds of reports, journals or data sources might support a link. They are not a replacement for reading the source. A summary can lose a qualification, mix up two studies, or point to a page that says something different.",
                "Treat every AI result as a lead. Open the original, read enough of it to understand the context, and only then decide whether it belongs in your case.",
            ]),
            ("Finding evidence with {product}", [
                {"steps": [
                    "Give Factoids a single statement from your case. It researches that statement and returns supporting factoids with citations, context and suggestions for how to use them.",
                    "Generate a case. {product} researches the motion before it writes, so each piece of evidence names its source and year, and the case ends with a source list: the organisation, the year, the claim it supports and the link.",
                    "Save the sources you trust to the Library. Active Library sources that fit a request are used by the other prep tools for that debate, so later answers draw on material you have checked.",
                    "Ask for counter-evidence too. Attack runs research on an argument and can point to sources that cut against it, which tells you what the other side may read.",
                ]},
            ]),
            ("Verify before you read it aloud", [
                "A bad card is worse than no card. If your evidence is challenged in cross-ex and does not say what you claimed, you lose the point and some of the judge's trust in the rest of your case. Check each source before it goes on a card:",
                {"list": [
                    "Author: who wrote it, and are they qualified to make this claim?",
                    "Date: is it recent enough for the claim, and has anything changed since?",
                    "Publication: a peer-reviewed journal, a government report, a newspaper or a blog all carry different weight.",
                    "Method: for a study, what was the sample, how was it measured, and does it show cause or only correlation?",
                    "Context: read the paragraphs around the quote. Make sure the author is not describing a view they go on to reject.",
                    "Citation: record the full citation, so you can produce the source if the other side or the judge asks.",
                ]},
            ]),
            ("What to do when the evidence is weak", [
                "Do not read it. Look for a better source, narrow the claim so the evidence you have does prove it, or make the argument analytically: explain the reasoning without leaning on a card. A clear explanation with no quoted evidence often beats a weak card that falls apart under one question.",
            ]),
            ("Worked example", [
                {"example": {"title": "Motion: This house would introduce a four-day school week", "rows": [
                    ("Claim:", "A four-day week improves teacher retention."),
                    ("Lead found:", "A summary says districts that moved to four days saw fewer teachers leave."),
                    ("Check:", "The original study covers a small number of rural districts, and the authors say they cannot separate the schedule from pay changes made at the same time."),
                    ("Decision:", "Narrow the claim to rural districts, say the evidence suggests but does not prove the effect, and support it with a step-by-step explanation of how recruitment would improve."),
                ]}},
                "The weaker claim is easier to defend, and the honesty about the study removes the easiest cross-ex question the other side could ask.",
            ]),
        ],
        "faqs": [
            ("Can AI find evidence for debate?", "It can find leads: sources and searches that may support a claim. You still need to open each source, read it in context and record the citation before using it."),
            ("How do I verify debate evidence?", "Check the author, date, publication and method, read the text around the quote, and confirm that it says what you claim. Record the full citation."),
            ("What should I do if my evidence is weak?", "Do not read it. Find a better source, narrow your claim, or make the argument analytically without the card."),
            ("Where does {product} keep my sources?", "In the Library for your Current Debate. Sources you mark active are used by the other tools for that debate."),
            ("Is a card better than an analytical argument?", "Only if it is accurate and relevant. Strong reasoning without a quote often beats a weak card that does not survive a question."),
        ],
    },
    "debateowl-pricing": {
        "modified": "2026-10-29",
        "software": True,
        "lead": "A 3-day free trial with no credit card, then one paid plan. Prices on this page were checked in October 2026.",
        "features": [
            ("Trial: $0 for 3 days", "All {mode_count} prep modes plus {utility_names}, with starter AI prep access and starter models. No credit card required to start."),
            ("Pro: {pro_price}", "Expanded AI prep access, all 10 models, Active Grounding research and priority support."),
            ("No permanent free plan", "When the trial ends, a Pro subscription is required to keep using {product}. You can cancel any time."),
        ],
        "sections": [
            ("What each plan includes (as of October 2026)", [
                {"h3": "Trial"},
                {"list": [
                    "Price: $0 for 3 days. No credit card required.",
                    "All {mode_count} prep modes: {mode_names}, plus {utility_names}.",
                    "Starter AI prep access and starter models.",
                ]},
                {"h3": "Pro"},
                {"list": [
                    "Price: {pro_price}.",
                    "All {mode_count} prep modes plus {utility_names}.",
                    "Expanded AI prep access, with higher daily limits for heavy prep weeks.",
                    "All 10 models, including Claude Opus and Sonnet, GPT-6.1 Sol and Gemini.",
                    "Active Grounding research and priority support.",
                ]},
                "There is no permanent free plan. After the trial, a subscription is required to continue using {product}.",
            ]),
            ("Is Pro worth it for you?", [
                "It depends on how often you prepare. Use the trial on a real motion: generate a case, attack it, run one Sparring round and read the verdict. If that loop saved you time, Pro is priced for students who prep every week or have a tournament coming.",
                "If you debate a few times a year, or you need a tool that stays free, {product} is probably not the right fit. A general chatbot's free tier can cover occasional brainstorming, and some practice tools are free to use.",
            ]),
            ("Cancelling", [
                "You can cancel any time from the Settings page. You keep Pro access until the end of the billing period you already paid for.",
            ]),
        ],
        "faqs": [
            ("How much does {product} cost?", "As of October 2026, {product} has a 3-day free trial with no credit card required. After that, Pro costs {pro_price}."),
            ("Is there a free plan?", "No. There is a 3-day free trial, but no permanent free plan. A subscription is required after the trial."),
            ("Do I need a credit card for the trial?", "No. You can start the 3-day trial without a credit card."),
            ("What does Pro add over the trial?", "Expanded AI prep access with higher daily limits, all 10 models including Claude Opus and Sonnet, GPT-6.1 Sol and Gemini, Active Grounding research and priority support."),
            ("Can I cancel my subscription?", "Yes, any time from the Settings page. You keep access until the end of your billing period."),
        ],
    },
    "debateowl-vs-windebate": {
        "modified": "2026-10-29",
        "software": True,
        "features": [
            ("Formats", "As of October 2026, WinDebate names six formats: Public Forum, Lincoln-Douglas, Congressional, Policy, World Schools and British Parliamentary. {product}'s Sparring rounds cover School 4-6-6-3, Lincoln-Douglas and Public Forum."),
            ("Price", "WinDebate has a free tier with monthly limits and paid plans from $19.99/month. {product} has a 3-day free trial, then Pro at {pro_price}."),
            ("Workflow", "WinDebate is organised as prep, practice, live round and review. {product} keeps cases, sources, practice rounds and debriefs together in one Current Debate."),
        ],
        "sections": [
            ("What WinDebate offers", [
                "WinDebate (windebate.ai) describes itself as a debate training platform with four stages: prep, practice, live and review. Its site lists research on both sides with evidence and rebuttal trees, targeted drills for attack, defense, weighing and speeches, a Live Round Assistant that captures speeches and builds response cards, replay review that turns a round into drills, and progress tracking.",
                "As of October 2026, its plans are Free ($0, with 1 research session, 10 drills and 1 Live Assistant round a month), Plus ($19.99/month, which adds voice input and playback and weekly progress) and Pro ($39.99/month). These details come from WinDebate's own site; check it for current terms.",
            ]),
            ("What {product} offers", [
                "{product} is an AI debate prep and practice app with {mode_count} prep modes. You start a Current Debate for one motion, add sources to its Library, generate a ready-to-read case with \"If they say…\" answers to the other side, find weak links with Attack, research claims with Factoids, ask the Ask coach, drill cross-examination in Crossfire, and run timed Sparring rounds against an AI opponent that end in a verdict. A speech timer and an argument flowchart round it out.",
                "As of October 2026, {product} has a 3-day free trial with no credit card, then Pro at {pro_price}. The app is available in English, Spanish and Hungarian.",
            ]),
            ("Side by side", [
                {"table": {"caption": "{product} vs WinDebate (as of October 2026, from each product's own site)", "head": ["Feature", "{product}", "WinDebate"], "rows": [
                    ["Formats named", "Sparring rounds in School 4-6-6-3, Lincoln-Douglas and Public Forum; prep tools work for any motion", "Public Forum, Lincoln-Douglas, Congressional, Policy, World Schools and British Parliamentary"],
                    ["Practice", "Timed rounds against an AI opponent that end in a verdict, plus Crossfire drills", "Targeted drills for attack, defense, weighing and speeches"],
                    ["Review", "Cases, sources, rounds and debriefs kept in one Current Debate", "Live Round Assistant, replay review and progress tracking"],
                    ["Free plan", "3-day free trial, no permanent free plan", "Free tier with 1 research session, 10 drills and 1 Live Assistant round a month"],
                    ["Paid price", "{pro_price}", "Plus $19.99/month, Pro $39.99/month"],
                ]}},
            ]),
            ("How to choose", [
                {"list": [
                    "You debate Policy, Congress or British Parliamentary and want a tool that names your format: WinDebate lists all three.",
                    "You want to track progress across a season or review recorded rounds: WinDebate lists progress tracking and replay review.",
                    "You want a free tier you can keep using: WinDebate has one; {product} does not.",
                    "You want full practice rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas or Public Forum, with a verdict: {product}.",
                    "You prepare in Spanish or Hungarian, or want the lowest paid price: {product}.",
                ]},
                "The fairest test is to run the same motion through both during {product}'s trial and WinDebate's free tier, then compare the cases, the feedback and how much setup each needed.",
            ]),
        ],
        "faqs": [
            ("Is {product} cheaper than WinDebate?", "As of October 2026, {product} Pro is {pro_price} and WinDebate's paid plans start at $19.99/month. WinDebate also has a free tier with monthly limits; {product} has a 3-day trial and no permanent free plan."),
            ("Which formats does each tool support?", "WinDebate names Public Forum, Lincoln-Douglas, Congressional, Policy, World Schools and British Parliamentary. {product}'s case, Attack, Ask and Crossfire tools work for any motion, and Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds."),
            ("Can I use both?", "Yes. They are separate products, and some debaters use one for prep and another for review."),
        ],
    },
    "debateowl-vs-debateclub": {
        "modified": "2026-10-29",
        "software": True,
        "features": [
            ("Audience", "As of October 2026, DebateClub describes itself as training for high-stakes conversations such as negotiations, pitches and meetings. {product} is built for school and competitive debate."),
            ("Practice style", "DebateClub is voice-only sparring with opponent personas. {product} combines case prep tools with timed Sparring rounds you can type or speak."),
            ("Price", "DebateClub has a free tier with one debate credit and Pro at $19/month. {product} has a 3-day free trial, then Pro at {pro_price}."),
        ],
        "sections": [
            ("What DebateClub offers", [
                "DebateClub (debateclub.app) calls itself a training platform for high-stakes conversations: you speak out loud and an AI sparring partner responds in real time. Its site lists opponent personas such as a skeptical investor or a hostile critic, detection and scoring of rhetorical techniques, session recordings and a prep screen for openings and counters. It does not name school or competitive debate formats.",
                "As of October 2026, its plans are Free ($0, one debate credit) and Pro ($19/month or $149/year). These details come from DebateClub's own site; check it for current terms.",
            ]),
            ("What {product} offers", [
                "{product} is an AI debate prep and practice app for students and competitive debaters, with {mode_count} prep modes. It builds ready-to-read cases with \"If they say…\" answers to the other side, finds weak links with Attack, researches claims with Factoids, drills cross-examination in Crossfire and runs timed Sparring rounds in School 4-6-6-3, Lincoln-Douglas and Public Forum that end in a verdict. Voice mode lets you speak your speeches instead of typing them.",
                "As of October 2026, {product} has a 3-day free trial with no credit card, then Pro at {pro_price}. The app is available in English, Spanish and Hungarian.",
            ]),
            ("Side by side", [
                {"table": {"caption": "{product} vs DebateClub (as of October 2026, from each product's own site)", "head": ["Feature", "{product}", "DebateClub"], "rows": [
                    ["Built for", "School and competitive debate", "High-stakes conversations such as negotiations, pitches and meetings"],
                    ["Formats named", "Sparring rounds in School 4-6-6-3, Lincoln-Douglas and Public Forum", "None"],
                    ["Practice style", "Timed Sparring rounds you can type or speak, ending in a verdict", "Voice-only sparring with opponent personas and rhetorical technique scoring"],
                    ["Prep tools", "Cases with \"If they say…\" answers, Attack, Factoids, Crossfire and a timer", "A prep screen for openings and counters"],
                    ["Price", "3-day free trial, then {pro_price}", "Free tier with one debate credit; Pro $19/month or $149/year"],
                ]}},
            ]),
            ("Which fits you", [
                {"list": [
                    "Preparing for a negotiation, pitch, interview or meeting: DebateClub is built for that.",
                    "Practising out loud against interruptions and difficult personas: DebateClub.",
                    "Preparing cases, rebuttals and evidence for a debate tournament: {product}.",
                    "Practising full rounds in a school debate format with speech times and a verdict: {product}.",
                ]},
            ]),
        ],
        "faqs": [
            ("Is DebateClub for competitive debate?", "As of October 2026, DebateClub's site describes training for high-stakes conversations such as negotiations and pitches and does not name competitive debate formats."),
            ("Does {product} support voice practice?", "Yes. Sparring has a voice mode, so you can speak your speeches instead of typing them."),
            ("Which is cheaper?", "As of October 2026, {product} Pro is {pro_price} and DebateClub Pro is $19/month. DebateClub also has a free tier with one debate credit; {product} has a 3-day trial and no permanent free plan."),
        ],
    },
    "lincoln-douglas-debate": {
        "modified": "2026-10-28",
        "features": [
            ("The NSDA round", "Seven speeches and cross-examinations at 6-3-7-3-4-6-3, with four minutes of prep per debater."),
            ("A useful test for the judge", "A value and a criterion the rest of the case actually depends on, instead of a label at the top."),
            ("A worked example and its turn", "One affirmative contention on an original practice resolution, and how a negative turns it under the same criterion."),
        ],
        "sections": [
            ("The round at NSDA times", [
                "Lincoln-Douglas is one debater against one. The National Speech & Debate Association (NSDA) writes resolutions that ask for a value judgment, and the topic changes several times a season. Under the [NSDA High School Unified Manual](https://www.speechanddebate.org/high-school-unified-manual/), a round runs in this order:",
                {"table": {"head": ["Speech", "Who", "Time"], "rows": [
                    ["Affirmative constructive (AC)", "Affirmative", "6 minutes"],
                    ["Cross-examination", "Negative asks, affirmative answers", "3 minutes"],
                    ["Negative constructive (NC)", "Negative", "7 minutes"],
                    ["Cross-examination", "Affirmative asks, negative answers", "3 minutes"],
                    ["First affirmative rebuttal (1AR)", "Affirmative", "4 minutes"],
                    ["Negative rebuttal (NR)", "Negative", "6 minutes"],
                    ["Second affirmative rebuttal (2AR)", "Affirmative", "3 minutes"],
                    ["Prep time", "Each debater, used between speeches", "4 minutes"],
                ]}},
                "The time split explains most LD strategy. The affirmative speaks first and last but has 13 minutes of speeches to the negative's 13, and the 1AR has four minutes to answer seven minutes of NC. Some tournaments allow more prep than four minutes, so read the invitation. The [free debate timer with the LD preset](/tools/debate-timer?format=ld) runs this order and keeps each debater's prep bank.",
            ]),
            ("What the value and criterion are for", [
                "The value is the goal the resolution should be judged by, such as justice, wellbeing or liberty. The criterion, sometimes called the standard or value criterion, is the test the judge uses to decide which side achieves that value better. Together they are the framework, and in a close round the framework decides which arguments count at all.",
                "A criterion earns its place when it is narrow enough to exclude some impacts. \"Maximising wellbeing\" lets almost anything in, so the round turns into a contest of the biggest numbers. \"Protecting the least advantaged\" tells the judge that a benefit to most people does not outweigh a serious harm to the worst off. The narrower test is easier to attack, but it also gives you a reason to win when the negative's offense is larger in raw terms.",
                "Each contention should then show how the resolution meets the criterion. If a contention would win under any framework, it is fine, but it does not need your framework, and your opponent can ignore the framework debate entirely.",
            ]),
            ("Worked example: one contention and the turn", [
                {"example": {"title": "Practice resolution: Resolved: Cities ought to prioritize pedestrians over private cars when allocating street space", "rows": [
                    ("Value:", "Justice, defined as giving each person what they are owed as a member of the public."),
                    ("Criterion:", "Protecting the least advantaged users of public space."),
                    ("Contention 1:", "Streets are a shared public good, but car-first allocation gives most of that space to people who can afford a car. Children, many older people and people on low incomes travel on foot or by bus, so they get the least space and carry the most risk."),
                    ("Impact under the criterion:", "Prioritizing pedestrians reallocates a public good toward the people the criterion says to protect first."),
                    ("Negative turn:", "Accept the criterion and argue that the affirmative fails it. Many disabled people, rural commuters and night-shift workers without transit depend on cars, and they are among the least advantaged too. Pedestrian priority without replacement transit takes access from them."),
                    ("Affirmative answer in the 1AR:", "Prioritizing is not banning: accessible parking, paratransit and delivery access stay. Then weigh: the affirmative helps more of the least advantaged, and the negative's harm can be fixed inside the affirmative world."),
                ]}},
                "The turn works because it fights on the affirmative's own criterion. A negative who instead argued \"economic growth matters more\" would need to win a separate framework debate first, which costs time in a seven-minute NC.",
            ]),
            ("Cross-examination in LD", [
                "Each debater gets one three-minute cross-examination. Spend it on the framework and on the one link you plan to attack. Useful questions get a commitment you can quote later: \"Does your criterion let a benefit to the majority outweigh a harm to the worst off?\" A yes or no either way gives you something for the next speech.",
                "When you answer, keep replies short and stay consistent with the case. Conceding a definition is usually cheaper than defending a weak one for the whole round.",
            ]),
            ("Common LD mistakes", [
                {"list": [
                    "A value and criterion that no contention mentions again. If the framework disappears after the first minute, the judge decides on impacts alone.",
                    "A criterion that is just the value restated, such as value \"morality\" and criterion \"being moral\". It gives the judge no test to apply.",
                    "An NC that only attacks. The negative needs offense of its own, or the affirmative can win on a small risk of its advantage.",
                    "A 1AR that tries to answer everything at the same depth. Group the NC's responses, answer the framework first, and extend one contention cleanly.",
                    "A 2AR that introduces new arguments. Judges discount them because the negative has no speech left to respond.",
                ]},
            ]),
            ("A 15-minute LD drill", [
                {"steps": [
                    "Two minutes: write a value and criterion for both sides of the current resolution, or the practice one above.",
                    "Three minutes: for your affirmative, write one contention in three sentences, ending with how it meets the criterion.",
                    "Four minutes: write the negative turn against that contention under the same criterion, as if you were the opponent.",
                    "Four minutes: deliver a 1AR answer to the turn out loud, timed with the LD preset's 1AR slot.",
                    "Two minutes: write one cross-examination question that would have set up the turn, and one that would have prevented it.",
                ]},
                "In {product}, Case Attacker runs the same test on a full case: paste the affirmative and it points to the weakest link. Crossfire is a cross-examination drill, where the AI questions you about your case or answers your questions from the other side. Sparring runs LD rounds at the NSDA speech times with a judged verdict at the end; the cross-examination periods are left out, so pair it with a Crossfire drill.",
            ]),
        ],
        "faqs": [
            ("How long is a Lincoln-Douglas round?", "The speeches and cross-examinations add up to 32 minutes. With four minutes of prep for each debater, a round takes about 40 minutes."),
            ("Do I need a value premise and a criterion in every LD case?", "Most traditional LD judges expect both. Some circuits use a single standard or a framework argument instead, but the purpose is the same: give the judge a test for weighing the round."),
            ("Can the affirmative and negative use the same value?", "Yes, and it is common. When both sides share a value, the round usually turns on the criterion or on who better meets the shared framework."),
            ("Why is the 1AR so hard?", "It has four minutes to answer a seven-minute negative constructive and the negative's cross-examination. Grouping arguments and answering the framework first saves the most time."),
        ],
    },
    "policy-debate": {
        "modified": "2026-10-26",
        "features": [
            ("The 8-3-5 round", "Four constructives, four cross-examinations and four rebuttals, with eight minutes of prep per team."),
            ("What each position must prove", "The parts of a plan, a disadvantage, a counterplan, topicality and a kritik, and where each one is usually weak."),
            ("A worked 1NC and 2NR", "An original practice resolution, an example plan, the negative's off-case positions and how the round collapses."),
        ],
        "sections": [
            ("The round at NSDA times", [
                "Policy debate, also called CX, is two debaters against two. The affirmative proposes a plan that meets the resolution and the negative argues it should not be adopted. The resolution stays the same for the whole school year, so teams build large research files and the evidence is detailed. The [NSDA Policy Debate page](https://www.speechanddebate.org/policy-debate/) and the [High School Unified Manual](https://www.speechanddebate.org/high-school-unified-manual/) set this order:",
                {"table": {"head": ["Speech", "Who", "Time"], "rows": [
                    ["First affirmative constructive (1AC)", "Affirmative", "8 minutes"],
                    ["Cross-examination", "Negative asks the 1AC speaker", "3 minutes"],
                    ["First negative constructive (1NC)", "Negative", "8 minutes"],
                    ["Cross-examination", "Affirmative asks the 1NC speaker", "3 minutes"],
                    ["Second affirmative constructive (2AC)", "Affirmative", "8 minutes"],
                    ["Cross-examination", "Negative asks the 2AC speaker", "3 minutes"],
                    ["Second negative constructive (2NC)", "Negative", "8 minutes"],
                    ["Cross-examination", "Affirmative asks the 2NC speaker", "3 minutes"],
                    ["First negative rebuttal (1NR)", "Negative", "5 minutes"],
                    ["First affirmative rebuttal (1AR)", "Affirmative", "5 minutes"],
                    ["Second negative rebuttal (2NR)", "Negative", "5 minutes"],
                    ["Second affirmative rebuttal (2AR)", "Affirmative", "5 minutes"],
                    ["Prep time", "Each team, used between speeches", "8 minutes"],
                ]}},
                "Each debater gives one constructive and one rebuttal, asks once and answers once. The 2NC and 1NR run back to back, so the negative gets 13 uninterrupted minutes, called the negative block, and the 1AR has five minutes to answer all of it. Older material lists five minutes of prep and some state circuits still use four-minute rebuttals. The [free debate timer with the Policy preset](/tools/debate-timer?format=policy) runs the NSDA order with both prep banks.",
            ]),
            ("What each position has to prove", [
                {"h3": "The affirmative plan"},
                "The 1AC reads a plan text and usually two or three advantages. An advantage needs a harm in the present system, a reason the present system will not solve it (inherency), and evidence that the plan solves it (solvency). The plan text matters more than new debaters expect: the negative will quote it word for word to argue topicality or to write a counterplan around it.",
                {"h3": "Disadvantage (DA)"},
                "A disadvantage says the plan causes something bad. It has four parts: uniqueness (the bad thing is not happening now), a link (the plan triggers it), an internal link and an impact. Most DAs are weakest at uniqueness or at the link, and the 2AC should name which.",
                {"h3": "Counterplan (CP)"},
                "A counterplan is a different way to get the affirmative's advantages. It must compete: it has to be a reason to reject the plan, not just an addition to it. The usual test is a permutation, where the affirmative argues it could do both. A counterplan paired with a disadvantage that only the plan triggers, called the net benefit, is the most common negative strategy.",
                {"h3": "Topicality (T) and kritiks (K)"},
                "Topicality argues that the plan falls outside the resolution, with an interpretation of a word, a violation, standards and a reason to vote. A kritik challenges an assumption the affirmative makes, with a link, an impact and an alternative. Both are judged by different standards in different regions, so ask the judge's preferences before the round.",
            ]),
            ("Worked example: a 1NC and how it collapses", [
                {"example": {"title": "Practice resolution: Resolved: The United States federal government should substantially increase funding for public library systems in the United States", "rows": [
                    ("Plan:", "A federal grant program that pays public library systems to extend evening and weekend hours and to lend internet hotspots."),
                    ("Advantage:", "Households without home internet rely on libraries to apply for jobs and public services; longer hours and lending widen that access."),
                    ("1NC off-case 1, states counterplan:", "The fifty states fund the same hours and lending programs through their own library agencies."),
                    ("1NC off-case 2, net benefit DA:", "A new federal grant program expands federal control of a local service; the link is the plan's grant conditions."),
                    ("1NC on case:", "Solvency press: longer hours do not help households whose problem is transport, not opening times."),
                    ("2AC answer:", "Permute: do both. Then a solvency deficit: states fund unevenly, so the counterplan leaves the poorest areas out, and those are the advantage's harm."),
                    ("2NR collapse:", "Go for the counterplan and the DA only. Drop the solvency press and spend the five minutes on why the permutation still links to the DA."),
                    ("1AR and 2AR:", "Extend the permutation and the solvency deficit from the 2AC, then weigh the deficit against the net benefit. No new answers this late."),
                ]}},
                "The 2NR rarely goes for everything in the 1NC. Choosing what to drop, and saying so clearly, keeps the final negative speech deep enough to win the one comparison that decides the round.",
            ]),
            ("Common Policy mistakes", [
                {"list": [
                    "Reading cards without explaining them. A judge who cannot tell what a card proves gives it little weight, however strong the source.",
                    "A 2AC that answers every off-case position with the same generic responses. Name the weakest part of each DA and CP instead.",
                    "Conceding the permutation by never answering it in the block.",
                    "A 2NR that extends five positions at the same depth. Most winning 2NRs go for one or two.",
                    "Asking cross-examination questions that do not set up the next speech. Each question should come back as an argument.",
                ]},
            ]),
            ("A 15-minute Policy drill", [
                {"steps": [
                    "Four minutes: write a disadvantage against your own plan, with one sentence each for uniqueness, link, internal link and impact.",
                    "Two minutes: read it aloud as if it were in the 1NC.",
                    "Five minutes: write a 2AC frontline of four answers, labelled by the part of the DA each one attacks.",
                    "Three minutes: deliver the frontline, timed against the Policy preset's 2AC slot so you can see how much of eight minutes it would take.",
                    "One minute: write the answer you would extend in the 1AR if you had time for only one.",
                ]},
                "{product} can do the opponent's half. Case Generator drafts an affirmative from the resolution, Case Attacker points to the weakest links in a plan or a disadvantage, and Factoids finds evidence leads with citations to read in full before you cut a card. Sparring does not run Policy rounds, so use the free timer for full-round practice with a partner.",
            ]),
        ],
        "faqs": [
            ("How long is a Policy debate round?", "The speeches and cross-examinations take 64 minutes. With eight minutes of prep per team, a round runs about 80 minutes before any decision."),
            ("What is the negative block?", "The second negative constructive and the first negative rebuttal, which run back to back. The negative usually splits positions between the two speeches so the 1AR has to answer both."),
            ("Does a counterplan have to be competitive?", "Yes. If the affirmative can do the plan and the counterplan together without losing anything, the counterplan is not a reason to reject the plan."),
            ("Do I have to speak fast in Policy?", "No. Many circuits debate quickly, but speed only helps if the judge can follow it. Ask for the judge's preferences and adjust."),
        ],
    },
    "british-parliamentary-debate": {
        "modified": "2026-10-26",
        "features": [
            ("Eight speakers, four teams", "What the Prime Minister through the Opposition Whip each owe the debate, shown on one practice motion."),
            ("Finding an extension", "Three ways a closing team finds material its opening half has not used, and why a thin one loses to the opening."),
            ("POIs and protected time", "Offering and taking points of information between the first and sixth minute, under fifteen seconds each."),
        ],
        "sections": [
            ("The round under the WUDC manual", [
                "British Parliamentary (BP) is the format of the World Universities Debating Championship and many university and school competitions. Four teams of two debate one motion: Opening Government (OG), Opening Opposition (OO), Closing Government (CG) and Closing Opposition (CO). Teams get 15 minutes to prepare after the motion is released, with no internet and no help from anyone but their partner. The [WUDC Debating & Judging Manual](https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf) sets this order:",
                {"table": {"head": ["Speech", "Team", "Time"], "rows": [
                    ["Prime Minister (PM)", "Opening Government", "7 minutes"],
                    ["Leader of the Opposition (LO)", "Opening Opposition", "7 minutes"],
                    ["Deputy Prime Minister (DPM)", "Opening Government", "7 minutes"],
                    ["Deputy Leader of the Opposition (DLO)", "Opening Opposition", "7 minutes"],
                    ["Member of Government (MG)", "Closing Government", "7 minutes"],
                    ["Member of Opposition (MO)", "Closing Opposition", "7 minutes"],
                    ["Government Whip (GW)", "Closing Government", "7 minutes"],
                    ["Opposition Whip (OW)", "Closing Opposition", "7 minutes"],
                ]}},
                "Points of information can be offered between the end of the first minute and the end of the sixth; the first and last minutes are protected. Signals sound at 1:00, 6:00 and 7:00, and judges disregard anything said after 7:15. The manual calls the member speakers Government Member and Opposition Member; the timer uses MG and MO. The [free debate timer with the BP preset](/tools/debate-timer?format=bp) knocks at each signal.",
                "At the end, the judges rank the four teams from first to fourth. There are no draws, and a team can beat the other team on its own side of the table. At WUDC, a first place is worth three team points, second two, third one and fourth none.",
            ]),
            ("Worked example: all eight speakers on one motion", [
                {"example": {"title": "Practice motion: This House would give each city neighbourhood a binding vote on new chain stores opening there", "rows": [
                    ("PM:", "Defines the model: a chain is a business with ten or more outlets, a planning application triggers a vote of the ward's residents, and a majority against blocks the permit. First argument: residents bear the costs of a changed high street, so they should decide."),
                    ("LO:", "Rebuts the model's fairness, since turnout in local votes skews toward older homeowners. Argues the vote protects incumbent businesses and raises prices for the residents least able to pay."),
                    ("DPM:", "Answers the turnout point and adds a second argument: independent shops keep more spending in the area and give a neighbourhood a reason to visit."),
                    ("DLO:", "Rebuts the local spending claim and adds that blocked chains move to the next ward, so the policy shifts costs rather than removing them."),
                    ("MG extension:", "The vote changes chains' behaviour before any ballot. To win, a chain offers local hiring, smaller formats or design concessions, so most neighbourhoods get better chain stores rather than none."),
                    ("MO extension:", "Distribution across the city: wealthier wards organise and vote chains out, poorer wards do not, so low-wage retail and its traffic concentrate where residents already have least say."),
                    ("GW:", "Organises the debate into two clashes, local control and who pays, shows why the government bench wins both, and argues that the MG's negotiation mechanism is the strongest material on that bench. No new arguments."),
                    ("OW:", "Does the same for opposition, arguing the MO's distribution point outweighs because it applies citywide. No new arguments."),
                ]}},
                "Both extensions work because they move the debate. The MG adds a mechanism the opening did not consider, and the MO adds a stakeholder comparison across the whole city. A closing team that only explained the opening's arguments better would struggle to rank above that opening.",
            ]),
            ("How to find an extension", [
                "The manual defines an extension as anything that side of the debate has not yet said, but a closing team is credited only for what goes beyond its opening half. In 15 minutes of prep, a closing team should prepare two or three candidate extensions and choose once the opening speeches are known.",
                {"list": [
                    "A new mechanism: how the policy changes behaviour before or after it takes effect, as in the MG example.",
                    "A new stakeholder or scale: a group, a region or a time frame the opening half did not weigh.",
                    "A new comparison: a reason the clash the opening half won matters more than the clash it lost.",
                ]},
                "Check every candidate against the opening's material during their speeches. If OG or OO already ran your best idea, drop it and use the next one; repeating the opening is the most common reason a closing team ranks below it.",
            ]),
            ("Points of information", [
                "A POI lasts up to fifteen seconds and can be a question or a comment. The manual says teams should take at least one POI per speaker and encourages three across the team, including one from the team on the diagonal. Offer them often, keep them short, and aim at the one link a speech depends on. When you take one, answer in a sentence and go back to your structure.",
            ]),
            ("Common BP mistakes", [
                {"list": [
                    "An opening government model so vague that the opposition can define the debate instead.",
                    "A closing team that contradicts its opening half. The manual calls this knifing and allows it only in rare cases.",
                    "A whip speech that adds new arguments. Judges ignore them, and the time is lost.",
                    "Refusing every POI, which reads as avoiding the strongest objection.",
                    "Weighing only against the team opposite, when the ranking also depends on the team on your own bench.",
                ]},
            ]),
            ("A 15-minute BP drill", [
                {"steps": [
                    "One minute: pick a motion from the [free debate motion generator](/tools/debate-motion-generator) and assign yourself closing government.",
                    "Five minutes: write the two arguments you expect opening government to run.",
                    "Five minutes: write two extensions that neither argument covers, one mechanism and one stakeholder.",
                    "Three minutes: deliver the strongest extension out loud against the BP preset, offering yourself one POI at the two-minute mark.",
                    "One minute: write the sentence a whip would use to say why that extension beats the opening's material.",
                ]},
                "Brainstorm in {product} maps angles for both benches of a motion, which helps with the five-minute extension step, and Case Attacker tests whether an extension depends on a weak link. Sparring does not run BP rounds.",
            ]),
        ],
        "faqs": [
            ("How long is each speech in British Parliamentary debate?", "Seven minutes. The first and last minutes are protected from points of information, and judges disregard material after seven minutes and fifteen seconds."),
            ("How much preparation time do teams get?", "Fifteen minutes after the motion is released. Partners may confer with each other, but not with coaches or anyone else, and may not use the internet."),
            ("Can a whip bring new arguments?", "No. A whip may add new rebuttal, examples and explanation of existing arguments, but judges ignore new arguments."),
            ("Can a closing team beat its opening half?", "Yes, if its exclusive contribution is more persuasive than what the opening half added. A minimal extension usually ranks below the opening."),
        ],
    },
    "congress-debate": {
        "modified": "2026-10-26",
        "features": [
            ("Speech and question times", "Three-minute speeches, two minutes of questions after the first two and one minute after the rest."),
            ("Precedence and recency", "How the presiding officer chooses speakers, and what that means for when to stand."),
            ("A worked example", "The authorship, first negative, a mid-cycle speech and a crystallization on one original practice bill."),
        ],
        "sections": [
            ("How a session runs", [
                "Congressional Debate models a legislature. A chamber of students debates bills and resolutions written by schools, one at a time, and a presiding officer elected by the chamber runs the floor. Scorers evaluate every speech, including how the speaker answers questions, and a parliamentarian advises the chair on procedure. The [NSDA High School Unified Manual](https://www.speechanddebate.org/high-school-unified-manual/) sets a session at three hours or more, with 18 to 20 students as the optimum and no more than 30. Each new session elects a presiding officer and resets the seating chart and precedence.",
                {"table": {"head": ["Speech", "Speaking time", "Questioning after it"], "rows": [
                    ["Authorship or sponsorship (introduces the legislation)", "Up to 3 minutes", "2 minutes"],
                    ["First negative", "Up to 3 minutes", "2 minutes"],
                    ["Every later speech, alternating affirmative and negative", "Up to 3 minutes", "1 minute"],
                ]}},
                "A student from the school that wrote the legislation gives the authorship. If no one from that school is in the chamber, another student can sponsor it. NSDA district and national tournaments use direct questioning, where each questioner gets up to 30 seconds of back-and-forth with the speaker. Under traditional questioning, each questioner asks one brief question at a time. The free debate timer has no Congress preset, but its custom format can hold three-minute speeches and questioning blocks.",
            ]),
            ("Precedence and recency", [
                "When more than one student stands, the presiding officer first picks students who have not spoken that session, then those who have spoken fewer times, then those who spoke least recently. NSDA district and national tournaments preset a randomized recency order before the session starts. Because of that rule, your first speech matters most: the chamber decides early which bills get a full debate, and later speeches compete with every student who has not spoken yet.",
            ]),
            ("Worked example: one bill through the cycle", [
                {"example": {"title": "Practice bill: A Bill to Require Federal Agencies to Publish Plain-Language Summaries of New Regulations", "rows": [
                    ("Authorship:", "States the problem, that people affected by a rule often cannot tell what it requires, then walks through the bill's sections: a one-page summary for each final rule, a readability standard and a date it takes effect. Closes with the strongest impact."),
                    ("First negative:", "Accepts the goal and attacks the mechanism: a summary that differs from the rule's legal text invites confusion and lawsuits over which one governs."),
                    ("Mid-cycle affirmative:", "Names the first negative and answers the conflict point directly: the bill can state that the legal text controls. Adds new analysis on who benefits most, small businesses without legal staff."),
                    ("Direct question to that speaker:", "If the legal text controls, what happens to a business that relied on the summary in good faith?"),
                    ("Crystallization, late in the cycle:", "Names the two clashes the chamber has debated, legal certainty and access for small businesses, says which speakers carried each, and explains why the affirmative side wins both. No new arguments."),
                ]}},
                "The mid-cycle speech earns its score by refuting a named speaker and adding one new point. A speech that repeats the authorship's arguments, however polished, gives scorers little to reward.",
            ]),
            ("What each kind of speech is for", [
                {"h3": "Authorship and sponsorship"},
                "Explain the problem, what the legislation does section by section, and why it solves the problem. Two minutes of questions follow, so prepare for the obvious objections before you stand.",
                {"h3": "Refutation speeches"},
                "From the first negative onward, a strong speech answers a named earlier speaker and adds something new: a new argument, new evidence or a new stakeholder. Prepare two or three short points per side for each bill on the docket so you can speak whenever the floor opens.",
                {"h3": "Crystallization"},
                "Late in the debate on a bill, a crystallization speech summarizes the main clashes, credits the speakers who carried each one and explains which side wins. It works only when the chamber has debated the bill long enough for clear clashes to exist.",
            ]),
            ("Common Congress mistakes", [
                {"list": [
                    "Rehashing the arguments earlier speakers made, without naming them or adding anything.",
                    "Writing one speech per bill and having nothing to say when the debate moves on.",
                    "Asking questions that are speeches in disguise. Presiding officers discourage statements during questioning.",
                    "Giving a crystallization speech too early, before the debate has clashes to summarize.",
                    "Speaking on the wrong side when called. NSDA rules deduct at least three points for it.",
                ]},
            ]),
            ("A 15-minute Congress drill", [
                {"steps": [
                    "Three minutes: read one bill from your docket and write the problem, the mechanism and one objection in a sentence each.",
                    "Four minutes: write a mid-cycle negative speech outline that names an imaginary affirmative speaker and answers their point.",
                    "Three minutes: deliver it against a three-minute timer.",
                    "Three minutes: write three direct-questioning questions you would ask the authorship, each under ten seconds to say.",
                    "Two minutes: write the opening two sentences of a crystallization for the same bill.",
                ]},
                "Ask Coach in {product} can explain a bill's likely objections, and Factoids finds evidence leads with citations to check before you quote them. Crossfire drills cross-examination, which is close practice for direct questioning. Sparring does not run Congress sessions.",
            ]),
        ],
        "faqs": [
            ("How long is a Congressional Debate speech?", "Up to three minutes. The authorship or sponsorship and the first negative speech are each followed by two minutes of questioning, and every later speech by one minute."),
            ("What is the difference between authorship and sponsorship?", "An authorship is given by a student from the school that wrote the legislation. A sponsorship is the same introductory speech given by another student when no author is present."),
            ("What is direct questioning?", "A questioning method in which the presiding officer recognizes each questioner for up to 30 seconds of back-and-forth with the speaker. NSDA district and national tournaments use it."),
            ("When should I give a crystallization speech?", "Late in the debate on a bill, once there are clear clashes to summarize. It names those clashes and explains which side won them, without new arguments."),
        ],
    },
    "debate-clash-points": {
        "modified": "2026-10-28",
        "h1": "Clash and Collapse: Find the Key Argument and Go All In",
        "lead": "Map every disagreement, pick the one the judge has to resolve, and spend your last speeches there.",
        "features": [
            ("Map the clashes", "List every point where the two sides disagree, and sort out direct clash from arguments that only pass each other."),
            ("Choose the deciding clash", "Four questions that tell you which disagreement wins the round if you win it, and which you can afford to lose."),
            ("Collapse cleanly", "Drop the rest on purpose, say so, and use the time you saved on weighing."),
        ],
        "sections": [
            ("What counts as a clash", [
                "A clash is a point where both sides make claims that cannot both be true, or that pull the judge in opposite directions. It is not the same as two arguments on the same topic. If the proposition says a policy raises test scores and the opposition says it hurts student wellbeing, those arguments can both be true; until someone compares them, they pass each other and the judge has to do the comparing.",
                "Clashes usually come in three kinds:",
                {"list": [
                    "Factual or causal: will the policy actually cause the outcome? This is where most rebuttal happens.",
                    "Comparative: both outcomes are real, so which matters more? This is weighing, and it is where most close rounds are decided.",
                    "How the judge should decide (the framework): what test should the judge use? In Lincoln-Douglas this is the goal and the test for reaching it; in other formats it is what each side has agreed to prove.",
                ]},
            ]),
            ("How to find the clash that decides the round", [
                "Midway through the round, write each open disagreement on one line of your flow. Then ask four questions of each line:",
                {"steps": [
                    "If we win only this clash, do we win the round?",
                    "If we lose this clash, can we still win?",
                    "Do we have the stronger reason here, or only more material?",
                    "How much speaking time does it take to win it properly?",
                ]},
                "The deciding clash is usually the one where the first answer is yes and the second is no. If two clashes both pass that test, pick the one where your reasoning is stronger. A clash you can win in thirty seconds of explanation is worth more than one that needs three minutes of evidence.",
            ]),
            ("Worked example: from five clashes to one", [
                {"example": {"title": "Practice motion: This House would replace homework with a longer school day", "rows": [
                    ("Clashes on the flow after the first speeches:", "Learning outcomes, equity for students without a quiet place to study, family time, teacher workload and cost to schools."),
                    ("Proposition's choice:", "Equity. If extra practice happens at school, every student gets the same conditions; the opposition's answer, that schools could open study rooms, concedes that home conditions differ."),
                    ("What proposition drops:", "Teacher workload and cost, which they were losing, and family time, which the opposition never weighed."),
                    ("How they say it:", "\"Three clashes are left. We will win on equity, and we will show why it outweighs the cost argument even if the opposition is right about the budget.\""),
                    ("Opposition's best reply:", "Make learning outcomes the deciding clash instead, arguing that longer days add fatigue rather than learning, so equal conditions for less learning is no gain."),
                ]}},
                "Both teams are now arguing about which clash matters, and that comparison is what a judge writes on the ballot. The team that names the deciding clash first usually sets the terms for the rest of the round.",
            ]),
            ("Collapsing: why fewer arguments win", [
                "Collapsing means choosing the few arguments you are winning and spending your remaining time on them, instead of extending everything at the same depth. Late speeches are short. Every argument you keep costs time you could spend explaining why it is true and weighing it against the opponent's best point.",
                "To collapse cleanly, say what you are going for, answer what the opponent said about it, and weigh. If you drop an argument the opponent has turned into a reason to vote against you, you still have to answer the turn, or concede the defence that takes the turn away; otherwise the dropped argument becomes their offense.",
            ]),
            ("Where each format collapses", [
                {"table": {"head": ["Format", "Where the collapse happens", "Time"], "rows": [
                    ["Public Forum", "Summary, then final focus extends only what summary did", "3 minutes, then 2"],
                    ["Lincoln-Douglas", "Negative rebuttal and second affirmative rebuttal", "6 and 3 minutes"],
                    ["Policy", "Second negative and second affirmative rebuttals", "5 minutes each"],
                    ["British Parliamentary", "Whip speeches, which organise the debate into clashes without new arguments", "7 minutes"],
                    ["World Schools", "Third speeches organise the clashes; reply speeches give the biased summary", "8 and 4 minutes"],
                ]}},
                "These times come from the formats the [free debate timer](/tools/debate-timer) runs. Practise the collapse against the exact slot, because a two-minute final focus fits one issue well and two at most.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "Extending every argument in the last speech because dropping one feels like losing it.",
                    "Collapsing to the argument you prepared best instead of the one you are winning in this round.",
                    "Calling a clash \"the key issue\" without explaining why the judge cannot decide the round without it.",
                    "Dropping an argument that the opponent turned, which hands them a free reason to vote.",
                    "Switching the deciding clash between summary and final focus, or between the block and the 2NR.",
                ]},
            ]),
            ("A 12-minute clash drill", [
                {"steps": [
                    "Three minutes: take a flow from a recent round or a Sparring transcript and write every open disagreement on its own line.",
                    "Two minutes: answer the four questions above for each line and circle one clash.",
                    "Four minutes: give a two-minute final speech on that clash alone, timed, then a second version on the clash you did not circle.",
                    "Three minutes: write down which version was easier to weigh and why. That reason is your collapse test for the next round.",
                ]},
                "In {product}, Flowchart lays out a case's claims and links so the disagreements are easier to see, and Case Attacker shows which of your arguments has the weakest link before you decide what to keep.",
            ]),
        ],
        "faqs": [
            ("What is the difference between clash and weighing?", "Clash is the disagreement itself. Weighing is the comparison that tells the judge which side's winning arguments matter more when both sides win something."),
            ("How many arguments should I collapse to?", "Usually one or two. Last speeches are short, and one argument explained and weighed in depth beats three extended in a sentence each."),
            ("Is it risky to drop arguments?", "Only when the dropped argument has been turned against you. Answer the turn or concede the defence that removes it, and the rest can go."),
            ("When should I decide what to collapse to?", "Plan likely collapses before the round, then decide after the opponent's rebuttal, when you can see which clashes you are actually winning."),
        ],
    },
    "how-to-prepare-for-a-debate-tournament": {
        "modified": "2026-10-28",
        "h1": "How to Prepare for a Debate Tournament",
        "lead": "Plan the two weeks before, spend in-round prep on purpose, and arrive with a routine for every round.",
        "features": [
            ("A two-week plan", "What to research, write and practise each week once the topic or motion area is known."),
            ("Prep time by format", "How much preparation each format allows and when it happens, from the timer's format data."),
            ("Tournament-day routine", "What to check before each round, what to bring, and how to reset between rounds."),
        ],
        "sections": [
            ("Two weeks out: research and cases", [
                "For formats with a published topic, such as Public Forum, Lincoln-Douglas and Policy, the work starts when the topic is released. Read broadly on both sides before you write anything, because you will usually debate both. List the three or four clashes the topic seems to turn on, and note which ones have strong evidence on each side.",
                "Then write a case for each side. Keep each one short enough to finish in the constructive time with room to spare, and mark every claim that still needs evidence. For impromptu formats such as British Parliamentary and many World Schools rounds, you cannot prepare the motion, so prepare the ground instead: read the news on likely motion areas and practise building a case in the prep time you will get.",
            ]),
            ("One week out: blocks and practice rounds", [
                "Use the second week to write blocks, which are short prepared answers to the arguments you expect. The [rebuttal practice guide](/how-to-practice-rebuttals) explains how to build and organise a block file. Run at least two full practice rounds on each side at real speech times, and rewrite the part of the case that lost each one.",
                "Two days before, stop adding material. Print or download what you need, check every quoted card against its source, and practise the first speech until you can give it without reading every word.",
            ]),
            ("Prep time by format", [
                "How much preparation you get, and when, changes how you should prepare. These figures are the defaults the [free debate timer](/tools/debate-timer) uses; tournaments can change them, so check the invitation.",
                {"table": {"head": ["Format", "Preparation", "When it happens"], "rows": [
                    ["Public Forum", "3 minutes per team", "During the round, between speeches"],
                    ["Lincoln-Douglas", "4 minutes per debater", "During the round, between speeches"],
                    ["Policy", "8 minutes per team", "During the round, between speeches"],
                    ["British Parliamentary", "15 minutes", "Before the round, after the motion is released"],
                    ["World Schools", "About 1 hour for impromptu motions", "Before the round; prepared motions are released weeks ahead"],
                    ["Asian Parliamentary", "30 minutes", "Before the round"],
                ]}},
                "The in-round figures follow the [NSDA High School Unified Manual](https://www.speechanddebate.org/high-school-unified-manual/), and the BP figure follows the [WUDC Debating & Judging Manual](https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf).",
            ]),
            ("Spending in-round prep well", [
                "A prep bank is the total time a side may use between speeches. The usual mistake is spending it early, on the speech that matters least. Save most of it for the speeches where you have to choose what to collapse to, such as summary and final focus in Public Forum or the 2NR and 2AR in Policy.",
                "Use prep for decisions, not research. In a minute of prep you can decide which clash to go for, order your responses and write the weighing line; you cannot read a new article properly. If you need new evidence mid-round, your preparation before the tournament missed something, and the fix belongs in next week's plan.",
            ]),
            ("Worked example: a two-week plan on one resolution", [
                {"example": {"title": "Practice resolution: Resolved: National parks should cap daily visitor numbers", "rows": [
                    ("Days 1 to 3:", "Read on both sides and list the clashes: protecting ecosystems, fair access for people who cannot book ahead, and the effect on towns that depend on park visitors."),
                    ("Days 4 to 7:", "Write a pro case on ecosystem damage and a con case on fair access, two arguments each, and mark the evidence each claim still needs."),
                    ("Days 8 to 11:", "Write blocks against the three arguments you expect most, including the claim that timed entry already solves crowding. Run one practice round on each side."),
                    ("Days 12 and 13:", "Fix what lost the practice rounds and check every card against its source."),
                    ("In round, Public Forum:", "Keep at least two of the three prep minutes for summary and final focus, where you choose between the ecosystem and access clashes."),
                ]}},
            ]),
            ("Tournament-day checklist", [
                {"list": [
                    "Your cases and blocks for both sides, on paper or offline, plus a charger.",
                    "Pens, paper for flowing, a timer, water and food for the gaps between rounds.",
                    "The schedule and room list, and the judge's paradigm if your tournament publishes one, read before the round starts.",
                    "A two-line note after each round: why you won or lost, and one thing to change in the next round.",
                ]},
                "Mental stamina matters. A short routine between rounds, such as eating, reading your note and checking the next pairing, keeps a bad round from carrying into the next one.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "Preparing only the side you prefer and meeting the other one for the first time in round.",
                    "Adding new material the night before instead of practising what you already have.",
                    "Spending prep time early on constructive tweaks and arriving at the final speech with none left.",
                    "Using prep to look for evidence rather than to decide strategy.",
                    "Skipping the judge's paradigm when the tournament publishes one.",
                ]},
            ]),
            ("A 15-minute prep-time drill", [
                {"steps": [
                    "Set the timer to your format's prep bank, for example three minutes for Public Forum.",
                    "Read a speech you need to answer, from a practice round or a recording, and start the prep clock.",
                    "Spend no more than a third of the bank, then stop and give your speech.",
                    "Repeat for the final speech with the rest of the bank, choosing one clash to collapse to before you start talking.",
                    "Afterwards, write down which prep decision changed the speech most. That is where prep time is worth spending.",
                ]},
                "{product} helps with the two weeks before. Brainstorm explores angles for both sides of a topic, Case Generator drafts a structured case to start from, and Sparring runs full practice rounds in Public Forum, Lincoln-Douglas and School 4-6-6-3 with a judged verdict.",
            ]),
        ],
        "faqs": [
            ("How far ahead should I start preparing for a tournament?", "Start when the topic is released, and give yourself at least two weeks for a new topic: one for research and cases, one for blocks and practice rounds."),
            ("How should I split prep time in a round?", "Spend little on the early speeches and save most of it for the final ones, where you decide what to collapse to and how to weigh it."),
            ("How do I prepare for impromptu motions?", "Read the news on likely motion areas, practise building a case inside the real prep time, and drill each speaker role so the team can adapt to any motion."),
            ("Should I write new arguments the night before?", "No. Use the last two days to check sources and practise the material you have; new arguments written late are usually the ones that fail under cross-examination."),
        ],
    },
    "debate-speech-structure": {
        "modified": "2026-10-28",
        "h1": "Debate Speech Structure and Delivery",
        "lead": "Build every speech so the judge can flow it, then deliver it so they hear every word.",
        "features": [
            ("Three speech shapes", "What a constructive, a rebuttal and a final speech each have to do, with a skeleton for each."),
            ("A timed outline", "One four-minute speech broken into time marks, so you know what each minute is for."),
            ("Delivery that lands", "Pace, pauses, emphasis and pronunciation habits that make an argument easier to follow."),
        ],
        "sections": [
            ("What every speech shares", [
                "Judges write down what they can follow. A structured speech gives them the place to write each point: a roadmap at the start, a signpost before each argument, and a closing line that tells them what to do with it.",
                {"list": [
                    "Roadmap: one sentence listing what you will cover, in order.",
                    "Signposts: \"On their first argument\" or \"Our second argument\" before each section, so the judge knows which part of the flow you are on.",
                    "For each point, give the reason it is true (debaters call this the warrant) and say why it matters to the decision.",
                    "Weighing: a comparison with the other side's best point, not only a statement that yours is important.",
                    "Close: one sentence that tells the judge why your side wins.",
                ]},
            ]),
            ("Three speech shapes", [
                {"h3": "Constructive"},
                "Open with your position and any definitions the round needs, then give each argument with an explanation, evidence and why it matters. Preview the weighing in the last thirty seconds, so the judge knows how you want the round compared before the other side speaks.",
                {"h3": "Rebuttal"},
                "Answer the arguments that decide the round first, challenge the reasons behind their conclusions, and group similar points so one answer covers several. If time allows, rebuild your own case against what was said about it.",
                {"h3": "Final speech"},
                "Name the one or two clashes that decide the round, explain why you win each, and weigh. Do not add new arguments: the other side has no chance to answer them, and most judges ignore them.",
            ]),
            ("Speech times by format", [
                {"table": {"head": ["Format", "Constructive or substantive", "Rebuttal", "Final speech"], "rows": [
                    ["Public Forum", "4 minutes", "4 minutes", "Summary 3, final focus 2"],
                    ["Lincoln-Douglas", "Affirmative 6, negative 7", "1AR 4, NR 6", "2AR 3"],
                    ["Policy", "8 minutes each", "5 minutes each", "2NR and 2AR, 5 each"],
                    ["British Parliamentary", "7 minutes", "Within each 7-minute speech", "Whips, 7 minutes"],
                    ["World Schools", "8 minutes", "Within each 8-minute speech", "Reply, 4 minutes"],
                ]}},
                "The [free debate timer](/tools/debate-timer) runs each of these. Paste a written speech into the [speech time calculator](/tools/speech-time-calculator) to see whether it fits its slot before you practise it aloud.",
            ]),
            ("Worked example: a four-minute rebuttal, minute by minute", [
                {"example": {"title": "Practice motion: This House would let students choose their own school uniform supplier", "rows": [
                    ("0:00 to 0:15, roadmap:", "\"Two responses to their cost argument, one to their identity argument, then why our case still stands.\""),
                    ("0:15 to 1:30, cost:", "Their reason is that a single supplier gets bulk discounts. Answer: discounts only matter if they reach families, and a single supplier has no reason to pass them on."),
                    ("1:30 to 2:30, identity:", "They say a common supplier keeps uniforms identical. Answer: a design standard does that; who sells the uniform does not change what it looks like."),
                    ("2:30 to 3:30, rebuild:", "Extend our competition argument, because their cost case assumed the supplier passes on savings, and we have shown it does not have to."),
                    ("3:30 to 4:00, weigh and close:", "Families pay every year under a single supplier, while the identity harm is solved by a design rule, so the cost clash decides the debate."),
                ]}},
                "Each block has one job and a time budget. If the cost answer runs long, the rebuild shrinks, not the weighing: the last thirty seconds are what the judge remembers when filling in the ballot.",
            ]),
            ("Delivery and pronunciation", [
                "The judge cannot vote for an argument they did not hear. Clear delivery is less about sounding polished and more about making the structure audible.",
                {"list": [
                    "Slow down on tags, signposts and the weighing line; the explanation in between can be faster.",
                    "Pause for a beat after each signpost so the judge can find the place on their flow.",
                    "Stress the word that carries the argument, such as \"only\", \"never\" or \"even if\", instead of stressing every word.",
                    "Practise saying names, places and technical terms before the round; a stumble on an author's name costs more credibility than the time it takes.",
                    "Vary pitch at section changes. A flat voice makes every point sound equally important, which is the opposite of weighing.",
                ]},
                "Record a practice speech and listen back once for content and once for delivery only. Most speakers find they rush the parts that matter most.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "No roadmap, so the judge spends the first minute working out which argument you are answering.",
                    "Answering arguments in the order they were made rather than in order of importance.",
                    "Final speeches that list arguments without weighing them against anything.",
                    "Speeding up when time is short, which usually means the last and most important point is the hardest to hear.",
                    "Reading word for word from a script, which flattens delivery and makes it hard to adapt to what was said.",
                ]},
            ]),
            ("A 15-minute structure and delivery drill", [
                {"steps": [
                    "Three minutes: write a roadmap and signposts for a rebuttal against a speech you have on paper.",
                    "Four minutes: deliver it, timed, and record it.",
                    "Three minutes: listen back and mark every place where the judge would not know which point you were on.",
                    "Four minutes: deliver it again with a pause after each signpost and the weighing line slowed down.",
                    "One minute: compare the two recordings and note one delivery habit to keep.",
                ]},
                "Sparring in {product} has a voice mode, so you can speak each speech rather than type it, and the round ends with a judged verdict on the argument. Ask Coach can review a written speech's structure before you practise it aloud.",
            ]),
        ],
        "faqs": [
            ("What is a roadmap in debate?", "A one-sentence preview at the start of a speech that lists what you will cover, in order, so the judge can follow along on their flow."),
            ("Should I write out my whole speech?", "Write constructives in full if you like, but speak rebuttals and final speeches from notes, so you can answer what was actually said."),
            ("How fast should I speak?", "As fast as your judge can follow. With a lay judge, use a normal conversational pace; with an experienced flow judge you can go faster, but keep signposts and weighing slow."),
            ("How do I stop rushing at the end of a speech?", "Budget each section's time in advance and practise against a timer. Cut material from the middle, never the weighing at the end."),
        ],
    },
    "debate-fallacies": {
        "modified": "2026-10-28",
        "features": [
            ("Fallacies in context", "Each fallacy shown inside an argument you could hear in a round, not as a textbook definition."),
            ("One-sentence answers", "A reply for each that explains why the reasoning fails, which is what judges actually reward."),
            ("When it is not a fallacy", "How to tell a weak argument from an invalid one, so you do not spend time on the wrong attack."),
        ],
        "sections": [
            ("Name the failure, not the label", [
                "A fallacy is a flaw in reasoning: the conclusion does not follow from the premises, even if each premise sounds right. In a round, the Latin name earns nothing on its own. Judges reward the explanation of why the step fails and what is left of the argument once it does.",
                "That is why the answers below are full sentences. Each one points at the missing step, so the judge can see the gap without knowing the term.",
            ]),
            ("Eight fallacies inside real-style arguments", [
                "Each example is set on one practice motion, This House would ban single-use plastic packaging in supermarkets, so you can see how the same debate produces different flaws.",
                {"table": {"head": ["Fallacy", "How it sounds in the round", "One-sentence answer"], "rows": [
                    ["Ad hominem", "\"The proposition's evidence comes from an environmental group, so we can ignore it.\"", "Who funded the study tells us to check it, not that it is wrong; point to what in the method fails."],
                    ["Straw man", "\"They want to ban all plastic, including medical packaging.\"", "Our model covers single-use packaging in supermarkets only, so the medical harm is not in this debate."],
                    ["False dilemma", "\"Either we ban plastic packaging or we accept plastic in the ocean forever.\"", "There are other options, such as deposit schemes, and the proposition has to show the ban beats them."],
                    ["Slippery slope", "\"If supermarkets ban plastic today, governments will ban every product they dislike tomorrow.\"", "No step explains why one packaging rule leads to product bans, so the chain has no links."],
                    ["Hasty generalization", "\"One shop in our town went plastic-free and closed, so the ban will close supermarkets.\"", "One shop is not a pattern, and it closed for reasons the opposition has not shown were the packaging."],
                    ["Appeal to authority", "\"A famous chef says plastic-free kitchens are better, so the ban is right.\"", "A chef is an authority on cooking, not on supply chains, so the claim still needs its own evidence."],
                    ["Circular reasoning", "\"The ban is necessary because we need to stop using this packaging.\"", "That restates the motion; we still need a reason the packaging causes harm."],
                    ["Correlation as causation", "\"Plastic use rose as obesity rose, so plastic packaging causes obesity.\"", "Two trends rising together do not show one causes the other, and the opposition offers no mechanism."],
                ]}},
            ]),
            ("When it is not a fallacy", [
                "Not every bad argument is a fallacy, and some arguments that sound like fallacies are valid. A slippery slope is fair when each step has a reason: if a ban raises costs, and higher costs push small shops out, and fewer shops reduce access in rural areas, that is a causal chain to attack link by link, not dismiss.",
                "Appeals to expertise are also legitimate when the expert speaks inside their field. A food-safety regulator on packaging rules is evidence; the chef above is not. Attack the fit between the source and the claim rather than the use of a source.",
                "The [Stanford Encyclopedia of Philosophy entry on fallacies](https://plato.stanford.edu/entries/fallacies/) explains how philosophers disagree on where the line falls, which is a useful reminder that the label is less important than the reasoning.",
            ]),
            ("Using fallacies in cross-examination", [
                "Cross-examination is the best place to expose a flawed step, because you can make the opponent say it out loud. Ask for the missing link: \"What makes a supermarket rule lead to other product bans?\" If they cannot answer, quote that in your next speech. If they can, you have found the real argument, and that is the one to rebut.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "Naming a fallacy without explaining the gap, which sounds like a dismissal rather than an answer.",
                    "Calling every weak argument a fallacy. A claim with thin evidence is weak; it is not invalid.",
                    "Attacking the person or the source instead of the reasoning, which is itself an ad hominem.",
                    "Spending a whole rebuttal on one flawed example when the opponent's main reason still holds.",
                    "Forgetting to say what follows: once the step fails, tell the judge what the argument no longer proves.",
                ]},
            ]),
            ("A 12-minute fallacy drill", [
                {"steps": [
                    "Two minutes: pick a motion from the [free debate motion generator](/tools/debate-motion-generator).",
                    "Four minutes: write four flawed arguments on it, each using a different fallacy from the table.",
                    "Four minutes: swap with a partner, or come back after a break, and answer each one in a single sentence without naming the fallacy.",
                    "Two minutes: check whether each answer names the missing step. Rewrite any that only say the argument is wrong.",
                ]},
                "In {product}, Case Attacker looks for weak links in a case, including steps that do not follow, and Crossfire lets you practise asking for the missing link under questioning.",
            ]),
        ],
        "faqs": [
            ("Should I say the name of the fallacy in my speech?", "You can, but it is optional. What wins the point is explaining why the conclusion does not follow and what the argument no longer proves."),
            ("Is a slippery slope argument always a fallacy?", "No. It is a fallacy when the steps have no reasons behind them. When each step has a mechanism, it is a causal argument to attack link by link."),
            ("What is the most common fallacy in debate?", "Straw man arguments are among the most common, because it is easy to answer a more extreme version of the opponent's case than the one they gave."),
            ("Can pointing out a fallacy win a round?", "It can win a clash if the flawed step carries the argument. It wins a round only when that argument was one the opponent needed."),
        ],
    },
    "debate-motion-analysis": {
        "modified": "2026-10-28",
        "features": [
            ("Motion types", "What \"This House would\", \"believes\", \"regrets\" and actor motions each ask the proposition to prove."),
            ("Definitions and models", "Defining terms fairly enough to survive challenge and narrowly enough to defend."),
            ("A worked analysis", "One original motion taken from first reading to burdens, stakeholders and the likely clashes."),
        ],
        "sections": [
            ("Start with the motion type", [
                "The opening words of a motion set the burden. Parliamentary and World Schools motions use a few standard forms; topics in Public Forum, Lincoln-Douglas and Policy are written as resolutions, but the same questions apply.",
                {"table": {"head": ["Motion type", "What the proposition must show", "Example form"], "rows": [
                    ["Policy", "The change should happen, and it beats the status quo", "This House would require..."],
                    ["Value or belief", "A claim is true or a value outweighs another", "This House believes that..."],
                    ["Regret", "The world is worse because something happened, compared with a world where it did not", "This House regrets..."],
                    ["Actor", "A named actor should choose this, given that actor's interests", "This House, as a parent, would..."],
                ]}},
                "Reading the type wrong is costly. A regret motion debated as a policy motion leaves the proposition arguing about a future plan when the judge is comparing two versions of the past.",
            ]),
            ("Define, then model", [
                "Define only the terms that change the debate, and define them the way an ordinary reasonable person would read them. The [WUDC Debating & Judging Manual](https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf) calls a definition that evades the motion's burden a squirrel; its example is defining tolls on \"all roads\" as tolls on major motorways only. A squirrel can cost a team the round even if its arguments are good.",
                "For policy motions, add a model: who acts, what they do, when, and what is excluded. A model answers the questions the opposition would otherwise answer for you, and it gives your arguments a concrete mechanism to point to.",
            ]),
            ("Burdens and stakeholders", [
                "Write each side's burden in one sentence. The proposition's burden comes from the motion; the opposition's is usually to show the proposition fails it, or to defend a better alternative. If you cannot write the burden in a sentence, you do not yet know what the round is about.",
                "Then list who the motion affects, and how. Stakeholders are where new angles, further arguments and comparisons come from: an argument that names who is helped or harmed is easier to compare than one that talks about society in general.",
            ]),
            ("Worked example: one motion, analyzed", [
                {"example": {"title": "Practice motion: This House would let secondary students rate their teachers, with the ratings published", "rows": [
                    ("Type:", "Policy. The proposition must show the change is better than the current system of internal reviews."),
                    ("Terms to define:", "\"Rate\" as a short standard survey each term; \"published\" as visible to students and parents at the school, not on the open internet."),
                    ("Model:", "Results are shown per teacher after a minimum number of responses, and comments are not published."),
                    ("Proposition burden:", "Published ratings improve teaching, or student voice, more than the harm they do."),
                    ("Opposition burden:", "Published ratings harm teaching or teachers more than they help, or private ratings would do the same good with less harm."),
                    ("Stakeholders:", "Students, teachers, especially new and strict ones, parents choosing classes, and school leaders who already review teachers."),
                    ("Likely clashes:", "Whether ratings measure teaching or popularity; whether publication adds anything over private feedback; the effect on teacher recruitment."),
                ]}},
                "The \"publication adds anything\" clash is the one to prepare first. The opposition can concede that student feedback is useful and still win if private ratings capture the benefit without the harm, so the proposition needs a reason publication itself matters.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "Defining every word in the motion, including ones nobody disputes, and leaving less time for the case.",
                    "A definition so narrow it removes the debate, which judges treat as evading the burden.",
                    "Skipping the model on a policy motion, so the opposition attacks the worst version of your idea.",
                    "Treating stakeholders as a list to recite rather than a source of arguments and weighing.",
                    "Writing arguments before deciding what your side must prove, then discovering that an argument proves something the round does not need.",
                ]},
            ]),
            ("A 15-minute motion analysis drill", [
                {"steps": [
                    "One minute: draw a motion from the [free debate motion generator](/tools/debate-motion-generator) and name its type.",
                    "Three minutes: define the terms that matter and, for a policy motion, write a three-line model.",
                    "Three minutes: write each side's burden in one sentence and list four stakeholders.",
                    "Four minutes: name the three clashes you expect and pick the one you would prepare first.",
                    "Four minutes: give a one-minute opening that sets out the definition and burden, then repeat it for the other side.",
                ]},
                "Brainstorm in {product} explores angles on both sides of a motion, which is a quick check on whether your stakeholder list missed anyone, and Ask Coach can question your burden sentence before you build a case on it.",
            ]),
        ],
        "faqs": [
            ("What is a burden in debate?", "What a side must prove to win the round. The proposition's burden comes from the wording of the motion; the opposition's is usually to show it has not been met."),
            ("Can the opposition challenge a definition?", "Yes, if it is unreasonable or evades the motion. Challenge it early and explain why, then debate the motion as it should have been defined."),
            ("Do I need a model for every motion?", "Only for policy motions, where the proposition proposes a change. Value and regret motions need clear definitions and a comparison instead."),
            ("How long should motion analysis take in prep?", "In a short prep window, spend the first few minutes on type, definitions and burdens before writing any argument. Everything later depends on them."),
        ],
    },
    "debate-judge-adaptation": {
        "modified": "2026-10-28",
        "features": [
            ("Three kinds of judges", "What lay, flow and technical judges each reward, and what loses them."),
            ("Before the round", "Questions to ask and paradigms to read, so you adapt before your first sentence."),
            ("One argument, two judges", "A worked example of the same argument delivered for a lay judge and for a flow judge."),
        ],
        "sections": [
            ("What judges have in common", [
                "Every judge has to write a reason for their decision. Adapting means making that reason easy to write: a clear comparison they can repeat, in language they understand, at a pace they can follow. The style changes from judge to judge; the job does not.",
            ]),
            ("Three kinds of judges", [
                {"table": {"head": ["Judge", "What they reward", "How to adapt"], "rows": [
                    ["Lay judge (parent, teacher, community member)", "A clear story, plain language, confident delivery", "Fewer arguments, no jargon, a normal speaking pace and a one-sentence reason to vote"],
                    ["Flow judge (former debater or coach)", "Line-by-line clash, extensions, explicit weighing", "Signpost every response, repeat the reasons behind your key points, never drop a turned argument"],
                    ["Technical judge (experienced circuit judge)", "Evidence quality, strategic choices, rules disputes and how the judge should decide (the framework)", "Precise extensions, efficient speed if they allow it, clear interpretations on theory"],
                ]}},
                "Most judges sit somewhere between these. A former debater who now judges local tournaments may flow carefully but dislike speed, so read the individual, not the category.",
            ]),
            ("Before the round", [
                "Many tournaments publish judge paradigms, short statements of what a judge prefers. Read them during the pairing announcement. If there is no paradigm, ask politely before the round starts: \"Do you have any preferences on speed or on how you weigh?\" Most judges are glad to be asked.",
                "In British Parliamentary and other university formats, judges are asked to judge as the ordinary intelligent voter. The [WUDC Debating & Judging Manual](https://debate.ethz.ch/wp-content/uploads/2024/11/WUDC-Debating-Judging-Manual-Revised-November-2024-.pdf) describes that voter as someone who reads the front pages and world section of a major newspaper but no specialist literature. In practice that means explaining examples rather than just citing them, whoever the judge is.",
            ]),
            ("Reading the room during the round", [
                "Watch the judge while you speak. A judge who stops writing during a technical section has probably stopped following it; slow down and restate the point in plainer words. A judge who nods at a comparison is telling you which argument is landing, so spend your remaining time there.",
                "Adapt your cross-examination as well. Lay judges watch questioning as a contest of composure, so stay calm and brief. Flow judges listen for concessions, so make each one explicit and repeat it in your next speech.",
            ]),
            ("Worked example: one argument, two judges", [
                {"example": {"title": "Practice motion: This House would make public libraries open 24 hours in large cities", "rows": [
                    ("The argument:", "Night-shift workers cannot use libraries during standard hours, so 24-hour opening reaches people current hours exclude."),
                    ("For a lay judge:", "\"Think of a nurse who works nights. Today the library is closed every hour she is free. Opening all night is the only way she gets the same library everyone else has.\" One example, one clear impact, said slowly."),
                    ("For a flow judge:", "\"Return to our first argument: access for shift workers. Their only answer was cost, but they never contested that current hours exclude this group. Weigh it: exclusion is certain and ongoing; their cost harm depends on staffing numbers they never gave.\""),
                    ("What stays the same:", "The reason is still that current hours exclude a group, and you still compare that harm against cost. Only the wording and pace change."),
                ]}},
                "Neither version is better in general. The lay version would lose a careful flow judge, who wants to hear which response was dropped, and the flow version would lose a lay judge in the first ten seconds.",
            ]),
            ("Common mistakes", [
                {"list": [
                    "Treating adaptation as only changing speed, when the bigger change is how many arguments you run.",
                    "Using jargon such as \"extend\", \"turn\" or \"link\" with a lay judge without explaining what it means.",
                    "Giving a technical judge a story without line-by-line answers, so dropped arguments go uncounted.",
                    "Deciding a judge is lay from their appearance instead of reading their paradigm or asking.",
                    "Changing your arguments for the judge. Adapt the presentation and selection, not the claims you are willing to defend.",
                ]},
            ]),
            ("A 15-minute adaptation drill", [
                {"steps": [
                    "Two minutes: take one argument from your current case and write why it is true and why it matters in two sentences.",
                    "Four minutes: rewrite it as a lay-judge version with one concrete example and no debate vocabulary.",
                    "Four minutes: rewrite it as a flow-judge version with signposts, an extension and an explicit weighing line.",
                    "Four minutes: deliver both, timed at one minute each, and record them.",
                    "One minute: play both back and check that the reason is the same in each.",
                ]},
                "In {product}, Ask Coach can explain how a lay judge is likely to hear a block, and Sparring ends each round with a judged verdict that names the reason for the decision, which shows which comparison landed.",
            ]),
        ],
        "faqs": [
            ("What is a judge paradigm?", "A short statement, often published by the tournament, of what a judge prefers: speed, evidence, theory, and how they weigh arguments."),
            ("How do I know what kind of judge I have?", "Read their paradigm if there is one, ask before the round, and watch how they take notes once you start speaking."),
            ("Should I speak faster for an experienced judge?", "Only if their paradigm or answer says they are comfortable with it. Many experienced judges prefer a moderate pace with clear signposting."),
            ("What is the ordinary intelligent voter?", "The standard BP and many university judges are asked to use: a well-informed reader of the news without specialist knowledge, who needs examples explained."),
        ],
    },
    "best-ai-for-debate": {
        "published": "2026-10-29",
        "modified": "2026-10-30",
        "h1": "Which AI is best for debate?",
        "direct_answer": "DebateOwl is the top pick when you need a case you can read out loud, \"If they say X, we answer Y\" replies and timed practice rounds in one place, paid after a 3-day free trial. Claude or ChatGPT are the pick for open-ended sparring, SchoolAI for a teacher-run class, and Debate Ladder or ArguFight for scored ranked rounds.",
        "disclosure": "{product} makes one of the tools on this list. Facts about other products come from their own websites as of October 2026. Check them before you pay.",
        "picks": [
            ("Top pick:", "{product}. A case you can read out loud, \"If they say X, we answer Y\" replies, timed practice rounds and free debate tools; the app is $5/month after the trial."),
            ("Sparring and brainstorming:", "Claude or ChatGPT."),
            ("Classroom debates run by a teacher:", "SchoolAI."),
            ("Scored, ranked practice rounds:", "Debate Ladder (voice) or ArguFight (text, AI judge panel)."),
            ("Quick pro/con argument lists:", "HyperWrite Debate Assistant."),
            ("Public Forum only:", "PublicForumAI."),
            ("Mapping an argument visually:", "Symbai."),
        ],
        "items": [
            ("{product}", "https://debateowl.com/"),
            ("Claude", "https://claude.ai"),
            ("ChatGPT", "https://chatgpt.com"),
            ("SchoolAI", "https://schoolai.com"),
            ("Debate Ladder", "https://debateladder.com"),
            ("ArguFight", "https://argufight.com"),
            ("HyperWrite Debate Assistant", "https://hyperwriteai.com/aitools/debate-assistant"),
            ("PublicForumAI", "https://publicforumai.com"),
        ],
        "sections": [
            ("Why DebateOwl is the top pick", [
                "{product} is the top pick for students and competitive debaters who want a case they can say and practice rounds against the other side. These parts are in the app today:",
                {"list": [
                    "A case you can read out loud. The [case generator](/ai-debate-case-generator) writes it in the order you would say it: an opening, two to four arguments (each with an explanation, evidence and why it matters), a closing line and the sources it used.",
                    "\"If they say X, we answer Y\" replies. Each case includes \"If they say… we answer…\" answers to the other side. The second speech brings no new arguments: about two minutes reinforcing yours, then about four minutes of those replies.",
                    "Timed practice rounds. Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum against an AI opponent and ends with a verdict. Crossfire drills questioning.",
                    "Free tools, no account. The [free debate tools](/tools) are a [debate timer](/tools/debate-timer), a [motion generator](/tools/debate-motion-generator), a [flow sheet](/tools/debate-flow-sheet) and a [speech time calculator](/tools/speech-time-calculator), separate from the app.",
                    "$5/month. After the {trial_days}-day trial, Pro is {pro_price}. See [pricing](/debateowl-pricing).",
                ]},
                "The same workspace also has Attack (find weak points), Brainstorm, Factoids (evidence with citations), Ask (coach chat), a Library, a timer and a flowchart. It works in English, Spanish and Hungarian and exports to Word, PDF and Google Docs.",
                "Two limits are worth stating. Sparring does not run a full World Schools or BP round, so those formats use the prep tools. Evidence leads still need checking against the original source.",
            ]),
            ("Best AI for debate by goal", []),
            ("Where DebateOwl wins", [
                "Choose {product} when you want these together: a case you can read out loud, \"If they say X, we answer Y\" replies, timed practice rounds, [free debate tools](/tools), and $5/month after a {trial_days}-day trial.",
                "Use another tool on this page when the goal is only open-ended sparring, a teacher-run class, or a scored ranked ladder.",
            ]),
            ("What other tools are best for", [
                {"h3": "[Claude](https://claude.ai) (Anthropic)"},
                "Best for sparring on nuanced topics. People recommend it because it pushes back instead of just agreeing. As of October 2026, Claude models hold the top places on the public multi-turn LLM debate benchmark at [github.com/lechmazur/debate](https://github.com/lechmazur/debate). That benchmark has AI models debating each other, not students. Claude is free to start, with paid plans.",
                {"h3": "[ChatGPT](https://chatgpt.com) (OpenAI)"},
                "Best for brainstorming and counter-arguments. It is good for fast brainstorming, generating counter-arguments and Socratic back-and-forth. It has a free tier and paid plans. It doesn't keep a motion, side and speech times unless you set them up each time, and it tends to agree with you over a long chat. See [{product} vs ChatGPT](/debateowl-vs-chatgpt).",
                {"h3": "How to make a general model a better opponent"},
                {"list": [
                    "Assign it the other side explicitly.",
                    "Tell it not to concede unless your answer actually beats the point.",
                    "Ask for one specific weak point at a time.",
                ]},
                {"h3": "[SchoolAI](https://schoolai.com)"},
                "Best for teacher-run K-12 classroom debates. Teachers set up AI \"Spaces\", for example a debate Space, and watch students in real time on a Mission Control dashboard. SchoolAI says it is FERPA/COPPA compliant. It has a free trial (5 Space launches a year) and paid Pro/Scale plans for schools. It is built for a teacher running the debate, not for solo competitive prep.",
                {"h3": "[Debate Ladder](https://debateladder.com)"},
                "Best for voice practice with an Elo rating. You argue PRO or CON out loud (opening, rebuttal, closing) against an AI opponent, and an AI judge scores logic, responsiveness, clarity, delivery and persuasiveness. Ranked wins move your Elo, which starts at 500. New accounts get 100 free credits, and a debate costs about one credit per minute of speaking.",
                {"h3": "[ArguFight](https://argufight.com)"},
                "Best for scored text debates with an AI judge panel. Debates are against an AI or a real person. A panel of AI judge personas, each with a published paradigm, scores every debate 0–100. You get Elo rankings and belts. It is free to start.",
                {"h3": "[HyperWrite Debate Assistant](https://hyperwriteai.com/aitools/debate-assistant)"},
                "Best for quick pro/con argument lists. It generates pro and con arguments with supporting points. It writes text but doesn't debate you. HyperWrite has a limited free tier, and Premium is $19.99/month.",
                {"h3": "[PublicForumAI](https://publicforumai.com)"},
                "Best for Public Forum practice. It covers Public Forum only: cases, flows and practice rounds. Practice is free, and $9.99/month removes the round limit and adds sourced evidence.",
                {"h3": "Symbai"},
                "Best for mapping an argument visually. It combines argument mapping and debating and offers a free trial.",
            ]),
            ("Comparison table", [
                {"table": {
                    "head": ["Tool", "Best for", "Practice rounds against AI", "Case prep", "Formats", "Price (Oct 2026)"],
                    "rows": [
                        ["[{product}](/)", "School and competitive case prep plus timed practice", "Yes: timed Sparring with a verdict, Crossfire drills", "Yes: opening, arguments, \"If they say… we answer…\", closing, sources", "Sparring: School 4-6-6-3, LD, PF; prep tools for any format", "No free plan: {trial_days}-day free trial, then {pro_price}; [free tools](/tools)"],
                        ["[Claude](https://claude.ai)", "Sparring, nuanced topics", "Chat only (you set it up)", "Yes, by prompting", "Any (you set it up)", "Free tier, paid plans"],
                        ["[ChatGPT](https://chatgpt.com)", "Brainstorming, counter-arguments", "Chat only (you set it up)", "Yes, by prompting", "Any (you set it up)", "Free tier, paid plans"],
                        ["[SchoolAI](https://schoolai.com)", "Teacher-run K-12 classroom debates", "Through teacher-made Spaces", "Guided by the teacher's Space", "Classroom", "Free trial (5 Spaces/yr), paid school plans"],
                        ["[Debate Ladder](https://debateladder.com)", "Voice practice with an Elo rating", "Yes: opening, rebuttal, closing, AI judge", "No", "Its own 3-speech format", "100 free credits, then credits (~1/min)"],
                        ["[ArguFight](https://argufight.com)", "Scored text debates, AI judge panel", "Yes, vs AI or people", "No", "Its own round format", "Free to start"],
                        ["[HyperWrite Debate Assistant](https://hyperwriteai.com/aitools/debate-assistant)", "Quick pro/con argument lists", "No", "Generates arguments", "Any", "Limited free, Premium $19.99/mo"],
                        ["[PublicForumAI](https://publicforumai.com)", "Public Forum practice", "Yes", "Yes (PF cases)", "PF only", "Free practice, $9.99/mo unlimited"],
                    ],
                }},
                "Prices and features as of October 2026, from each product's website. Check before you subscribe.",
                "For a way to test tools on one motion, see [Best AI debate tools compared](/best-ai-debate-tools).",
            ]),
            ("Compare by question", [
                "Each of these pages answers one narrower question:",
                {"list": [
                    "[AI debate tools for teachers and debate clubs](/ai-debate-tools-for-teachers): five classroom scenarios, from a lesson with no sign-ups to a club preparing for a competition.",
                    "[The best AI for Public Forum](/best-ai-for-public-forum): tools compared speech by speech, from the constructive to final focus.",
                    "[ChatGPT vs Claude for debate](/chatgpt-vs-claude-for-debate): where each general chatbot fits, with prompts that make them argue back.",
                    "[{product} vs Debate Ladder](/debateowl-vs-debate-ladder): written case prep and timed rounds, or a ranked voice game.",
                    "[{product} vs ArguFight](/debateowl-vs-argufight): which debater should pick a case and timed rounds, and which should pick written rounds against people with AI judges.",
                    "[{product} vs MindDuel](/debateowl-vs-mindduel): one motion through both, from ten short spoken turns to a full timed round.",
                    "[Free vs paid AI debate tools](/free-vs-paid-ai-debate-tools): what $0 gets you and what paid plans add, with prices.",
                    "[Step-by-step debate prep with AI](/how-to-prepare-for-a-debate-with-ai): a seven-step plan and a worked second speech.",
                ]},
            ]),
            ("Which should you pick?", [
                "You have a tournament or school debate coming up and need a case you can read out loud, plus practice against the other side. {product} writes that case, with \"If they say X, we answer Y\" replies, and runs timed sparring.",
                "You're a teacher running a class debate. SchoolAI is for teacher-run K-12 classroom debates.",
                "You're new to debate and want someone to argue with tonight. Try Claude or ChatGPT first, then {product} when you want a case and timed rounds.",
            ]),
            ("Can you use AI during a debate round?", [
                "Usually not. Most leagues restrict electronics or AI during rounds. Check your league's rules and use AI for preparation.",
            ]),
        ],
        "faqs": [
            ("Which AI is best for debate?", "DebateOwl is the top pick for a case you can read out loud, \"If they say X, we answer Y\" replies and timed practice rounds; the app is paid after a 3-day free trial. Claude or ChatGPT fit open-ended sparring, SchoolAI a teacher-run class, and Debate Ladder or ArguFight scored ranked rounds."),
            ("Is ChatGPT or Claude better for debate practice?", "Both work. People often pick Claude for nuanced pushback and ChatGPT for fast brainstorming. Neither runs timed rounds unless you set that up yourself."),
            ("What is the best AI debate app for students?", "For a case you can read out loud and timed practice: DebateOwl. Classroom debates run by a teacher: SchoolAI. Ranked voice rounds: Debate Ladder."),
            ("Is there a free AI for debate practice?", "Yes. General models have free tiers, ArguFight is free to start, Debate Ladder gives 100 free credits and PublicForumAI has free PF practice. {product}'s debate timer, motion generator and flow sheet are free with no account; the app itself is paid after a {trial_days}-day trial."),
            ("What does a {product} case include?", "An opening, two to four arguments each with an explanation, evidence and why it matters, \"If they say X, we answer Y\" replies, a closing line and the sources it used. It is written in the order you would say it."),
            ("Can AI replace practicing with real people?", "No. It's useful for extra reps and finding weak points, but human opponents and judges are still unpredictable in ways AI isn't. Use both."),
        ],
    },
}
