import { expect, test, type Page } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth';

const ANNOUNCEMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TARGET_USER_ID = '11111111-2222-4333-8444-555555555555';

test.beforeEach(async ({ page }) => {
  await stubSupabaseSession(page, { userId: '99999999-9999-4999-8999-999999999999' });
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: true, isTourRunning: false },
      version: 0,
    }));
  });
});

async function openAppNav(page: Page, label: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: label, exact: true })
      .click();
    return;
  }

  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: label })
    .click();
}

function countAnnouncementListRequests(page: Page) {
  let count = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/functions/v1/announcements')) count += 1;
  });
  return () => count;
}

test('user sees and permanently dismisses an active announcement', async ({ page }) => {
  let dismissBody: Record<string, unknown> | null = null;
  await page.route('**/functions/v1/announcements*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.searchParams.get('action') === 'dismiss') {
      dismissBody = request.postDataJSON();
      await route.fulfill({ json: { success: true } });
      return;
    }
    await route.fulfill({
      json: {
        announcements: [{
          id: ANNOUNCEMENT_ID,
          title: 'Scheduled maintenance',
          body: 'DebateLab will be unavailable for ten minutes.',
          starts_at: '2026-08-31T12:00:00.000Z',
          expires_at: null,
          created_at: '2026-08-31T11:00:00.000Z',
        }],
      },
    });
  });

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toBeVisible();
  await expect(page.getByText('DebateLab will be unavailable for ten minutes.')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }).click();

  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toHaveCount(0);
  expect(dismissBody).toEqual({ announcementId: ANNOUNCEMENT_ID });
});

test('keeps announcements stable across routes and refreshes on a full reload', async ({ page }) => {
  // The auth session is a browser-only stub. This verifies client request sequencing, not backend auth.
  const listRequestCount = countAnnouncementListRequests(page);
  let listResponseCount = 0;
  await page.route('**/functions/v1/announcements*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ json: { success: true } });
      return;
    }

    listResponseCount += 1;
    const current = listResponseCount === 1
      ? {
        id: ANNOUNCEMENT_ID,
        title: 'Scheduled maintenance',
        body: 'DebateLab will be unavailable for ten minutes.',
        starts_at: '2026-08-31T12:00:00.000Z',
        expires_at: null,
        created_at: '2026-08-31T11:00:00.000Z',
      }
      : {
        id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        title: 'Current announcement',
        body: 'This message is current after refresh.',
        starts_at: '2026-08-31T12:00:00.000Z',
        expires_at: null,
        created_at: '2026-08-31T11:00:00.000Z',
      };
    await route.fulfill({ json: { announcements: [current] } });
  });

  await page.goto('/app/generate');
  await expect(page.getByRole('heading', { name: 'Generate', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toBeVisible();
  expect(listRequestCount()).toBe(1);

  await page.getByRole('button', { name: 'Dismiss announcement: Scheduled maintenance' }).click();
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toHaveCount(0);

  await openAppNav(page, 'Library');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await openAppNav(page, 'Tools');
  await expect(page.getByRole('main').getByRole('heading', { name: 'What are you working on?', exact: true })).toBeVisible();
  expect(listRequestCount()).toBe(1);
  expect(listResponseCount).toBe(1);
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Current announcement' })).toBeVisible();
  await expect.poll(() => listRequestCount()).toBe(2);
  expect(listResponseCount).toBe(2);
});

test('admin can deactivate without losing history, then explicitly delete', async ({ page }) => {
  let createBody: Record<string, unknown> | null = null;
  let deactivateBody: Record<string, unknown> | null = null;
  let deleteBody: Record<string, unknown> | null = null;

  await page.route('**/functions/v1/announcements*', (route) => route.fulfill({ json: { announcements: [] } }));
  await page.route('**/functions/v1/admin*', async (route) => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');

    if (action === 'stats') {
      await route.fulfill({ json: { totals: { requests: 0, cost: 0, successRate: 100 }, daily: [], byFeature: {}, byUser: [] } });
      return;
    }
    if (action === 'users') {
      await route.fulfill({ json: { users: [{ id: TARGET_USER_ID, email: 'target@example.com', createdAt: '2026-08-01T00:00:00.000Z', lastSignIn: '2026-08-31T00:00:00.000Z', requestCount: 2, role: 'user' }] } });
      return;
    }
    if (action === 'promo-codes') {
      await route.fulfill({ json: { codes: [] } });
      return;
    }
    if (action === 'subscribers') {
      await route.fulfill({ json: { subscribers: [] } });
      return;
    }
    if (action === 'announcements') {
      await route.fulfill({ json: { announcements: [] } });
      return;
    }
    if (action === 'create-announcement') {
      createBody = request.postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          announcement: {
            id: ANNOUNCEMENT_ID,
            title: 'Targeted note',
            body: 'This message is only for the selected user.',
            target_type: 'users',
            target_user_ids: [TARGET_USER_ID],
            starts_at: '2026-08-31T12:00:00.000Z',
            expires_at: null,
            deactivated_at: null,
            created_by: '99999999-9999-4999-8999-999999999999',
            created_at: '2026-08-31T12:00:00.000Z',
          },
        },
      });
      return;
    }
    if (action === 'deactivate-announcement') {
      deactivateBody = request.postDataJSON();
      await route.fulfill({
        json: {
          announcement: {
            id: ANNOUNCEMENT_ID,
            title: 'Targeted note',
            body: 'This message is only for the selected user.',
            target_type: 'users',
            target_user_ids: [TARGET_USER_ID],
            starts_at: '2026-08-31T12:00:00.000Z',
            expires_at: null,
            deactivated_at: '2026-08-31T19:30:00.000Z',
            created_by: '99999999-9999-4999-8999-999999999999',
            created_at: '2026-08-31T12:00:00.000Z',
          },
        },
      });
      return;
    }
    if (action === 'delete-announcement') {
      deleteBody = request.postDataJSON();
      await route.fulfill({ json: { success: true } });
      return;
    }
    await route.fulfill({ status: 400, json: { error: 'Unexpected action' } });
  });

  await page.goto('/app/admin');
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  await page.getByRole('tab', { name: 'Announcements' }).click();
  await expect(page.getByText('No announcements yet')).toBeVisible();

  await page.getByLabel('Title').fill('Targeted note');
  await page.getByLabel('Message').fill('This message is only for the selected user.');
  await page.getByLabel('Audience').click();
  await page.getByRole('option', { name: 'Selected users' }).click();
  await page.getByRole('checkbox', { name: 'Select target@example.com' }).check();
  await page.getByRole('button', { name: 'Create announcement' }).click();

  await expect(page.getByRole('heading', { name: 'Targeted note' })).toBeVisible();
  await expect.poll(() => createBody).toMatchObject({
    title: 'Targeted note',
    body: 'This message is only for the selected user.',
    targetType: 'users',
    targetUserIds: [TARGET_USER_ID],
  });

  await page.getByRole('button', { name: 'Deactivate announcement: Targeted note' }).click();
  await page.getByRole('button', { name: 'Deactivate announcement' }).click();

  await expect.poll(() => deactivateBody).toEqual({ announcementId: ANNOUNCEMENT_ID });
  await expect(page.getByRole('heading', { name: 'Targeted note' })).toBeVisible();
  await expect(page.getByText('Deactivated', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete announcement: Targeted note' }).click();
  await page.getByRole('button', { name: 'Delete announcement' }).click();

  await expect(page.getByRole('heading', { name: 'Targeted note' })).toHaveCount(0);
  await expect.poll(() => deleteBody).toEqual({ announcementId: ANNOUNCEMENT_ID });
});
