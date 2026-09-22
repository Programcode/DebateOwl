import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { kill as killProcess } from "node:process";
import type { WorkspaceToolContext } from "../src/lib/workspace/tool-context";

const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const mailerUrl = process.env.WORKSPACE_TEST_MAILER_URL;
const collaborationPort = Number(process.env.COLLABORATION_PORT ?? 12345);
const reuseCollaboration = process.env.WORKSPACE_TEST_REUSE_COLLABORATION === "true";

test.skip(!supabaseUrl || !anonKey || !serviceKey || !mailerUrl, "Local workspace services are required");

function waitForPort(port: number) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 20_000;
    const attempt = () => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`Port ${port} did not open`));
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  killProcess(-child.pid!, "SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  try {
    killProcess(-child.pid!, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function startCollaboration() {
  if (reuseCollaboration) {
    await waitForPort(collaborationPort);
    return undefined;
  }
  const child = spawn("npm", ["run", "start:collaboration"], {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForPort(collaborationPort);
  return child;
}

async function authenticatedPage(browser: Browser, session: Session) {
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    localStorage.setItem("debate-auth-local", JSON.stringify(value));
  }, session);
  const page = await context.newPage();
  await page.route("**/functions/v1/announcements*", (route) => route.fulfill({
    body: JSON.stringify({ announcements: [] }),
    contentType: "application/json",
    status: 200,
  }));
  return { context, page };
}

async function signedOutPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/functions/v1/announcements*", (route) => route.fulfill({
    body: JSON.stringify({ announcements: [] }),
    contentType: "application/json",
    status: 200,
  }));
  return { context, page };
}

async function openPanel(page: Page, name: string) {
  const summary = page.locator("summary").filter({ hasText: name });
  if (!await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) {
    await summary.click();
  }
}

async function showPane(page: Page, name: "Files" | "Document" | "Working panel", mobile: boolean) {
  if (!mobile) return;
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  await button.click();
}

test("real local users collaborate, recover, review, restore, and revoke access", async ({ browser, request }, testInfo) => {
  test.setTimeout(testInfo.project.name === "mobile-chromium" ? 120_000 : 240_000);
  const mobile = testInfo.project.name === "mobile-chromium";
  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });
  const suffix = `${testInfo.project.name}-${Date.now()}@workspace.test`;
  const emails = [`owner-${suffix}`, `member-${suffix}`, `email-${suffix}`];
  const password = `Local-${crypto.randomUUID()}!`;
  const ids: string[] = [];
  const contexts: BrowserContext[] = [];
  let collaboration: ChildProcess | undefined;

  try {
    const sessions: Session[] = [];
    for (const email of emails) {
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, password });
      if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed");
      ids.push(created.data.user.id);
      const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false } });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign in failed");
      sessions.push(signedIn.data.session);
    }

    collaboration = await startCollaboration();
    const owner = await authenticatedPage(browser, sessions[0]);
    const member = await authenticatedPage(browser, sessions[1]);
    contexts.push(owner.context, member.context);

    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("textbox", { name: "Motion" }).fill("Schools should ban phones");
    await owner.page.getByRole("button", { name: "Create workspace" }).click();
    await expect(owner.page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/);
    const workspaceUrl = owner.page.url();
    const workspaceId = workspaceUrl.split("/").at(-1)!;

    await showPane(owner.page, "Working panel", mobile);
    await openPanel(owner.page, "Invite people");
    await owner.page.getByRole("button", { name: "Create join code" }).click();
    await expect(owner.page.getByRole("textbox", { name: "Join code" })).toBeVisible({ timeout: 10_000 });
    const code = await owner.page.getByRole("textbox", { name: "Join code" }).inputValue();
    await member.page.goto("/app/workspaces/invite");
    await member.page.getByLabel("Join code").fill(code);
    await member.page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(member.page).toHaveURL(workspaceUrl);

    await showPane(owner.page, "Files", mobile);
    await owner.page.getByRole("button", { name: "R1" }).click();
    await expect(owner.page.getByLabel("Assignee").locator(`option[value="${ids[1]}"]`)).toHaveCount(1, { timeout: 10_000 });
    await owner.page.getByLabel("Assignee").selectOption(ids[1]);
    await expect(owner.page.getByLabel("Assignee")).toHaveValue(ids[1]);
    await showPane(member.page, "Files", mobile);
    await member.page.getByRole("button", { name: "R1" }).click();
    const ownerEditor = owner.page.locator(".ProseMirror");
    const memberEditor = member.page.locator(".ProseMirror");
    await ownerEditor.fill("Phones interrupt learning");
    await expect(owner.page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(memberEditor).toContainText("Phones interrupt learning");
    await memberEditor.click();
    await memberEditor.press("End");
    await memberEditor.pressSequentially(" and sleep");
    await expect(ownerEditor).toContainText("and sleep");

    await stop(collaboration);
    collaboration = await startCollaboration();
    await owner.page.reload();
    await showPane(owner.page, "Files", mobile);
    await owner.page.getByRole("button", { name: "R1" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("Phones interrupt learning and sleep");
    await member.page.reload();
    await showPane(member.page, "Files", mobile);
    await member.page.getByRole("button", { name: "R1" }).click();
    await expect(member.page.locator(".ProseMirror")).toContainText("Phones interrupt learning and sleep");

    if (testInfo.project.name === "mobile-chromium") {
      await owner.page.getByRole("button", { name: "Editing" }).click();
      await owner.page.locator(".ProseMirror").click();
      await owner.page.locator(".ProseMirror").press("ControlOrMeta+A");
      await owner.page.keyboard.insertText("Focused phone policy");
      await showPane(member.page, "Working panel", mobile);
      await openPanel(member.page, "Review");
      await expect(member.page.getByRole("button", { name: "Accept" })).toHaveCount(1);
      await member.page.getByRole("button", { name: "Accept" }).click();
      await showPane(member.page, "Document", mobile);
      await expect(member.page.locator(".ProseMirror")).toContainText("Focused phone policy");
      return;
    }

    await openPanel(owner.page, "Invite people");
    await owner.page.getByLabel("Email").fill(emails[2]);
    await owner.page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(owner.page.getByText("Email invitation sent.")).toBeVisible();
    let inviteUrl = "";
    await expect.poll(async () => {
      const response = await request.get(`${mailerUrl}/api/v1/messages`);
      const payload = await response.json() as { messages?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const messages = Array.isArray(payload) ? payload : payload.messages ?? [];
      const message = [...messages].reverse().find((item) => JSON.stringify(item).includes(emails[2]));
      const id = message?.ID ?? message?.Id ?? message?.id;
      if (typeof id === "string") {
        const detail = await (await request.get(`${mailerUrl}/api/v1/message/${id}`)).text();
        inviteUrl = detail.match(/https?:\/\/[^\s"<>]+token=[^\s"<>]+/)?.[0] ?? "";
      }
      return inviteUrl;
    }).toMatch(/token=/);
    const emailMember = await signedOutPage(browser);
    contexts.push(emailMember.context);
    const invitation = new URL(inviteUrl);
    await emailMember.page.goto(`${invitation.pathname}${invitation.search}`);
    await expect(emailMember.page).toHaveURL(/\/login$/);
    await expect(emailMember.page).not.toHaveURL(/token=/);
    await emailMember.page.getByLabel("Email address").fill(emails[2]);
    await emailMember.page.getByRole("button", { name: "Send code" }).click();
    let otp = "";
    await expect.poll(async () => {
      const response = await request.get(`${mailerUrl}/api/v1/messages`);
      const payload = await response.json() as { messages?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const messages = Array.isArray(payload) ? payload : payload.messages ?? [];
      for (const message of [...messages].reverse()) {
        if (!JSON.stringify(message).includes(emails[2])) continue;
        const id = message.ID ?? message.Id ?? message.id;
        if (typeof id !== "string") continue;
        const detail = await (await request.get(`${mailerUrl}/api/v1/message/${id}`)).text();
        otp = detail.match(/\b(\d{6})\b/)?.[1] ?? "";
        if (otp) break;
      }
      return otp;
    }).toMatch(/^\d{6}$/);
    await emailMember.page.getByRole("textbox", { name: "Verification code" }).fill(otp);
    await emailMember.page.getByRole("button", { name: "Verify code" }).click();
    await expect(emailMember.page).toHaveURL(workspaceUrl);
    await expect(emailMember.page).not.toHaveURL(/token=/);

    await owner.page.getByLabel("New file name").fill("Rebuttal");
    await owner.page.getByRole("button", { name: "Add" }).click();
    await owner.page.getByRole("button", { name: "Rebuttal" }).click();
    await owner.page.getByLabel("File name", { exact: true }).fill("Rebuttal notes");
    await owner.page.getByRole("button", { name: "Rename" }).click();
    await owner.page.getByRole("button", { name: "Duplicate" }).click();
    await owner.page.getByRole("region", { name: "Rebuttal notes" }).getByRole("button", { name: "Trash" }).click();
    await owner.page.getByRole("complementary", { name: "Files" }).getByRole("button", { name: "Trash" }).click();
    await owner.page.getByRole("region", { name: "Rebuttal notes" }).getByRole("button", { name: "Restore" }).click();

    const beforeScopedDraft = await admin.from("workspace_documents")
      .select("durable_sequence,id")
      .eq("workspace_id", workspaceId)
      .eq("side", "pro")
      .eq("title", "R1")
      .single();
    if (beforeScopedDraft.error) throw beforeScopedDraft.error;
    await member.context.setOffline(true);
    await member.page.locator(".ProseMirror").click();
    await member.page.locator(".ProseMirror").press("End");
    await member.page.locator(".ProseMirror").pressSequentially(" scoped draft");
    await member.page.getByRole("button", { name: "Intro" }).click();
    await member.context.setOffline(false);
    await expect(member.page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(member.page.locator(".ProseMirror")).not.toContainText("scoped draft");
    await member.page.getByRole("button", { name: "R1" }).click();
    await expect(member.page.locator(".ProseMirror")).toContainText("scoped draft");
    await expect.poll(async () => {
      const current = await admin.from("workspace_documents")
        .select("durable_sequence")
        .eq("id", beforeScopedDraft.data.id)
        .single();
      if (current.error) throw current.error;
      return current.data.durable_sequence;
    }).toBeGreaterThan(beforeScopedDraft.data.durable_sequence);
    await expect(member.page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

    await owner.page.getByRole("button", { name: "R1" }).click();
    await owner.page.getByRole("button", { name: "Editing" }).click();
    await owner.page.locator(".ProseMirror").click();
    await owner.page.locator(".ProseMirror").press("ControlOrMeta+A");
    await owner.page.keyboard.insertText("Phones reduce attention");
    await openPanel(member.page, "Review");
    await expect(member.page.getByLabel("Proposed change preview")).toContainText("reduce attention");
    await expect(member.page.getByLabel("Proposed change preview")).toContainText("interrupt learning");
    await expect(member.page.getByText("Original", { exact: true })).toBeVisible();
    await expect(member.page.getByText("Proposed", { exact: true })).toBeVisible();
    await expect(member.page.getByRole("button", { name: "Accept" })).toHaveCount(1);
    await member.page.getByRole("button", { name: "Accept" }).click();
    await expect(member.page.locator(".ProseMirror")).toContainText("Phones reduce attention");

    await owner.page.locator(".ProseMirror").click();
    await owner.page.locator(".ProseMirror").press("End");
    const cdp = await owner.context.newCDPSession(owner.page);
    await cdp.send("Input.imeSetComposition", { text: " t", selectionStart: 2, selectionEnd: 2 });
    await cdp.send("Input.imeSetComposition", { text: " tűrő", selectionStart: 5, selectionEnd: 5 });
    await expect(owner.page.locator(".ProseMirror")).not.toContainText("tűrő");
    await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
    await owner.page.waitForTimeout(500);
    await expect(member.page.getByRole("button", { name: "Reject" })).toHaveCount(0);
    await expect(owner.page.locator(".ProseMirror")).not.toContainText("tűrő");

    await owner.page.getByRole("button", { name: "Suggesting" }).click();
    await owner.page.locator(".ProseMirror").click();
    await owner.page.locator(".ProseMirror").press("ControlOrMeta+A");
    await owner.page.getByRole("button", { name: "Comment" }).click();
    await owner.page.getByLabel("Comment text").fill("Can you verify this?");
    await owner.page.getByLabel("Mention member").selectOption(ids[1]);
    await owner.page.getByRole("button", { name: "Add comment" }).click();
    await expect(member.page.getByText("A teammate mentioned you in a comment.")).toBeVisible();
    await member.page.getByLabel("Reply").fill("Verified.");
    await member.page.getByRole("button", { name: "Reply" }).click();
    await member.page.getByRole("button", { name: "Resolve" }).click();

    await openPanel(owner.page, "Version history");
    await owner.page.getByLabel("Version name").fill("Ready for coach");
    await owner.page.getByRole("button", { name: "Save version" }).click();
    await expect(owner.page.getByText("Ready for coach")).toBeVisible();
    await member.context.setOffline(true);
    await member.page.locator(".ProseMirror").click();
    await member.page.locator(".ProseMirror").press("End");
    await member.page.locator(".ProseMirror").pressSequentially(" offline draft");
    const beforeRewrite = await admin.from("workspace_documents")
      .select("durable_sequence,id")
      .eq("workspace_id", workspaceId)
      .eq("side", "pro")
      .eq("title", "R1")
      .single();
    if (beforeRewrite.error) throw beforeRewrite.error;
    await owner.page.locator(".ProseMirror").fill("Temporary rewrite");
    await expect.poll(async () => {
      const current = await admin.from("workspace_documents")
        .select("durable_sequence")
        .eq("id", beforeRewrite.data.id)
        .single();
      if (current.error) throw current.error;
      return current.data.durable_sequence;
    }).toBeGreaterThan(beforeRewrite.data.durable_sequence);
    await owner.page.getByRole("button", { name: "Preview" }).first().click();
    await owner.page.getByRole("button", { name: "Restore this version" }).click();
    await member.context.setOffline(false);
    await member.page.reload();
    await expect(member.page.getByRole("alert").filter({ hasText: "Recovery" })).toBeVisible();
    await expect(member.page.locator(".ProseMirror")).not.toContainText("offline draft");
    await expect(member.page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

    await openPanel(owner.page, "Invite people");
    const memberRow = owner.page.getByText(`Member ${ids[1].slice(0, 4)}`, { exact: false }).last().locator("..");
    await memberRow.getByRole("button", { name: "Remove" }).click();
    await member.page.reload();
    await expect(member.page.getByRole("alert")).toContainText("Workspace unavailable");

    await owner.page.getByRole("button", { name: "Archive workspace" }).click();
    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("textbox", { name: "Motion" }).fill("Homework should be optional");
    await owner.page.getByRole("button", { name: "Create workspace" }).click();
    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("button", { name: "Archived" }).click();
    await owner.page.getByRole("link", { name: /Schools should ban phones/ }).click();
    await owner.page.getByRole("button", { name: "Reopen workspace" }).click();
  } finally {
    await stop(collaboration);
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

test("workspace evidence, team AI review, and practice survive a teammate reload", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "The core mobile collaboration journey runs above");
  test.setTimeout(120_000);
  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });
  const password = `Local-${crypto.randomUUID()}!`;
  const ids: string[] = [];
  const contexts: BrowserContext[] = [];
  let collaboration: ChildProcess | undefined;

  try {
    const sessions: Session[] = [];
    for (const prefix of ["practice-owner", "practice-member"]) {
      const email = `${prefix}-${Date.now()}-${crypto.randomUUID()}@workspace.test`;
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, password });
      if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed");
      ids.push(created.data.user.id);
      const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false } });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign in failed");
      sessions.push(signedIn.data.session);
    }

    collaboration = await startCollaboration();
    const owner = await authenticatedPage(browser, sessions[0]);
    const member = await authenticatedPage(browser, sessions[1]);
    contexts.push(owner.context, member.context);
    await owner.page.route("**/functions/v1/ai", async (route) => {
      const body = route.request().postDataJSON() as {
        input?: { message?: string };
        workspaceContext?: WorkspaceToolContext;
      };
      const workspaceContext = body.workspaceContext;
      if (workspaceContext?.threadId && workspaceContext.threadRequest && body.input?.message) {
        const started = await admin.rpc("start_workspace_thread_generation", {
          p_assistant_message_id: workspaceContext.threadRequest.assistantMessageId,
          p_content: body.input.message,
          p_request_id: workspaceContext.requestId,
          p_thread_id: workspaceContext.threadId,
          p_user_id: ids[0],
          p_user_message_id: workspaceContext.threadRequest.userMessageId,
          p_workspace_id: workspaceContext.workspaceId,
        });
        if (started.error) throw started.error;
      }
      await route.fulfill({
        body: JSON.stringify({ output: { response: "Phones should be limited with a clear enforcement mechanism.", followUpQuestions: [], uncertainties: [] } }),
        contentType: "application/json",
        status: 200,
      });
    });

    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("textbox", { name: "Motion" }).fill("Schools should limit phones");
    await owner.page.getByRole("button", { name: "Create workspace" }).click();
    await expect(owner.page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/, { timeout: 20_000 });
    const workspaceUrl = owner.page.url();
    const workspaceId = workspaceUrl.split("/").at(-1)!;
    const membership = await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: ids[1] });
    if (membership.error) throw membership.error;

    await owner.page.getByRole("button", { name: "R1" }).click();
    await owner.page.locator(".ProseMirror").fill("Phones interrupt learning");
    await expect(owner.page.getByText("Saved", { exact: true })).toBeVisible();

    await openPanel(owner.page, "Evidence");
    await owner.page.getByLabel("Source title").fill("Attention study");
    await owner.page.getByLabel("Quoted evidence").fill("Notifications reduce sustained attention.");
    await owner.page.getByRole("button", { name: "Add evidence" }).click();
    await expect(owner.page.getByText("Attention study", { exact: true })).toBeVisible();
    await owner.page.getByRole("button", { name: "Insert citation" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("Attention study");

    await openPanel(owner.page, "Team threads");
    await owner.page.getByLabel("Thread name").fill("Both sides");
    await owner.page.getByRole("button", { name: "Create", exact: true }).click();
    await owner.page.getByLabel("Team message").fill("Compare both sides");
    await owner.page.getByRole("button", { name: "Send", exact: true }).click();
    let pendingMessage: { request_id: string; thread_id: string } | null = null;
    await expect.poll(async () => {
      const result = await admin.from("workspace_thread_messages")
        .select("request_id,thread_id").eq("workspace_id", workspaceId).eq("role", "assistant").eq("status", "progress").maybeSingle();
      if (result.error) throw result.error;
      pendingMessage = result.data;
      return Boolean(pendingMessage);
    }).toBe(true);
    if (!pendingMessage) throw new Error("Thread progress was not stored");
    const completed = await admin.rpc("complete_workspace_thread_generation", {
      p_content: "Phones should be limited with a clear enforcement mechanism.",
      p_request_id: pendingMessage.request_id,
      p_status: "complete",
      p_thread_id: pendingMessage.thread_id,
      p_user_id: ids[0],
      p_workspace_id: workspaceId,
    });
    if (completed.error) throw completed.error;
    await expect(owner.page.getByText(/clear enforcement mechanism/)).toBeVisible();

    await openPanel(owner.page, "Practice");
    await owner.page.getByRole("button", { name: "Suggest AI rewrite" }).click();
    await openPanel(owner.page, "Review");
    await expect(owner.page.getByRole("button", { name: "Reject" })).toHaveCount(1);
    await owner.page.getByRole("button", { name: "Reject" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("Phones interrupt learning");
    await openPanel(owner.page, "Practice");
    await owner.page.getByRole("button", { name: "Suggest AI rewrite" }).click();
    await openPanel(owner.page, "Review");
    await expect(owner.page.getByRole("button", { name: "Accept" })).toHaveCount(1);
    await owner.page.getByRole("button", { name: "Accept" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("clear enforcement mechanism");

    await openPanel(owner.page, "Practice");
    await owner.page.getByRole("button", { name: "Crossfire", exact: true }).click();
    await expect(owner.page).toHaveURL(/\/app\/crossfire$/);
    await expect(owner.page.getByTestId("crossfire-resolution")).toHaveValue("Schools should limit phones");
    await expect(owner.page.getByText(/Shared workspace session/)).toBeVisible();
    await expect.poll(async () => {
      const result = await admin.from("workspace_artifacts").select("id").eq("workspace_id", workspaceId).eq("tool", "crossfire");
      if (result.error) throw result.error;
      return result.data.length;
    }).toBe(1);
    await owner.page.getByRole("link", { name: "Return to workspace" }).click();

    await member.page.goto(workspaceUrl);
    await member.page.getByRole("button", { name: "R1" }).click();
    await openPanel(member.page, "Practice");
    await expect(member.page.locator("summary").filter({ hasText: /Crossfire.*progress/i })).toBeVisible();
    await member.page.reload();
    await openPanel(member.page, "Practice");
    await expect(member.page.locator("summary").filter({ hasText: /Crossfire.*progress/i })).toBeVisible();

    await owner.page.goto("/app/ask");
    await expect(owner.page.getByText(/Shared workspace session/)).toHaveCount(0);
  } finally {
    await stop(collaboration);
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

test("private writing and independent imports export useful workspace files", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "The complete mobile collaboration journey runs above");
  test.setTimeout(120_000);
  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });
  const password = `Local-${crypto.randomUUID()}!`;
  const ids: string[] = [];
  const contexts: BrowserContext[] = [];
  let collaboration: ChildProcess | undefined;

  try {
    const email = `portability-${Date.now()}-${crypto.randomUUID()}@workspace.test`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, password });
    if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed");
    ids.push(created.data.user.id);
    const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign in failed");

    collaboration = await startCollaboration();
    const owner = await authenticatedPage(browser, signedIn.data.session);
    contexts.push(owner.context);
    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("textbox", { name: "Motion" }).fill("Schools should teach media literacy");
    await owner.page.getByRole("button", { name: "Create workspace" }).click();
    await expect(owner.page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/, { timeout: 20_000 });
    await owner.page.getByRole("button", { name: "R1" }).click();
    await owner.page.locator(".ProseMirror").fill("Reusable R1 paragraph");
    await expect(owner.page.getByText("Saved", { exact: true })).toBeVisible();

    await owner.page.locator(".ProseMirror").click();
    await owner.page.locator(".ProseMirror").press("ControlOrMeta+A");
    owner.page.once("dialog", (dialog) => dialog.accept("R1 snippet"));
    await owner.page.getByRole("button", { name: "Save snippet" }).click();
    owner.page.once("dialog", (dialog) => dialog.accept("R1 template"));
    await owner.page.getByRole("button", { name: "Save template" }).click();
    await expect.poll(async () => {
      const result = await admin.from("private_writing_items").select("id").eq("user_id", ids[0]);
      if (result.error) throw result.error;
      return result.data.length;
    }).toBe(2);

    await owner.page.goto("/app/workspaces");
    await owner.page.getByRole("textbox", { name: "Motion" }).fill("Cities should expand transit");
    await owner.page.getByRole("button", { name: "Create workspace" }).click();
    await expect(owner.page).toHaveURL(/\/app\/workspaces\/[0-9a-f-]+$/, { timeout: 20_000 });
    await owner.page.getByRole("button", { name: "R1" }).click();
    await openPanel(owner.page, "Import, reuse & export");
    const snippet = owner.page.getByRole("group", { name: "R1 snippet" });
    await snippet.getByRole("button", { name: "Insert copy" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("Reusable R1 paragraph");
    const changed = await admin.from("private_writing_items").update({
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Changed original" }] }] },
    }).eq("user_id", ids[0]).eq("title", "R1 snippet");
    if (changed.error) throw changed.error;
    await expect(owner.page.locator(".ProseMirror")).not.toContainText("Changed original");

    await owner.page.locator("#workspace-document-import").setInputFiles({
      buffer: Buffer.from("# Importált beszéd\n\n1. Árvíztűrő tükörfúrógép\n2. [Forrás](https://example.com)"),
      mimeType: "text/markdown",
      name: "speech.md",
    });
    await expect(owner.page.getByLabel("Import preview")).toContainText("Árvíztűrő");
    await owner.page.getByRole("button", { name: "Replace with independent copy" }).click();
    await expect(owner.page.locator(".ProseMirror")).toContainText("Árvíztűrő tükörfúrógép");
    await expect(owner.page.getByText("Saved", { exact: true })).toBeVisible();

    const portability = owner.page.locator("details").filter({ has: owner.page.locator("summary").filter({ hasText: "Import, reuse & export" }) });
    for (const name of ["DOCX", "PDF", "Packet DOCX", "Packet PDF"]) {
      const download = owner.page.waitForEvent("download");
      await portability.getByRole("button", { name, exact: true }).click();
      await expect(await download).toBeTruthy();
    }
    await expect(portability.getByRole("button", { name: "Connect another Google account" })).toBeVisible();
  } finally {
    await stop(collaboration);
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
  }
});
