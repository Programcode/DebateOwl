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
