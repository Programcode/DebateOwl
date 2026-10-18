"""Long-form copy for the guide pages that have their own content.

generate_seo_content.py merges each entry over the PAGES item with the same
slug. Name the product with {product}; the generator fills it from
src/config/site.json. A section is (heading, blocks), where a block is a
paragraph string or a dict with one of: h3, steps, list, example.
"""

GUIDES = {
    "ai-debate-practice": {
        "features": [
            ("Practice against AI opponents", "Run a full Sparring round in School 4-6-6-3, Lincoln-Douglas or Public Forum, type or speak each speech, and finish with a judged verdict."),
            ("Turn feedback into drills", "Take the weakest point from a verdict or a Crossfire debrief, rebuild it with Attack or Ask, and run that speech again."),
            ("Keep private prep out of search", "Cases, sources, rounds and history stay inside your Current Debate behind sign-in. Only these public guides are indexed."),
        ],
        "sections": [
            ("What a useful AI practice session looks like", [
                "Most debaters improve through repetitions with feedback: give a speech, find out what failed, fix one thing, give it again. AI practice is valuable when it shortens that loop, not when it hands you a finished speech to read.",
                "A chat window can produce arguments on request, but it does not hold a round together. It forgets which side you are on, does not time you, and rarely tells you which of your points the judge would have dropped. Practice needs a motion, a side, a format with real speech times, an opponent that responds to what you actually said, and a verdict that names the reason you lost or won.",
                "{product} is built around that loop. You start a Current Debate for one motion, and every case, source, round and debrief you create stays filed under it. That means the AI opponent in your third practice round can see the same Library sources you used to write your case, and your History shows how the debate developed across sessions.",
            ]),
            ("A 45-minute practice session, step by step", [
                "This plan fits a weeknight. It assumes you have a motion but no case yet.",
                {"steps": [
                    "Start a Current Debate with the motion written exactly as it will be announced (2 minutes). Add any articles or notes you already trust to the Library so later answers are grounded in them.",
                    "Run Brainstorm on the motion and pick the two or three angles you can explain in one sentence each (5 minutes). Discard angles that need evidence you do not have.",
                    "Generate a case for your side (10 minutes). Read the predicted opponent case before your own contentions: it tells you what you will have to answer.",
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
                    ("First contention:", "Phones fragment attention in class, and attention is the input every other kind of learning depends on."),
                    ("AI opponent's response:", "Schools already confiscate phones during lessons, so a ban changes only break times, where the harm you described does not happen."),
                    ("What the verdict flagged:", "Proposition never explained what a ban adds over existing classroom rules, so the opposition's mitigation stood unanswered."),
                    ("The drill:", "Ask Attack to find the gap in the contention, then rewrite it around breaks: social exclusion, cyberbullying during the school day, and the cost of teachers enforcing rules lesson by lesson."),
                    ("Second attempt:", "The R1 speech now opens with the comparison: classroom rules depend on every teacher enforcing them every hour, while a ban sets one rule at the school gate. The opponent's mitigation becomes a point in your favour."),
                ]}},
                "The example shows the pattern to look for. The first version was not wrong; it was incomplete in a way only a responsive opponent exposes. That is the gap AI practice fills between team practices.",
            ]),
            ("Format-specific practice tips", [
                {"h3": "World Schools (WSDC)"},
                "WSDC rounds reward a consistent team line, so practise as a team even when you use AI. Agree the line in one sentence, then have each speaker run their own section against the AI and check that the line survives. Points of Information matter in every substantive speech: use Crossfire with the AI asking the questions to rehearse taking a POI, answering in under fifteen seconds, and returning to your structure. Sparring does not run a WSDC round, so time the eight-minute substantives and four-minute reply yourself.",
                {"h3": "British Parliamentary (BP)"},
                "In BP, two teams on each bench compete with each other as well as with the other side. Practise both halves. For opening, generate a case with the format set to British Parliamentary and drill a clear definition and model in the first two minutes. For closing, take an opening case you have already generated and practise finding an extension it does not contain, then deliver it in seven minutes without repeating opening material.",
                {"h3": "Public Forum (PF)"},
                "Sparring runs Public Forum with four-minute constructives and rebuttals, three-minute summaries and two-minute final focuses. Use the round to practise the hardest skill in PF: keeping summary and final focus consistent. Before each summary, write the two issues you will collapse on, and check after the round whether your final focus extended exactly those issues and nothing new.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The Lincoln-Douglas round follows the standard times: six-minute affirmative constructive, seven-minute negative constructive, four-minute first affirmative rebuttal, six-minute negative rebuttal and three-minute second affirmative rebuttal. The 1AR is where most affirmatives lose. Run it repeatedly against the same negative constructive and practise grouping responses and cross-applying your framework, so four minutes covers seven.",
            ]),
            ("How to tell whether practice is working", [
                "Keep a short log for each session in the debate's notes or on paper. Track the same four things every time:",
                {"list": [
                    "Arguments you dropped: anything the opponent said that you never answered. This number should fall first.",
                    "Time use: whether you finished each speech within ten seconds of the limit without rushing the last point.",
                    "Weighing: whether your final speech compared impacts explicitly, or just repeated them.",
                    "Verdict reasons: whether the judge's reason for the decision changes from session to session, or keeps naming the same weakness.",
                ]},
                "If the same verdict reason appears three sessions in a row, stop running full rounds and drill that one skill in isolation until it changes.",
            ]),
            ("Where AI practice stops being enough", [
                "An AI opponent is consistent and always available, which is exactly what makes it a good training partner and a limited judge. It will not reproduce the judge who dislikes speed, the panel that splits, or the opponent who asks a question you never anticipated. Use AI rounds for volume between real practices, and save team practices and coached rounds for adaptation, delivery and the feedback only an experienced person can give.",
            ]),
        ],
        "faqs": [
            ("Which formats can I spar against the AI in?", "Sparring runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds with their speech order and times. For WSDC, British Parliamentary and other formats you can still generate cases, get coaching and drill rebuttals, and time speeches yourself."),
            ("Can I give my practice speeches out loud?", "Yes. Sparring and Crossfire can run as spoken rounds in the browser, so you can practise delivery as well as content."),
            ("How often should I practise against an AI opponent?", "Two or three focused sessions a week usually beats one long one. Each session should end with one specific fix that you drill before the next round."),
            ("Does AI practice replace a coach or real rounds?", "No. It adds repetitions between team practices. Judge adaptation, delivery under pressure and strategic judgement still develop fastest with people."),
            ("Are my practice rounds private?", "Yes. Rounds, verdicts and debriefs are saved to your account inside the Current Debate they belong to, behind sign-in. Search engines only see these public guides."),
        ],
    },
    "ai-debate-coach": {
        "features": [
            ("Strategy help", "Ask which clash decides the round, what your burden is and where to spend your speaking time, with answers that use your debate's motion and sources."),
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
                    "Clash map: ask for the three places where the cases will meet. Plan your speeches around those, not around your own contentions.",
                    "Weighing rehearsal: give the coach your impact and the likely opposing impact and ask for the comparison in two sentences. Repeat until you can say it without notes.",
                    "Speech audit: paste a practice speech and ask which claim had no warrant, which point ran too long, and what a judge would remember from it.",
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
                "LD coaching is often framework coaching. Ask the coach whether your criterion actually measures your value, how your contentions link back to the criterion, and when it is safer to concede the opponent's framework and show that you win under it anyway.",
            ]),
            ("Getting answers with sources", [
                "When a coaching answer depends on facts, turn on citation mode in Ask. The coach then answers with sources you can open. Treat those as leads: read the original, confirm it says what the answer claims, and only then use it in a speech. Adding your own trusted articles to the Library has the same effect from the other direction, because active sources are included in every answer for that debate.",
            ]),
            ("What an AI coach cannot do", [
                "It has not watched you speak, it does not know the judges at your tournament, and it cannot tell you how your partner works under pressure. Bring the conclusions from AI coaching sessions to your human coach or team, and let them correct the advice that does not fit the people in the room.",
            ]),
        ],
        "faqs": [
            ("What can I ask the AI debate coach?", "Anything you would ask a coach between rounds: burdens, clash, weighing, speech structure, how to answer a specific argument, or why a practice speech did not land. Specific questions with format, side and speaker role get the best answers."),
            ("Does the coach know my case?", "It knows your Current Debate: the motion, and the Library sources you have marked active. Paste a speech or a case section into the question when you want feedback on that exact text."),
            ("Can the AI coach cite sources?", "Yes. Turn on citation mode in Ask and the answer includes sources you can open. Check each one against the original before using it in a round."),
            ("Will the coach write my speeches for me?", "It can draft an outline or a passage, but you will speak better from structure you understand. Use it to find what is missing, then write the speech in your own words."),
            ("How is this different from a general AI chatbot?", "The coach works inside one debate at a time, so it keeps your motion, side and sources in context, and it is set up for debate questions rather than essays."),
        ],
    },
    "ai-debate-case-generator": {
        "features": [
            ("Structured case drafts", "Each draft has a thesis, a framework, contentions with warrants and impacts, the case the other side is likely to run, and counters to it."),
            ("Evidence leads", "Turn on web research to get sources alongside the draft, then check each one against the original before it goes on a card."),
            ("Format templates", "Set the format and your role so the draft fits British Parliamentary, Policy, a classroom debate or a custom structure."),
        ],
        "sections": [
            ("What the case generator produces", [
                "Generate takes the motion from your Current Debate and returns a structured case, not a block of prose. Every draft has the same parts, so you always know where to look:",
                {"list": [
                    "Thesis: the one-sentence reason your side should win.",
                    "Framework: how the judge should decide the round, such as the definition, the burden or the weighing standard you will argue for.",
                    "Contentions: each with a claim, the warrant that makes it true, and the impact that makes it matter.",
                    "Predicted opponent case: the arguments a strong team on the other side is likely to run.",
                    "Counters: first responses to that predicted case.",
                ]},
                "Because the opponent case is part of the draft, you start preparing rebuttals at the same time as your own case. When one section is weak, regenerate just that section; the rest of the case stays where it is. Finished cases export to PDF or DOCX.",
            ]),
            ("From motion to verified case in seven steps", [
                {"steps": [
                    "Start a Current Debate with the exact motion wording. Small wording changes, such as should against would, change the burden.",
                    "Add the sources you already trust to the Library. Active sources are used when the case is generated, so the draft builds on your research instead of ignoring it.",
                    "Set the format and your role, and add instructions if you need a particular angle, for example a principled argument or an economic one.",
                    "Turn on web research if you want evidence leads, and generate the case.",
                    "Read the predicted opponent case first and decide which of your contentions actually answers it. Cut contentions that do not clash with anything.",
                    "Regenerate any section that is vague, then verify every evidence lead against its original source.",
                    "Rewrite the final case in your own words and time a full reading of it before you call it ready.",
                ]},
            ]),
            ("Worked example: a generated case, and what the debater changed", [
                {"example": {"title": "Motion: This house would introduce a four-day school week", "rows": [
                    ("Side:", "Proposition."),
                    ("Thesis:", "A shorter week concentrates instruction where it works and gives schools a recruitment advantage they cannot buy with pay."),
                    ("Framework:", "The round should be decided by learning outcomes for students across the school, not by the convenience of any single group."),
                    ("Contention 1:", "Teacher retention. Claim: a four-day week keeps experienced teachers. Warrant: schools competing for staff cannot always raise salaries, but they can offer time. Impact: experienced teachers are among the strongest in-school drivers of student learning."),
                    ("Predicted opposition:", "Childcare costs for working parents on the fifth day, and lost instruction time for students who are already behind."),
                    ("Counter:", "Schools can run an optional fifth-day programme for families who need it, and longer remaining days protect total instruction hours."),
                    ("Evidence lead to verify:", "Research on districts that moved to four-day weeks, looking at attendance, teacher turnover and test results. Read the methodology: results differ between rural and urban districts."),
                    ("What the debater changed:", "Cut a weaker cost-saving contention the opposition would easily mitigate, and moved the instruction-hours counter into the first speech so it was on the table before the opposition raised it."),
                ]}},
                "The draft gave the debater a full structure in minutes. The judgement calls, which contention to cut and where to pre-empt the opposition, were still theirs, and that is where the round was won.",
            ]),
            ("Checking citations before they reach a card", [
                "Generated evidence is a starting point. Before any source goes into a speech:",
                {"list": [
                    "Open the original. If you cannot find it, do not use it.",
                    "Find the exact sentence that supports your claim, and check that the surrounding paragraph does not qualify it.",
                    "Check the date, the author and who published it. A think-tank brief and a peer-reviewed study carry different weight.",
                    "Make sure the evidence supports your link, not just your topic. A study showing four-day weeks save money does not prove they improve learning.",
                    "Record the full citation so you can produce it if an opponent or judge asks.",
                ]},
                "Factoids is useful here: give it a single statement from your case and it researches that statement and suggests searches you can use to confirm it.",
            ]),
            ("Adapting a generated case to your format", [
                {"h3": "World Schools (WSDC)"},
                "A WSDC case is split between the first and second speakers, with a team line both can repeat. Use the thesis as the team line, give the first speaker the framework and the first contention, and keep the strongest contention for the second speaker so the case builds rather than front-loads. Generate with the custom format and say this in the instructions.",
                {"h3": "British Parliamentary (BP)"},
                "Set the format to British Parliamentary and choose your role. Opening government needs a clear definition and mechanism in the draft. Closing teams should treat the generated case as material the opening half will probably use, and look in the predicted opponent case for an extension nobody else in the room is likely to run.",
                {"h3": "Public Forum (PF)"},
                "A PF constructive is four minutes, which usually means two contentions with evidence, not four. Since PF teams often find out their side shortly before the round, generate both sides of the resolution in the same debate and prepare the counters for each.",
                {"h3": "Lincoln-Douglas (LD)"},
                "In LD, the framework section becomes your value and criterion. Check that every contention explicitly links back to the criterion; if one does not, regenerate it with an instruction to tie it to the standard you chose. Prepare a short defence of the criterion itself, because the negative will often attack it first.",
            ]),
            ("Mistakes to avoid with generated cases", [
                {"list": [
                    "Reading the draft in round. Judges hear the difference between a case you wrote and one you are reading for the first time.",
                    "Keeping every contention. Three well-defended points beat five thin ones.",
                    "Skipping the predicted opponent case. It is the fastest route to your rebuttals.",
                    "Citing an evidence lead you never opened.",
                ]},
            ]),
        ],
        "faqs": [
            ("Does the case generator write a complete case?", "It writes a complete draft: thesis, framework, contentions with warrants and impacts, the likely opposing case and counters. Treat it as a structure to cut, verify and rewrite in your own words."),
            ("Are the generated citations reliable?", "They are research leads. With web research on, the draft includes sources, but you should open every one, confirm the exact claim and record the full citation before using it."),
            ("Which debate formats does the generator support?", "You can set the format to British Parliamentary, Policy, Classroom or Custom and choose your role. For WSDC, Public Forum and Lincoln-Douglas, use Custom and describe the structure in the instructions."),
            ("Can I change one part of a case without starting over?", "Yes. Regenerate a single section and the rest of the case stays on screen unchanged."),
            ("Can I export a generated case?", "Yes. Cases export to PDF and DOCX, and cases created in a Current Debate are saved to it automatically."),
        ],
    },
    "best-ai-debate-tools": {
        "features": [
            ("Feature comparison", "What each kind of tool does well: general chatbots, research assistants, dedicated debate platforms, and timers or flowing tools."),
            ("Format coverage", "Which formats a tool actually models, from Public Forum and Lincoln-Douglas to WSDC and British Parliamentary, and where you still prep by hand."),
            ("Workflow differences", "Whether cases, sources, practice rounds and feedback stay connected to one motion, or end up scattered across chats and documents."),
        ],
        "sections": [
            ("The four kinds of AI debate tool", [
                "Debaters use AI tools for different jobs, and the categories overlap less than the marketing suggests. Most prep setups combine at least two of these.",
                {"h3": "General AI chatbots"},
                "Assistants such as ChatGPT, Claude and Gemini are flexible and good at brainstorming, explaining a concept or tightening a paragraph. Their weakness for debate is structure: they do not hold a motion, side and format across sessions unless you rebuild the context each time, and they will produce confident claims without sources unless you ask.",
                {"h3": "Research and citation tools"},
                "AI search and research assistants are strongest at finding sources quickly. They help with evidence but not with turning evidence into arguments, rebuttals or speeches.",
                {"h3": "Dedicated debate platforms"},
                "These are built around debate concepts: cases with contentions, rebuttals, opponents and verdicts. They vary a great deal in which formats they model and whether they let you practise or only generate text.",
                {"h3": "Practice utilities"},
                "Timers, flowing templates and argument maps. Often simple, sometimes not AI-based at all, and still essential for practice that matches tournament conditions.",
            ]),
            ("Eight criteria for comparing AI debate tools", [
                {"steps": [
                    "Structure: does the output separate claim, warrant and impact, or is it a wall of text?",
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
                    "Ask each tool for a case on one side. Score it on structure and on whether the warrants actually prove the claims.",
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
                    ("How to score it:", "Give the point only if the tool attacked the warrant (why more voters means better representation) rather than changing the subject."),
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
                "LD needs tools that handle value and criterion, not just policy arguments. Test whether a tool can defend a framework and link contentions to it, and whether it can practise the time-pressured 1AR.",
            ]),
            ("Where {product} fits", [
                "{product} is a dedicated debate platform that keeps every case, source, round and debrief inside one Current Debate. It covers case generation with a predicted opponent case, Library sources that ground every answer, Attack for finding weak links, Brainstorm, Factoids for checking claims, an Ask coaching chat with optional citations, Crossfire and full Sparring rounds with a verdict, a speech timer and an argument flowchart.",
                "Its limits are worth stating plainly. Sparring currently runs School 4-6-6-3, Lincoln-Douglas and Public Forum rounds, so WSDC and BP practice uses the prep and coaching tools rather than a full simulated round. Like every AI tool, its evidence leads need checking against the original source. Run the one-hour test above and decide on your own results.",
            ]),
        ],
        "faqs": [
            ("What is the best AI tool for debate?", "It depends on the job. General chatbots are flexible for brainstorming, research tools find sources, and dedicated debate platforms add structure, opponents and practice. Most debaters do best with a dedicated platform plus a way to verify sources."),
            ("Is a general chatbot good enough for debate prep?", "For brainstorming and explaining concepts, often yes. It is weaker at keeping a motion, side and format in context, predicting the opposing case, timing speeches and giving round-style feedback."),
            ("Are free AI debate tools enough?", "Free tiers are a good way to run the comparison test. Check the daily or monthly limits against how many practice sessions you plan before a tournament."),
            ("Can I use AI tools during a debate round?", "Usually not. Most leagues restrict or ban internet access and electronic help during rounds. Check your league's rules, and use AI tools for preparation."),
            ("How should I compare AI debate tools fairly?", "Give every tool the same motion and the same tasks, such as a case, the strongest counter, feedback on your speech and evidence for one claim, then score each answer against the same criteria."),
        ],
    },
    "debate-rebuttal-practice": {
        "features": [
            ("Find weak warrants", "Paste an argument into Attack and get the links that fail: missing warrants, overclaimed impacts and assumptions the other side never proved."),
            ("Build targeted blocks", "Turn each weakness into a short block with a tag line, the response and why it matters, kept in your Current Debate."),
            ("Practice weighing and collapse", "Deliver rebuttals in a Sparring round and see in the verdict whether your weighing changed the outcome."),
        ],
        "sections": [
            ("The five ways to answer an argument", [
                "Every rebuttal is one of a small number of moves. Naming the move before you speak keeps the response short and makes it obvious to the judge what you have done:",
                {"list": [
                    "Deny the claim: show the thing they say happens does not happen.",
                    "Attack the warrant: accept the claim could be true, but show their reason for it does not prove it.",
                    "Mitigate the impact: concede the mechanism but show the effect is smaller, rarer or slower than they said.",
                    "Turn it: show their argument actually supports your side.",
                    "Outweigh it: concede the point and show your impact matters more.",
                ]},
                "Attacking the warrant is usually the strongest choice, because a claim without a warrant gives the judge nothing to weigh. Turns are the most powerful when they work and the most dangerous when they do not, so practise them before using them in a round.",
            ]),
            ("A 20-minute rebuttal drill", [
                {"steps": [
                    "Choose one opposing argument you expect to face. If you have generated a case, take it from the predicted opponent case.",
                    "Paste it into Attack and read the weaknesses it finds. Pick the one that breaks the argument, not the one that is easiest to say.",
                    "Write a block: a five-word tag line, the response in two or three sentences, and one sentence on why it matters for the round.",
                    "Time yourself delivering the block in under forty-five seconds.",
                    "Ask the coach for the best answer to your block, and add a one-sentence reply to the bottom.",
                    "Repeat with the next most likely argument. Three tested blocks per session is a good pace.",
                ]},
                "File each block in the same Current Debate so your rebuttals sit next to the case they answer.",
            ]),
            ("Worked example: rebutting one argument", [
                {"example": {"title": "Motion: This house would ban zoos", "rows": [
                    ("Opposition argument:", "Zoos protect endangered species through captive breeding programmes, so a ban would push some species closer to extinction."),
                    ("Weak link:", "The argument assumes that captive breeding requires zoos as they exist now, with public display, rather than conservation centres run for that purpose."),
                    ("Response (attack the warrant):", "Breeding programmes need specialist facilities and genetic management, not visitors. A ban on zoos as public attractions does not stop sanctuaries and conservation centres from running them."),
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
                "The 1AR has four minutes to answer seven minutes of negative material. Practise grouping similar responses, cross-applying your framework to several arguments at once, and saying the important responses first so the 2AR has something to extend. For the negative rebuttal, drill collapsing onto the one or two arguments that best outweigh.",
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
            ("Can the AI predict my opponent's arguments?", "Yes. Each generated case includes a predicted opponent case, which is a practical list of arguments to prepare blocks against."),
            ("How do I stop dropping arguments?", "Flow every speech, mark each opposing argument as answered or not, and group similar arguments so one response covers several. Practise against a timer until it becomes routine."),
        ],
    },
}
