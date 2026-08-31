export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 160;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 5000;
export const ANNOUNCEMENT_TARGET_USERS_MAX = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnnouncementTargetType = "all" | "users";

export type CreateAnnouncementInput = {
  title: string;
  body: string;
  targetType: AnnouncementTargetType;
  targetUserIds: string[] | null;
  startsAt: string;
  expiresAt: string | null;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown, fallback?: Date): Date | null {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateCreateAnnouncement(input: unknown): ValidationResult<CreateAnnouncementInput> {
  if (!isRecord(input)) return { ok: false, error: "Request body must be an object" };

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { ok: false, error: "Title is required" };
  if (title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH) {
    return { ok: false, error: `Title must be ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters or fewer` };
  }

  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, error: "Message is required" };
  if (body.length > ANNOUNCEMENT_BODY_MAX_LENGTH) {
    return { ok: false, error: `Message must be ${ANNOUNCEMENT_BODY_MAX_LENGTH} characters or fewer` };
  }

  if (input.targetType !== "all" && input.targetType !== "users") {
    return { ok: false, error: "Target type must be all or users" };
  }

  let targetUserIds: string[] | null = null;
  if (input.targetType === "users") {
    if (!Array.isArray(input.targetUserIds) || input.targetUserIds.length === 0) {
      return { ok: false, error: "Select at least one user" };
    }
    if (input.targetUserIds.length > ANNOUNCEMENT_TARGET_USERS_MAX) {
      return { ok: false, error: `Select no more than ${ANNOUNCEMENT_TARGET_USERS_MAX} users` };
    }
    if (!input.targetUserIds.every(isUuid)) {
      return { ok: false, error: "Every targeted user must have a valid ID" };
    }
    targetUserIds = [...new Set(input.targetUserIds)];
  }

  const startsAt = parseDate(input.startsAt, new Date());
  if (!startsAt) return { ok: false, error: "Start time must be a valid date" };

  const expiresAt = input.expiresAt === null || input.expiresAt === undefined || input.expiresAt === ""
    ? null
    : parseDate(input.expiresAt);
  if (input.expiresAt && !expiresAt) return { ok: false, error: "Expiry time must be a valid date" };
  if (expiresAt && expiresAt <= startsAt) {
    return { ok: false, error: "Expiry time must be after the start time" };
  }

  return {
    ok: true,
    value: {
      title,
      body,
      targetType: input.targetType,
      targetUserIds,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

export function validateAnnouncementId(input: unknown): ValidationResult<string> {
  if (!isRecord(input) || !isUuid(input.announcementId)) {
    return { ok: false, error: "A valid announcement ID is required" };
  }
  return { ok: true, value: input.announcementId };
}
