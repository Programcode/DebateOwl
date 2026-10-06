import { admin, agentic, debatesOf, expect, test } from "./support/fixtures";

// The non-AI tools: Library sources, Flowchart, Timer, and Settings.
const options = { ...agentic, tags: ["journey"] };

test("a student adds a source to the debate's Library and pauses it", options, async ({ app, agent, screen, student }) => {
  const motion = "This House would ban single-use plastics";
  const title = "Plastic bag levy study";
  await app.open("/app");
  await agent.act("Start a new debate on the motion {motion}. Then open the Library and add a source titled {title} with the content {content}.", {
    params: { motion, title, content: "After a 5p levy, single-use bag sales at major retailers fell by more than 95 percent." },
  });

  const toggle = screen.getByRole("switch", `Toggle ${title}`);
  await expect(toggle).toBeChecked();
  const [debate] = await debatesOf(student);
  const sources = async () => (await admin.from("sources").select("title, is_active, debate_id").eq("user_id", await student.userId())).data;
  await expect.poll(sources).toEqual([{ title, is_active: true, debate_id: debate.id }]);

  await agent.act("Pause the source {title} so it is no longer used.", { params: { title } });
  await expect(toggle).not.toBeChecked();
  await expect.poll(sources).toEqual([{ title, is_active: false, debate_id: debate.id }]);
});

test("a student edits and saves a flowchart", options, async ({ app, agent, screen, student }) => {
  const title = "Zoo ban flow";
  await app.open("/app/flowchart");
  await agent.act("Delete the node Argument 1, then save the flowchart with the title {title}.", { params: { title } });

  await expect(screen.getByText("Argument 1", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await admin.from("flowcharts").select("title, nodes").eq("user_id", await student.userId())).data
    ?.map((row) => ({ title: row.title, hasArgument1: JSON.stringify(row.nodes).includes("Argument 1") })))
    .toEqual([{ title, hasArgument1: false }]);
});

test("a student times a speech and pauses the timer", options, async ({ app, agent, browser, screen }) => {
  await app.open("/app/timer");
  const display = browser.locator('[role="timer"][aria-label="Timer display"]');
  await expect(display).toBeVisible();
  const initial = (await display.textContent()) ?? "";
  await agent.act("Start the speech timer, then pause it.");

  await expect(screen.getByText("PAUSED").first()).toBeVisible();
  await expect(display).not.toHaveText(initial);
});

test("a student switches the interface to Spanish and the AI output to Hungarian", options, async ({ app, agent, browser, student }) => {
  await app.open("/app/settings");
  await agent.act("Switch the interface language to Español.");
  await expect(browser.locator("html")).toHaveAttribute("lang", "es");

  await agent.act("Set the AI output language to Magyar.");
  await expect.poll(async () => (await admin.from("user_settings").select("output_language").eq("user_id", await student.userId()).single()).data)
    .toEqual({ output_language: "hu" });
  await agent.assert("The Settings page is shown in Spanish, and its AI output language setting reads Magyar.");
});
