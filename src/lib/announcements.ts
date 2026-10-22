import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { z } from 'zod';
import {
  ActiveAnnouncementsResponseSchema,
  AnnouncementRowSchema,
  normalizeAnnouncement,
  type UserAnnouncement,
} from '@debatelab/core/announcements';

export type { UserAnnouncement };

export type AnnouncementTargetType = 'all' | 'users';

export interface AdminAnnouncement extends UserAnnouncement {
  targetType: AnnouncementTargetType;
  targetUserIds: string[] | null;
  deactivatedAt: string | null;
  createdBy: string | null;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  targetType: AnnouncementTargetType;
  targetUserIds?: string[];
  startsAt?: string;
  expiresAt?: string;
}

const AdminAnnouncementRowSchema = AnnouncementRowSchema.extend({
  target_type: z.enum(['all', 'users']),
  target_user_ids: z.array(z.uuid()).nullable(),
  deactivated_at: z.iso.datetime({ offset: true }).nullable(),
  // Null once the author's account is deleted.
  created_by: z.uuid().nullable(),
});

const AdminAnnouncementsResponseSchema = z.object({
  announcements: z.array(AdminAnnouncementRowSchema),
});

const CreateAnnouncementResponseSchema = z.object({
  announcement: AdminAnnouncementRowSchema,
});

const DeactivateAnnouncementResponseSchema = z.object({
  announcement: AdminAnnouncementRowSchema,
});

type AdminAnnouncementRow = z.infer<typeof AdminAnnouncementRowSchema>;

async function requestFunction({
  functionName,
  action,
  method = 'GET',
  body,
  signal,
}: {
  functionName: 'admin' | 'announcements';
  action?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const query = action ? `?action=${encodeURIComponent(action)}` : '';
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'string'
      ? payload.error
      : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeAdminAnnouncement(row: AdminAnnouncementRow): AdminAnnouncement {
  return {
    ...normalizeAnnouncement(row),
    targetType: row.target_type,
    targetUserIds: row.target_user_ids,
    deactivatedAt: row.deactivated_at,
    createdBy: row.created_by,
  };
}

function toIsoOrUndefined(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export async function listActiveAnnouncements(signal?: AbortSignal): Promise<UserAnnouncement[]> {
  const payload = await requestFunction({
    functionName: 'announcements',
    signal,
  });
  const response = ActiveAnnouncementsResponseSchema.parse(payload);
  return response.announcements.map(normalizeAnnouncement);
}

export async function dismissAnnouncement(announcementId: string): Promise<void> {
  await requestFunction({
    functionName: 'announcements',
    action: 'dismiss',
    method: 'POST',
    body: { announcementId },
  });
}

export async function listAdminAnnouncements(signal?: AbortSignal): Promise<AdminAnnouncement[]> {
  const payload = await requestFunction({
    functionName: 'admin',
    action: 'announcements',
    signal,
  });
  const response = AdminAnnouncementsResponseSchema.parse(payload);
  return response.announcements.map(normalizeAdminAnnouncement);
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<AdminAnnouncement> {
  const payload = await requestFunction({
    functionName: 'admin',
    action: 'create-announcement',
    method: 'POST',
    body: {
      ...input,
      targetUserIds: input.targetType === 'users' ? input.targetUserIds : undefined,
      startsAt: toIsoOrUndefined(input.startsAt),
      expiresAt: toIsoOrUndefined(input.expiresAt),
    },
  });
  const response = CreateAnnouncementResponseSchema.parse(payload);
  return normalizeAdminAnnouncement(response.announcement);
}

export async function deactivateAnnouncement(announcementId: string): Promise<AdminAnnouncement> {
  const payload = await requestFunction({
    functionName: 'admin',
    action: 'deactivate-announcement',
    method: 'POST',
    body: { announcementId },
  });
  const response = DeactivateAnnouncementResponseSchema.parse(payload);
  return normalizeAdminAnnouncement(response.announcement);
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  await requestFunction({
    functionName: 'admin',
    action: 'delete-announcement',
    method: 'POST',
    body: { announcementId },
  });
}
