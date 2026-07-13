import { describe, expect, it } from "vitest";
import {
  duplicateWebhookResponse,
  webhookFailureResponse,
} from "../../supabase/functions/stripe-webhook/webhook-event-lifecycle";

describe("webhook event lifecycle", () => {
  it("keeps successfully processed events idempotent", () => {
    expect(duplicateWebhookResponse()).toEqual({ status: 200, duplicate: true });
  });

  it("returns a retryable failure when event handling fails", () => {
    expect(webhookFailureResponse("temporary database error")).toEqual({
      status: 500,
      received: false,
      error: "temporary database error",
    });
  });
});
