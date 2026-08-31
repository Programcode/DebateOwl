import * as Sentry from "@sentry/react";
import { describe, expect, it, vi } from "vitest";

describe("Sentry event filtering", () => {
  it("drops only the exact synthetic observability verification error", async () => {
    const send = vi.fn(async () => ({}));

    Sentry.init({
      dsn: "https://0123456789abcdef0123456789abcdef@o0.ingest.sentry.io/1",
      ignoreErrors: [/^Synthetic observability verification$/],
      transport: () => ({
        send,
        flush: async () => true,
      }),
    });

    Sentry.captureException(new Error("Synthetic observability verification"));
    await Sentry.flush(1_000);
    expect(send).not.toHaveBeenCalled();

    Sentry.captureException(new Error("Synthetic observability verification failed"));
    await Sentry.flush(1_000);
    expect(send).toHaveBeenCalledOnce();

    Sentry.captureException(new Error("Real privacy route failure"));
    await Sentry.flush(1_000);
    expect(send).toHaveBeenCalledTimes(2);

    await Sentry.close(1_000);
  });
});
