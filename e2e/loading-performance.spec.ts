import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

test('a stalled Jam recorder cannot delay the real application', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Jam recording requires MediaRecorder, which this WebKit runtime does not expose.');
  await page.route('https://js.jam.dev/**', async () => new Promise(() => undefined));
  const jamRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://js.jam.dev/')) jamRequests.push(request.url());
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Jam waits for an interaction, so the landing page is up before any recorder request.
  await expect(page.getByRole('heading', { name: /Prepare Cases and Practice Rounds/ })).toBeVisible({ timeout: 2_000 });
  expect(jamRequests).toEqual([]);

  const jamRequest = page.waitForRequest('https://js.jam.dev/**');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await jamRequest;
  await expect(page.getByRole('heading', { name: /Prepare Cases and Practice Rounds/ })).toBeVisible();
  await expect(page.getByText('DebateLab by Pi-Stack is the official')).toHaveCount(0);
});

test('pagehide removes the Jam frame and a persisted pageshow does not re-add it (synthetic events, stubbed Jam)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Jam recording requires MediaRecorder, which this WebKit runtime does not expose.');
  await page.route('https://js.jam.dev/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

  await page.goto('/', { waitUntil: 'load' });
  const heading = page.getByRole('heading', { name: /Prepare Cases and Practice Rounds/ });
  await expect(heading).toBeVisible();
  const jamRequest = page.waitForRequest('https://js.jam.dev/**');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await jamRequest;

  // Stand-in for the capture frame Jam injects; the real one is cross-origin.
  const frames = await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.dataset.jamCapture = 'true';
    document.body.append(frame);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const afterHide = document.querySelectorAll('iframe[data-jam-capture]').length;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return { afterHide, afterShow: document.querySelectorAll('iframe[data-jam-capture]').length };
  });
  expect(frames).toEqual({ afterHide: 0, afterShow: 0 });
  await expect(heading).toBeVisible();
});

test('public routes keep the real UI after refresh', async ({ page }) => {
  await setLocale(page, 'en');
  for (const [path, label] of [
    ['/', /Prepare Cases and Practice Rounds/],
    ['/login', 'Continue with Google'],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page.getByRole(path === '/' ? 'heading' : 'button', { name: label })).toBeVisible();
    await expect(page.getByText('DebateLab by Pi-Stack is the official')).toHaveCount(0);
  }
});

test('authenticated routes keep the shell and current page after refresh', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  for (const [path, heading] of [
    ['/app', 'Prepare'],
    ['/app/generate', 'Ready to Generate'],
    ['/app/attack', 'No Mercy Mode'],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('DebateLab by Pi-Stack is the official')).toHaveCount(0);
  }
});

test('landing CTA enters the app without replacing the document', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
  });

  await page.goto('/');
  await page.evaluate(() => { document.documentElement.dataset.e2eDocument = 'original'; });
  const initialDocumentRequests = documentRequests;
  await page.getByRole('link', { name: 'Start Trial' }).first().click();

  await expect(page).toHaveURL(/\/app$/);
  expect(documentRequests).toBe(initialDocumentRequests);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation'))).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.dataset.e2eDocument)).toBe('original');
});
