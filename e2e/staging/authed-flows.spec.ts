import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
// A failed action throws well inside the test timeout, so the cleanup in `finally` still runs.
test.use({ actionTimeout: 30_000, navigationTimeout: 30_000 });

const MOTION_PREFIX = 'E2E staging debate ';

/**
 * Runs one named phase as a Playwright step. On failure it logs the phase and
 * the URL path only: the query and hash can carry auth handoff tokens, and the
 * staging projects keep no traces, screenshots or video.
 */
async function step<T>(page: Page, name: string, body: () => Promise<T>): Promise<T> {
  return test.step(name, async () => {
    try {
      return await body();
    } catch (error) {
      const path = page.url().startsWith('http') ? new URL(page.url()).pathname : page.url();
      console.error(`Staging step "${name}" failed at path ${path}`);
      test.info().annotations.push({ type: 'failed-step', description: `${name} at ${path}` });
      throw error;
    }
  });
}

/** A REST client acting as the signed-in staging test user, for cleanup only. */
async function userClient(page: Page) {
  const session = await page.evaluate(() => localStorage.getItem('debate-auth-staging'));
  const accessToken = session ? (JSON.parse(session) as { access_token?: string }).access_token : undefined;
  expect(accessToken, 'staging session for cleanup').toBeTruthy();
  return createClient(process.env.STAGING_SUPABASE_URL!, process.env.STAGING_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * The debate the spec creates is the Current Debate, and the app only lets a
 * student delete a debate that is not current, so cleanup uses the same
 * signed-in session through the REST API and deletes that one row by id.
 * Its sources and saved chat go with it (ON DELETE CASCADE).
 */
async function deleteOwnDebate(page: Page, debateId: string) {
  const { data, error } = await (await userClient(page)).from('debates').delete().eq('id', debateId).select('id');
  expect(error, error?.message).toBeNull();
  expect(data).toHaveLength(1);
}

/**
 * A run killed before its cleanup (a cancelled job, a crashed runner) leaves
 * its debate behind as the account's Current Debate. Remove only debates this
 * suite names, so every run starts from the same state.
 */
async function deleteLeftoverDebates(page: Page) {
  const { data, error } = await (await userClient(page))
    .from('debates').delete().like('motion', `${MOTION_PREFIX}%`).select('id');
  expect(error, error?.message).toBeNull();
  if (data?.length) console.log(`Removed ${data.length} debate(s) left by an earlier staging run`);
}

test('real staging session persists, starts a debate, writes and removes a source, and completes one AI request', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const motion = `${MOTION_PREFIX}${runId}`;
  const sourceTitle = `E2E staging source ${runId}`;
  const sourceContent = 'A dedicated Playwright staging record used to verify authenticated persistence.';
  let debateId: string | null = null;
  let sourceCreated = false;

  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });

  try {
    await step(page, 'session persists across a reload', async () => {
      await page.goto('/app/settings');
      const testEmail = await page.evaluate(() => localStorage.getItem('debate-staging-e2e-email'));
      expect(testEmail).toBeTruthy();
      await expect(page.getByText(testEmail!, { exact: true })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(/\/app\/settings$/);
      await expect(page.getByText(testEmail!, { exact: true })).toBeVisible();
    });

    await step(page, 'start a debate', async () => {
      await page.goto('/app/library');
      await deleteLeftoverDebates(page);
      await page.reload();
      // Sources belong to a debate, so Library asks for one before it allows adding a source.
      await expect(page.getByTestId('library-debate')).toContainText('Select or create a debate', { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Add Source' })).toBeDisabled();
      await page.getByTestId('library-debate').getByRole('button', { name: 'Start debate' }).click();
      const dialog = page.getByRole('dialog', { name: 'Start new debate' });
      await dialog.getByLabel('Motion').fill(motion);
      const debateInsert = page.waitForResponse((response) =>
        response.request().method() === 'POST' && response.url().includes('/rest/v1/debates')
      );
      await dialog.getByRole('button', { name: 'Start debate' }).click();
      const insertResponse = await debateInsert;
      expect(insertResponse.ok()).toBe(true);
      const created = await insertResponse.json() as { id?: string; motion?: string };
      expect(created.motion).toBe(motion);
      debateId = created.id ?? null;
      expect(debateId).toBeTruthy();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('library-debate')).toContainText(motion);
      await expect(page.getByTestId('current-debate-desktop')).toHaveAttribute('aria-label', `Current debate: ${motion}`);
    });

    await step(page, 'add a source to the debate', async () => {
      await page.getByRole('button', { name: 'Add Source' }).click();
      await page.getByPlaceholder('Source title...').fill(sourceTitle);
      await page.getByPlaceholder('Paste source content...').fill(sourceContent);
      const sourceInsert = page.waitForResponse((response) =>
        response.request().method() === 'POST' && response.url().includes('/rest/v1/sources')
      );
      await page.getByRole('button', { name: 'Save to Library' }).click();
      expect((await sourceInsert).ok()).toBe(true);
      sourceCreated = true;
      await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible();
    });

    await step(page, 'source and debate hydrate from staging after local state is cleared', async () => {
      // Sources and debates persist under separate keys; clear both so every value below comes from staging.
      await page.evaluate(() => {
        localStorage.removeItem('debate-trainer-storage');
        localStorage.removeItem('debatelab-current-debate');
      });
      const hydrationRead = (table: string) => page.waitForResponse((response) =>
        response.request().method() === 'GET' && response.url().includes(`/rest/v1/${table}?`)
      );
      const tables = ['sources', 'debates', 'current_debates'];
      const reads = Promise.all(tables.map(hydrationRead));
      await page.reload();
      (await reads).forEach((read, index) => expect(read.ok(), `${tables[index]} read`).toBe(true));
      await expect(page.getByTestId('library-debate')).toContainText(motion, { timeout: 15_000 });
      await expect(page.getByTestId('current-debate-desktop')).toHaveAttribute('aria-label', `Current debate: ${motion}`);
      await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByText(sourceTitle, { exact: true }).click();
      await expect(page.locator('#source-detail-content')).toHaveValue(sourceContent);
      await page.getByRole('button', { name: 'Close' }).click();
    });

    await step(page, 'complete one AI request in Ask', async () => {
      await page.goto('/app/ask');
      await page.getByLabel('Pros/Cons').click();
      await page.getByPlaceholder('Ask your debate coach...').fill('Reply with one short sentence confirming this staging request.');
      const aiResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' && response.url().includes('/functions/v1/ai'),
      { timeout: 90_000 });
      await page.getByRole('button', { name: 'Send message' }).click();
      expect((await aiResponse).ok()).toBe(true);
      const saveResponseButton = page.getByRole('button', { name: 'Save message' }).last();
      await expect(saveResponseButton).toBeAttached({ timeout: 90_000 });
      const assistantBubble = saveResponseButton.locator('..');
      await expect(assistantBubble.locator(':scope > div.text-sm')).toHaveText(/\S/, { timeout: 90_000 });
    });
  } finally {
    try {
      if (sourceCreated) {
        await step(page, 'remove the source', async () => {
          await page.goto('/app/library');
          await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
          const sourceDelete = page.waitForResponse((response) =>
            response.request().method() === 'DELETE' && response.url().includes('/rest/v1/sources?')
          );
          await page.getByRole('button', { name: `Delete ${sourceTitle}`, exact: true }).click();
          expect((await sourceDelete).ok()).toBe(true);
          await page.evaluate(() => localStorage.removeItem('debate-trainer-storage'));
          const sourceHydration = page.waitForResponse((response) =>
            response.request().method() === 'GET' && response.url().includes('/rest/v1/sources?')
          );
          await page.reload();
          expect((await sourceHydration).ok()).toBe(true);
          await expect(page.getByTestId('library-debate')).toContainText(motion, { timeout: 15_000 });
          await expect(page.getByText(sourceTitle, { exact: true })).toHaveCount(0, { timeout: 15_000 });
        });
      }
    } finally {
      if (debateId) {
        const id = debateId;
        await step(page, 'delete the debate', () => deleteOwnDebate(page, id));
      }
    }
  }

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
