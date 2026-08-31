import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateAnnouncementId,
  validateCreateAnnouncement,
} from "./announcements.ts";

const USER_ID = "11111111-2222-4333-8444-555555555555";

Deno.test("announcement creation trims content and deduplicates target users", () => {
  const result = validateCreateAnnouncement({
    title: "  Scheduled maintenance  ",
    body: "  DebateLab will be unavailable briefly.  ",
    targetType: "users",
    targetUserIds: [USER_ID, USER_ID],
    startsAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z",
  });

  assertEquals(result, {
    ok: true,
    value: {
      title: "Scheduled maintenance",
      body: "DebateLab will be unavailable briefly.",
      targetType: "users",
      targetUserIds: [USER_ID],
      startsAt: "2026-09-01T10:00:00.000Z",
      expiresAt: "2026-09-02T10:00:00.000Z",
    },
  });
});

Deno.test("all-user announcements discard client target IDs", () => {
  const result = validateCreateAnnouncement({
    title: "New feature",
    body: "Crossfire is now available.",
    targetType: "all",
    targetUserIds: [USER_ID],
  });

  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.value.targetUserIds, null);
});

Deno.test("announcement creation rejects invalid windows and empty user targeting", () => {
  assertEquals(validateCreateAnnouncement({
    title: "Expired",
    body: "This should fail.",
    targetType: "all",
    startsAt: "2026-09-02T10:00:00.000Z",
    expiresAt: "2026-09-01T10:00:00.000Z",
  }), { ok: false, error: "Expiry time must be after the start time" });

  assertEquals(validateCreateAnnouncement({
    title: "Targeted",
    body: "This should also fail.",
    targetType: "users",
    targetUserIds: [],
  }), { ok: false, error: "Select at least one user" });
});

Deno.test("announcement dismissal requires a UUID", () => {
  assertEquals(validateAnnouncementId({ announcementId: USER_ID }), { ok: true, value: USER_ID });
  assertEquals(validateAnnouncementId({ announcementId: "not-a-uuid" }), {
    ok: false,
    error: "A valid announcement ID is required",
  });
});
