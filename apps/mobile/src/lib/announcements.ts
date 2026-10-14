import { ActiveAnnouncementsResponseSchema, normalizeAnnouncement, type UserAnnouncement } from '@debatelab/core/announcements';
import { fetch } from 'expo/fetch';

import { abortError, payloadOf, untilAborted } from './ai-request';
import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

/**
 * The website's src/lib/announcements.ts for students: list the active
 * announcements and dismiss one, through the `announcements` Edge Function.
 * Dismissals are stored on the server, so they are shared with the website.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** One request with the app's function headers. The deadline and the caller's abort start before the session read. */
async function requestAnnouncements(
  method: 'GET' | 'POST',
  action: string | null,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortForCaller = () => controller.abort();
  signal?.addEventListener('abort', abortForCaller);
  if (signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw abortError();
    const { data } = await untilAborted(supabase.auth.getSession(), controller.signal);
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    const query = action ? `?action=${encodeURIComponent(action)}` : '';
    const response = await fetch(`${supabaseProject.url}/functions/v1/announcements${query}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseProject.anonKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await payloadOf(response);
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed: ${response.status}`);
    return payload ?? {};
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (controller.signal.aborted) throw new Error('The request took too long');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortForCaller);
  }
}

export async function listActiveAnnouncements(signal?: AbortSignal): Promise<UserAnnouncement[]> {
  const payload = await requestAnnouncements('GET', null, undefined, signal);
  return ActiveAnnouncementsResponseSchema.parse(payload).announcements.map(normalizeAnnouncement);
}

export async function dismissAnnouncement(announcementId: string): Promise<void> {
  await requestAnnouncements('POST', 'dismiss', { announcementId }, undefined);
}
