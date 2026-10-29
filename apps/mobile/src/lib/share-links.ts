import { fetch } from 'expo/fetch';

import { payloadOf } from './ai-request';
import { sessionSlot } from './session-memory';
import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

/**
 * Share links for saved results, through the `share` Edge Function: a POST
 * with the signed-in user's token and { itemType, itemData, title } returns
 * { shareCode, shareUrl, expiresAt }. Every POST makes a new link and counts
 * against the daily share limit, and the function never returns an existing
 * one, so the app reuses a link it made this session for the same saved row
 * while the shared content is unchanged and the link has not expired.
 * Anyone can read a link back with the `get_shared_item` RPC (`readSharedItem`).
 */

export type ShareKind = 'case' | 'attack' | 'brainstorm' | 'factoids';

export type ShareFailure = 'signIn' | 'limit' | 'tooLarge' | 'timeout' | 'failed';

export class ShareLinkError extends Error {
  constructor(readonly failure: ShareFailure, message: string, readonly limit?: number) {
    super(message);
    this.name = 'ShareLinkError';
  }
}

export interface ShareLink {
  url: string;
  expiresAt: string | null;
  /** False when the link was made earlier this session and is reused. */
  created: boolean;
}

interface KeptLink {
  data: string;
  url: string;
  expiresAt: string | null;
}

const REQUEST_TIMEOUT_MS = 15_000;
/** A reused link has at least this long to live, so a recipient can still open it. */
const REUSE_MARGIN_MS = 24 * 60 * 60 * 1000;

// Session memory: forgotten whenever the account changes.
const kept = sessionSlot(() => new Map<string, KeptLink>());
const pending = sessionSlot(() => new Map<string, Promise<ShareLink>>());

function stillValid(link: KeptLink, now: number): boolean {
  if (!link.expiresAt) return true;
  const expires = Date.parse(link.expiresAt);
  return Number.isFinite(expires) && expires - now > REUSE_MARGIN_MS;
}

async function postShare(userId: string, body: { itemType: ShareKind; itemData: unknown; title: string }): Promise<{ url: string; expiresAt: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== userId) throw new ShareLinkError('signIn', 'Not signed in as the owner');
    const response = await fetch(`${supabaseProject.url}/functions/v1/share`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseProject.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await payloadOf(response);
    if (!response.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : `Request failed: ${response.status}`;
      if (response.status === 401) throw new ShareLinkError('signIn', message);
      if (response.status === 429 || payload?.code === 'limit_reached') {
        throw new ShareLinkError('limit', message, typeof payload?.limit === 'number' ? payload.limit : undefined);
      }
      if (response.status === 413 || payload?.code === 'payload_too_large') throw new ShareLinkError('tooLarge', message);
      throw new ShareLinkError('failed', message);
    }
    const url = payload?.shareUrl;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new ShareLinkError('failed', 'The share response had no link');
    return { url, expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : null };
  } catch (error) {
    if (controller.signal.aborted) throw new ShareLinkError('timeout', 'The request took too long');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A link to a saved result for `userId`. `itemData` is the result as its
 * document shows it, in the shape the website's share page reads.
 */
export function shareLinkFor(userId: string, kind: ShareKind, savedId: string, title: string, itemData: unknown): Promise<ShareLink> {
  const data = JSON.stringify(itemData);
  const key = `${kind}:${savedId}`;
  const links = kept.get();
  const known = links.get(key);
  if (known && known.data === data && stillValid(known, Date.now())) {
    return Promise.resolve({ url: known.url, expiresAt: known.expiresAt, created: false });
  }
  // A second tap while the first request runs waits for the same link.
  const inFlight = pending.get();
  const waitKey = `${key}:${data}`;
  const running = inFlight.get(waitKey);
  if (running) return running.then((link) => ({ ...link, created: false }));

  const request = postShare(userId, { itemType: kind, itemData, title })
    .then((link) => {
      // The maps belong to the account that asked; after an account change they are no longer read.
      links.set(key, { data, url: link.url, expiresAt: link.expiresAt });
      return { ...link, created: true };
    })
    .finally(() => {
      inFlight.delete(waitKey);
    });
  inFlight.set(waitKey, request);
  return request;
}

export interface SharedItem {
  itemType: string;
  itemData: unknown;
  title: string;
  createdAt: string;
}

export type SharedRead = { status: 'found'; item: SharedItem } | { status: 'missing' } | { status: 'failed' };

/** A shared item, as the website's SharedPage reads it: public, so it works signed out. A missing or expired code has no row. */
export async function readSharedItem(code: string): Promise<SharedRead> {
  try {
    const { data, error, status } = await supabase.rpc('get_shared_item', { p_share_code: code }).maybeSingle();
    // No answer (offline, timeout) or a server error is a failed read, not a missing link.
    if (error) return status === 0 || status >= 500 ? { status: 'failed' } : { status: 'missing' };
    const row = data as { item_type?: unknown; item_data?: unknown; title?: unknown; created_at?: unknown } | null;
    if (!row || typeof row.item_type !== 'string') return { status: 'missing' };
    return {
      status: 'found',
      item: {
        itemType: row.item_type,
        itemData: row.item_data,
        title: typeof row.title === 'string' ? row.title : '',
        createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      },
    };
  } catch {
    return { status: 'failed' };
  }
}
