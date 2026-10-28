export function duplicateWebhookResponse(): { status: number; duplicate: boolean } {
  return { status: 200, duplicate: true };
}

export function webhookFailureResponse(message: string): {
  status: number;
  received: boolean;
  error: string;
} {
  return { status: 500, received: false, error: message };
}

export type ClaimResult = "claimed" | "duplicate" | "in_progress";

// Claim before side effects. Only the delivery that holds the claim may
// release or complete it. Returns "processed" or why it did nothing.
export async function processWebhookEvent<T extends { id: string }>(
  event: { id: string; type: string; data: { object: T } },
  deps: {
    claim: (id: string, type: string) => Promise<ClaimResult>;
    release: (id: string) => Promise<void>;
    complete: (id: string) => Promise<void>;
    retrieveSubscription: (id: string) => Promise<T>;
    handle: (type: string, object: T) => Promise<void>;
  },
): Promise<"processed" | "duplicate" | "in_progress"> {
  const claim = await deps.claim(event.id, event.type);
  if (claim !== "claimed") return claim;
  try {
    const subscriptionEvent = event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted";
    const object = subscriptionEvent
      ? await deps.retrieveSubscription(event.data.object.id)
      : event.data.object;
    await deps.handle(event.type, object);
  } catch (error) {
    await deps.release(event.id);
    throw error;
  }
  await deps.complete(event.id);
  return "processed";
}
