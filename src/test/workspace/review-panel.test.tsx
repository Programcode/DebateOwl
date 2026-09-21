import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listComments: vi.fn(),
  listNotifications: vi.fn(),
  listProposals: vi.fn(),
}));
vi.mock("@/lib/workspace/client", () => ({
  decideWorkspaceProposal: vi.fn(),
  listWorkspaceComments: api.listComments,
  listWorkspaceNotifications: api.listNotifications,
  listWorkspaceProposals: api.listProposals,
  replyWorkspaceComment: vi.fn(),
  resolveWorkspaceComment: vi.fn(),
}));
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }));

import { WorkspaceReviewPanel } from "@/components/features/workspace/WorkspaceReviewPanel";

describe("workspace review panel", () => {
  beforeEach(() => {
    api.listComments.mockResolvedValue([]);
    api.listNotifications.mockResolvedValue([]);
    api.listProposals.mockResolvedValue([{
      id: "proposal",
      hunks: [{
        id: "hunk",
        kind: "format",
        original: [{ type: "text", text: "Old claim" }],
        replacement: [{ type: "text", text: "New claim", marks: [{ type: "bold" }] }],
        status: "pending",
      }],
    }]);
  });

  it("shows a labelled non-color diff and disables decisions when read-only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkspaceReviewPanel
          documentId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          editable={false}
          epoch={1}
          onDurableSequence={vi.fn()}
          token="token"
          userId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
          workspaceId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Old claim")).toBeInTheDocument();
    expect(screen.getByText("New claim [bold]")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });
});
