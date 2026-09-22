import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ userId: "user-a" as string | null }));
vi.mock("@/lib/supabase/AuthProvider", () => ({
  useAuth: () => ({ user: auth.userId ? { id: auth.userId } : null }),
}));

import { AccountQueryCache } from "@/components/auth/AccountQueryCache";

describe("account query cache", () => {
  beforeEach(() => { auth.userId = "user-a"; });

  it("removes prior account data when the authenticated identity changes", async () => {
    const client = new QueryClient();
    client.setQueryData(["workspace", "user-a", "secret"], { motion: "private" });
    const view = render(
      <QueryClientProvider client={client}><AccountQueryCache /></QueryClientProvider>,
    );

    auth.userId = "user-b";
    view.rerender(
      <QueryClientProvider client={client}><AccountQueryCache /></QueryClientProvider>,
    );

    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
  });
});
