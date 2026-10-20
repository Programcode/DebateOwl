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
    "how-to-practice-rebuttals": {
        "features": [
            ("A weekly drill plan", "Four short sessions a week, each training one rebuttal skill: selection, warrant attacks, grouping, and weighing under time."),
            ("Drills that work alone or with a partner", "Shadow rebuttals, flip-the-flow, one-sentence answers and rapid-fire rounds, with a version for solo practice and one for teams."),
            ("A way to measure progress", "A five-point checklist to score each practice rebuttal, so you can tell whether the drills are changing your speeches."),
        ],
        "sections": [
            ("Why rebuttal is a separate skill", [
                "Most debaters can write a decent case with enough time. Rebuttal is harder because it happens live: you hear an argument once, decide whether it matters, find the flaw, and explain it in under a minute while the judge is still listening. None of those steps improve by reading more about debate. They improve with repetitions that copy the pressure of a round.",
                "Good rebuttal practice therefore has three features. It uses arguments you did not write, so you cannot rely on knowing the answer in advance. It runs against a clock, so you learn to choose. And it ends with feedback on one specific thing, so the next repetition is different from the last. The drills below are built around those three rules.",
            ]),
            ("A four-session weekly plan", [
                "Each session takes 20 to 30 minutes. Run them in this order, because each one depends on the skill before it.",
                {"steps": [
                    "Selection (Monday). Read or listen to a full opposing constructive. Without answering anything, write down the one argument that decides the round if it stands, and one sentence saying why. Repeat with three different speeches. The goal is to stop treating every argument as equally important.",
                    "Warrant attacks (Tuesday). Take five opposing claims and, for each, write the reason the other side gives for it. Then write one sentence attacking that reason, not the claim. If you cannot find their warrant, your rebuttal is that they never gave one.",
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
                "For one argument, write five different responses: deny the claim, attack the warrant, mitigate the impact, turn it and outweigh it. Then rank them. Practising all five shows you which kind of response you lean on too much.",
                {"h3": "Drop audit"},
                "After a practice round, go through your flow and circle every opposing argument you did not answer. For each one, decide whether dropping it was a choice or an accident. Accidents are what you drill next.",
                {"h3": "Spar the predicted case"},
                "In {product}, generate a case on your side and read the predicted opponent case. Paste the strongest opposing argument into Attack to see where it breaks, then run a Sparring round and answer it live. The verdict tells you whether your answer changed the outcome.",
            ]),
            ("Worked example: from first attempt to clean rebuttal", [
                {"example": {"title": "Motion: This house would lower the voting age to 16", "rows": [
                    ("Opposing argument:", "Sixteen-year-olds lack the life experience to make informed political choices, so lowering the voting age would worsen the quality of democratic decisions."),
                    ("First attempt:", "That is not true, plenty of sixteen-year-olds are very mature and some adults are not informed either, so it is unfair to single out young people."),
                    ("What went wrong:", "The answer is a counter-assertion followed by a fairness point. It never names the opponent's warrant (experience produces better choices) or explains why the judge should doubt it."),
                    ("Rebuilt response:", "Their argument needs experience to be the thing that makes a vote informed. But we do not test experience for any other voter. Information comes from education, and sixteen-year-olds are still in school, studying the systems they would vote on."),
                    ("Weighing line:", "Even if some young voters are less informed, that harm is small and spread thin, while excluding a whole age group from decisions that affect them for longest is certain and lasting."),
                    ("Timed version:", "Forty seconds: name their warrant, show it is not applied to anyone else, give the alternative mechanism, close with the weighing."),
                ]}},
                "The rebuilt version is not more clever than the first attempt. It is more organised: it names what the opponent needs, explains why they do not have it, and tells the judge what that means for the round.",
            ]),
            ("How to judge your own practice", [
                "Record your practice rebuttals, or have a partner listen, and score each speech on five questions. Give one point for each yes.",
                {"list": [
                    "Did I answer the argument that decided the round first?",
                    "Did each response attack a warrant, or at least say which part of the argument it targets?",
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
                "The four-minute first affirmative rebuttal must answer a seven-minute negative constructive. Practise grouping and cross-applying your framework until you can cover every major argument with time left for one extension.",
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
            ("How do I know if my rebuttal practice is working?", "Score each practice speech on the same five questions: right argument first, warrant attacked, arguments grouped, impact explained, finished on time. Rising scores over a few weeks mean the drills are working."),
            ("Should I memorise rebuttals?", "Memorise the structure and a few strong lines, not whole speeches. In round you need to adapt each response to what the opponent actually said."),
        ],
    },
    "ai-rebuttal-generator": {
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
                    "For each weakness: the quoted words, why the link is weak (missing warrant, no evidence, no link, non-unique, turned or outweighed), and a response to say in round.",
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
                "Logic-Heavy prioritises broken reasoning and missing warrants. Values-Focused looks at framework and principle, which suits Lincoln-Douglas and principled motions. Policy/Impact concentrates on links, probability and the size of impacts, which suits policy-style motions and Public Forum.",
                {"h3": "Fallacies and weighing"},
                "Both checks are on by default. Turn fallacy detection off when you only want substantive responses; keep weighing analysis on almost always, because unweighed rebuttal is the most common reason good responses do not win rounds.",
            ]),
            ("Worked example: one argument through Attack", [
                {"example": {"title": "Motion: This house would tax sugary drinks", "rows": [
                    ("Argument pasted:", "A sugar tax reduces consumption, because higher prices make people buy less. Lower consumption means less obesity, which saves lives and reduces the burden on public health systems."),
                    ("Critical weakness, logical:", "Quoted: lower consumption means less obesity. The argument assumes people who buy fewer sugary drinks do not replace those calories with other foods. Without that warrant, the impact does not follow from the mechanism."),
                    ("Response to say:", "Even if people buy fewer fizzy drinks, they can get the same sugar from sweets, juice and snacks that are not taxed. Cutting one source of calories is not the same as cutting calories."),
                    ("Major weakness, evidential:", "Quoted: saves lives. The argument gives no estimate of how much consumption falls or how that translates into health outcomes, so the judge cannot weigh the size of the benefit."),
                    ("Cross-ex question:", "If someone stops buying a sugary drink but buys a chocolate bar instead, has the tax reduced their sugar intake?"),
                    ("Weighing gap:", "The argument never compares its health benefit with the cost to low-income households, who spend a larger share of their income on these drinks. That comparison is your weighing."),
                ]}},
                "The useful part is not that the analysis disagrees with the argument. It identifies the one assumption the argument cannot survive without, gives you a sentence to attack it, and sets up a cross-ex question that makes the opponent concede it before your speech.",
            ]),
            ("From generated output to a rebuttal you own", [
                {"steps": [
                    "Start from the right input. Use the opponent case predicted when you generated your own case, an argument you heard in a previous round, or your own case when you want to find its weak points first.",
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
                "Run Values-Focused on the negative case to find where its contentions fail to link to its own criterion. That gap often lets you win under their framework as well as yours.",
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
        "features": [
            ("Motion analysis first", "Define the terms, name the burden and find the clashes before writing a single contention."),
            ("Contentions that hold up", "Build each point as claim, warrant, evidence, impact and weighing, so a judge can follow it and an opponent cannot break it with one question."),
            ("A case you can defend", "Pre-empt the obvious responses, cut what does not clash, and test the draft by attacking it yourself."),
        ],
        "sections": [
            ("What a debate case is", [
                "A debate case is the argument your side will defend for the whole round, organised so a judge can follow it on first hearing. It is not an essay. An essay can explore; a case has to survive an opponent whose job is to find the weakest sentence in it. That is why good cases are built from small, testable parts: a clear position, a reason the judge should decide the round your way, and two to four contentions that each prove something specific.",
                "The process below works for every format. The format changes the length, the number of contentions and who gives which part, which the format section covers further down.",
            ]),
            ("Eight steps from motion to finished case", [
                {"steps": [
                    "Read the motion word by word. Note the actor (who does it), the action (what changes) and any word that sets the strength of the claim, such as should, would, ban, regulate or prioritise. A motion about regulating something is a different debate from one about banning it.",
                    "Define the key terms in plain language. Pick definitions that are fair and that a judge would accept without argument. A squirrelled definition wins the definition debate and loses the round.",
                    "Write your burden in one sentence: what does your side have to prove for the judge to vote for you? If you are proposing a policy, you usually need to show a problem, a mechanism and a net benefit. If you are opposing, you choose whether to defend the status quo, a counter-proposal or simply that the proposal does more harm than good.",
                    "Brainstorm widely, then cut hard. List every argument for your side, group the ones that share a reason, and keep the two to four groups that are strongest and most different from each other.",
                    "Build each contention as a chain: claim (what is true), warrant (why it is true), evidence (what supports the warrant), impact (why it matters) and weighing (why it matters more than what the other side will say).",
                    "Write the framework: the standard the judge should use to decide. In Lincoln-Douglas it is a value and criterion; in most other formats it is a sentence on what the round should be about, such as who bears the cost or which outcome is more likely.",
                    "Pre-empt the most obvious response to each contention inside the contention itself. One sentence is enough. It stops the opponent's best attack from looking new.",
                    "Write it out, read it aloud against a timer, and cut until it fits with fifteen seconds to spare.",
                ]},
            ]),
            ("Worked example: a full case outline", [
                {"example": {"title": "Motion: This house would make public transport free", "rows": [
                    ("Side:", "Proposition."),
                    ("Definitions:", "Public transport means buses, trams and local trains run or funded by government. Free means no fare at the point of use, paid for from general taxation."),
                    ("Burden:", "Show that removing fares produces benefits greater than the cost of replacing fare revenue."),
                    ("Framework:", "The round should be decided by who gains and who pays: a policy that shifts costs from those least able to pay towards those most able is preferable when the total benefit is comparable."),
                    ("Contention 1, access:", "Claim: fares stop low-income people from reaching jobs and services. Warrant: transport is a fixed cost that takes a larger share of a small income. Impact: removing it widens the area in which people can work and study. Pre-emption: discounted passes exist, but they require applications and proof of eligibility that many eligible people never complete."),
                    ("Contention 2, congestion and emissions:", "Claim: free fares move some journeys from cars to public transport. Warrant: price is one of the factors people weigh when choosing how to travel. Impact: fewer car journeys reduce congestion and emissions for everyone in the city."),
                    ("Weighing:", "Contention 1 is the more certain benefit and reaches the people most affected, so it leads; contention 2 is larger in scale but less certain, so it is framed as an additional reason, not the case's foundation."),
                    ("Likely opposition and prepared answer:", "Opposition will say the money is better spent on more frequent services. The answer: frequency helps people who already ride; free fares reach people currently priced out, and the two are not mutually exclusive."),
                ]}},
                "Notice what the outline does not contain: a long introduction, rhetorical questions or a list of statistics without warrants. Every line either defines the debate, proves something or tells the judge how to compare.",
            ]),
            ("How case structure changes by format", [
                {"h3": "Public Forum (PF)"},
                "A four-minute constructive usually fits two contentions, each with evidence, and sometimes a short framework. Because you often do not know your side until shortly before the round, write a case for each side and keep them consistent in style. Put pre-emption into the second constructive if you speak second.",
                {"h3": "Lincoln-Douglas (LD)"},
                "The case is built around a value and a criterion, followed by contentions that each show how your side meets the criterion. A weak link between contention and criterion is the first thing a good negative will attack, so state it explicitly at the end of every contention.",
                {"h3": "British Parliamentary (BP)"},
                "Opening Government sets the definition and, for policy motions, a model: what exactly happens, who does it and how it is enforced. Opening Opposition responds to that model. Closing teams do not write a full case of their own; they prepare an extension, a new line of analysis the opening half did not cover.",
                {"h3": "World Schools (WSDC)"},
                "The case is split between the first and second speakers under a single team line. The first speaker gives definitions, the burden and usually the first argument; the second speaker gives the remaining arguments. Write the split before you write the arguments, so neither speaker repeats the other.",
            ]),
            ("Checklist before you call the case finished", [
                {"list": [
                    "Can you state the whole case in two sentences?",
                    "Does every contention have a warrant you could explain without your notes?",
                    "Is every piece of evidence one you have read in the original, with a full citation?",
                    "Does each contention say why it matters more than what the other side will argue?",
                    "Have you written down the strongest response to each contention, and your answer to it?",
                    "Does it fit in the time with room to slow down?",
                ]},
                "If any answer is no, fix that before you practise delivery. Polishing the speech of a case with a missing warrant only makes the gap harder to see.",
            ]),
            ("Where {product} helps", [
                "Once you have a draft, attack it before an opponent does. Paste a contention into Attack to see which link breaks first, use Brainstorm when you need more angles at step four, and use Factoids to research a single statement you want to rely on. If you would rather start from a structure, the case generator produces a draft with a thesis, framework, contentions and a predicted opposing case, which you can then cut and rewrite with the steps above.",
            ]),
        ],
        "faqs": [
            ("How many contentions should a debate case have?", "Usually two to four. Public Forum constructives often fit two; formats with longer speeches can take three or four. Fewer well-defended contentions beat many thin ones."),
            ("What is the difference between a claim and a warrant?", "The claim is what you say is true; the warrant is the reason it is true. Judges vote on warrants, so a claim without one is an assertion that the other side can dismiss."),
            ("How long does it take to write a debate case?", "A first draft can take an hour once you have researched the topic. Expect to revise it several times after practice rounds expose its weak points."),
            ("Should I write my case word for word?", "In formats with prepared constructives, such as Public Forum and Lincoln-Douglas, most debaters do. In impromptu formats like BP and WSDC, prepare an outline and key lines instead."),
            ("How do I make a case harder to attack?", "Explain every warrant, use evidence you have checked, pre-empt the most obvious response inside each contention, and attack the draft yourself before the round."),
        ],
    },
    "debate-topics-for-students": {
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
                "Ten minutes of this analysis gives a team enough to start writing contentions. The clash and the weighing question tell both sides where the round will be decided.",
            ]),
            ("How to use a topic list in practice", [
                {"steps": [
                    "Pick a topic and flip a coin for sides, so students practise arguing positions they do not hold.",
                    "Give fifteen minutes of preparation for impromptu formats, or a week for prepared formats.",
                    "Run the round with real speech times.",
                    "Debrief on one question: where was the clash, and who won it?",
                    "Rerun the same topic with sides swapped. The second round is usually much better, because each team now knows the other side's best arguments.",
                ]},
                "In {product}, start a Current Debate with the motion and run Brainstorm to see angles for both sides, generate a case with its predicted opposing case, or run a Sparring round against the AI when there is no second team available.",
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
            ]),
            ("What each speech has to do", [
                {"h3": "Constructive"},
                "Present your case: usually two contentions, each with a claim, a warrant, evidence and an impact. Many teams add a short framework that tells the judge how to weigh the round. The second constructive can include a few responses to the first if time allows.",
                {"h3": "Rebuttal"},
                "Answer the opponent's case. The team speaking second should also answer the attacks already made on its own case, because arguments left unanswered after second rebuttal are very hard to bring back.",
                {"h3": "Summary"},
                "Collapse. Choose the one or two issues you are winning, extend them with their warrants and evidence, answer what the opponent said about them, and start weighing. Everything you want in final focus has to be in summary.",
                {"h3": "Final focus"},
                "Tell the judge why you win in two minutes. Extend only what was in your summary, weigh it against the opponent's best remaining argument, and give the judge a simple reason to sign the ballot.",
                {"h3": "Crossfire"},
                "Crossfire is a question period, not a speech. Use it to clarify the opponent's evidence, get them to commit to an assumption you will attack, and set up your next speech. Judges notice who stays calm and precise.",
            ]),
            ("Worked example: one PF round in outline", [
                {"example": {"title": "Practice resolution: Resolved: Schools should replace letter grades with pass or fail grading", "rows": [
                    ("Pro contention 1:", "Letter grades push students toward safe courses they know they can ace; pass or fail grading encourages them to take harder classes and learn more."),
                    ("Pro contention 2:", "Grade pressure is a leading source of student stress, and removing fine-grained grades reduces it without removing accountability."),
                    ("Con contention 1:", "Letter grades give students specific feedback about how well they understood the material; pass or fail hides the difference between barely passing and mastery."),
                    ("Con contention 2:", "Colleges and scholarships use grades to compare applicants; without them, they rely more on test scores and extracurriculars that favour wealthier students."),
                    ("First crossfire question from Pro:", "Is a letter grade the only way a teacher can tell a student how well they understood the material?"),
                    ("Pro summary collapse:", "Extend contention 1 and turn the con's feedback argument: comments and rubrics give better feedback than a single letter, so pass or fail grading loses nothing on feedback and gains course choice."),
                    ("Con final focus weighing:", "Even if some students take harder courses, the equity harm in admissions affects every student who applies, and it falls on those with the fewest alternatives."),
                ]}},
                "The round is decided by which team frames the comparison between learning (Pro) and fair admissions (Con), and keeps that frame consistent from summary to final focus.",
            ]),
            ("Five habits of strong PF teams", [
                {"list": [
                    "They write cases for both sides, because they often learn their side only shortly before the round.",
                    "They read evidence carefully and can produce the full source if asked. Evidence disputes are common in PF, and a misrepresented card can lose the round.",
                    "They plan the collapse before the round: which contention each side would collapse to, and why.",
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
            ]),
        ],
        "faqs": [
            ("How long is a Public Forum round?", "The speeches and crossfires take 35 minutes, plus each team's preparation time, so most rounds run around 45 minutes."),
            ("How many contentions should a PF case have?", "Usually two. A four-minute constructive rarely fits more than two contentions with proper warrants and evidence."),
            ("What is the difference between summary and final focus?", "Summary narrows the round to the issues you are winning and begins the weighing. Final focus extends only those issues and tells the judge why they decide the ballot."),
            ("Can I bring up new arguments in final focus?", "No. New arguments in final focus are generally ignored by judges, because the opponent has no chance to answer them. Anything you want in final focus should be in your summary."),
            ("How do I prepare for a lay judge in PF?", "Run fewer arguments, explain each one plainly, signpost clearly, speak at a normal pace and end every speech with a simple reason to vote for you."),
        ],
    },
    "debatelab-vs-chatgpt": {
        "features": [
            ("A general assistant", "ChatGPT can brainstorm, explain, draft and revise on any subject, including debate."),
            ("A debate workspace", "{product} organises prep around one motion at a time, with structured cases, an AI opponent, a timer and judged practice rounds."),
            ("Using both", "Where each tool fits in a week of debate preparation, and how to move work between them."),
        ],
        "sections": [
            ("The short answer", [
                "ChatGPT is a general-purpose AI assistant. {product} is a debate practice workspace. Both use large language models, but they are designed for different jobs. If you want to explore an idea, learn background on a topic or tighten a paragraph, a general assistant is flexible and fast. If you want to prepare a specific motion, practise against an opponent at real speech times and get a verdict on your round, a tool built around debate structure saves the setup you would otherwise do by hand in every conversation.",
                "Many debaters use both. This page explains where each is stronger so you can decide what fits your preparation.",
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
                "In {product}, everything belongs to a Current Debate: the motion, the Library sources you have added, generated cases, Attack analyses, practice rounds and debriefs. Each tool reads the same context, so you never paste the motion and your research into a new conversation.",
                {"h3": "Structured output"},
                "Generated cases always have the same parts: thesis, framework, contentions with warrants and impacts, the case the other side is likely to run, and counters to it. Attack always returns ranked weaknesses that quote the attacked words, with a response to say in round, cross-examination questions and a weighing analysis. Fixed structure makes the output easier to check and to turn into speeches.",
                {"h3": "Timed practice rounds"},
                "Sparring runs full rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas and Public Forum, with each speech timed, and ends with a verdict that names the reason for the decision. Crossfire drills cross-examination in either direction. A speech timer covers Standard, Lincoln-Douglas, Public Forum and Policy speech orders.",
                {"h3": "Sources you control"},
                "Sources you add to the Library and mark active are used across the tools for that debate. Ask can answer with citations, and Factoids researches a single claim. Evidence still needs checking against the original, as with any AI tool.",
            ]),
            ("Worked example: the same task in both tools", [
                {"example": {"title": "Task: prepare to answer the opposition on This house would make voting compulsory", "rows": [
                    ("In a general chat:", "You describe the motion, your side and your format, then ask for the opposition's arguments. You get a useful list. To get responses, you ask again; to check one argument in depth, you paste it back; to practise, you would need to role-play a round and keep track of time yourself."),
                    ("In {product}:", "You start a Current Debate with the motion, generate your proposition case and read the predicted opposition case it includes. You paste the strongest opposition argument into Attack, which returns its weakest link, a response to say and a cross-ex question. You import the questions into Crossfire to practise them, then run a timed Sparring round and read the verdict."),
                    ("The difference:", "Individual sentences can be similar in quality. What changes is how much setup you repeat, and whether you end up practising a round or only reading text."),
                ]}},
            ]),
            ("Which should you use?", [
                {"list": [
                    "Learning about a topic from scratch: a general assistant is a good start.",
                    "Writing a case for a specific motion: a debate workspace gives a consistent structure and a predicted opposing case.",
                    "Finding the weak point in an opposing argument: a tool that returns structured weaknesses and responses is faster to use in prep.",
                    "Practising speeches and rounds: you need timing, an opponent and a verdict, which a general chat does not provide.",
                    "Polishing wording: either works; use the one you are already in.",
                ]},
                "A practical split is to use a general assistant for open-ended learning and {product} for motion-specific preparation and practice.",
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
}
