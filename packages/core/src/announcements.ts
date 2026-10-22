import { z } from 'zod';

/** An announcement as the `announcements` Edge Function lists it to a student. Shared by the website and the app. */
export interface UserAnnouncement {
  id: string;
  title: string;
  body: string;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
}

export const AnnouncementRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  starts_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const ActiveAnnouncementsResponseSchema = z.object({
  announcements: z.array(AnnouncementRowSchema),
});

export type AnnouncementRow = z.infer<typeof AnnouncementRowSchema>;

export function normalizeAnnouncement(row: AnnouncementRow): UserAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** The announcements that have started and not yet expired at `now`. */
export function filterVisibleAnnouncements(announcements: UserAnnouncement[], now: number) {
  return announcements.filter((announcement) => {
    const startsAt = new Date(announcement.startsAt).getTime();
    const expiresAt = announcement.expiresAt ? new Date(announcement.expiresAt).getTime() : Infinity;
    return startsAt <= now && expiresAt > now;
  });
}
