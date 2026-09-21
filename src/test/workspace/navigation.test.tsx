import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeLoaders } from "@/lib/route-modules";
import WorkspacesPage from "@/pages/WorkspacesPage";
import WorkspacePage from "@/pages/WorkspacePage";

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock("@/lib/supabase/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "signed-token" },
    user: { id: "11111111-1111-4111-8111-111111111111" },
  }),
}));

vi.mock("@/components/features/workspace/WorkspaceEditor", () => ({
  WorkspaceEditor: ({ editable }: { editable: boolean }) => (
    <div role="textbox" aria-label="Document editor" contentEditable={editable} />
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderWorkspaces(children = <WorkspacesPage />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("workspace navigation", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  it("lazy loads the workspace index and editor routes", () => {
    expect(Object.keys(routeLoaders)).toEqual(expect.arrayContaining([
      "/app/workspaces",
      "/app/workspaces/:workspaceId",
    ]));
  });

  it("collects the motion once and exposes workspace creation", () => {
    renderWorkspaces();

    expect(screen.getByRole("textbox", { name: "Motion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeInTheDocument();
  });

  it("creates a workspace and opens its Intro immediately", async () => {
    mockRpc.mockResolvedValue({ data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/workspaces"]}>
        <Routes>
          <Route path="/app/workspaces" element={<WorkspacesPage />} />
          <Route path="/app/workspaces/:workspaceId" element={<LocationProbe />} />
        </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Motion" }), {
      target: { value: "Schools should ban phones" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Current path" })).toHaveTextContent(
        "/app/workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    });
  });

  it("lists two memberships and reopens an archived workspace", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          motion: "AI tutors should grade homework",
          status: "active",
          title: null,
          updated_at: "2026-09-21T08:00:00.000Z",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          motion: "Schools should ban phones",
          status: "archived",
          title: null,
          updated_at: "2026-09-20T08:00:00.000Z",
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue({ select: () => ({ order }) });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/workspaces"]}>
          <Routes>
            <Route path="/app/workspaces" element={<WorkspacesPage />} />
            <Route path="/app/workspaces/:workspaceId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: /AI tutors should grade homework/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("link", { name: /Schools should ban phones/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Schools should ban phones/ }));

    expect(screen.getByRole("status", { name: "Current path" })).toHaveTextContent(
      "/app/workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("shows both sides and keeps an assigned file editable by every member", async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => table === "workspaces"
          ? { single: async () => ({
            data: {
              access_epoch: 0,
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              motion: "Schools should ban phones",
              owner_id: "11111111-1111-4111-8111-111111111111",
              pending_owner_id: null as string | null,
              revision: 0,
              status: "active",
              title: null as string | null,
            },
            error: null as Error | null,
          }) }
          : Promise.resolve({
            data: table === "workspace_members"
              ? [
                { joined_at: "2026-09-21T08:00:00.000Z", user_id: "11111111-1111-4111-8111-111111111111" },
                { joined_at: "2026-09-21T08:01:00.000Z", user_id: "22222222-2222-4222-8222-222222222222" },
              ]
              : [
                {
                  assignee_id: "22222222-2222-4222-8222-222222222222",
                  document_epoch: 0,
                  durable_sequence: 0,
                  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                  position: 1,
                  side: "pro",
                  state: "active",
                  title: "R1",
                },
                {
                  assignee_id: null,
                  document_epoch: 0,
                  durable_sequence: 0,
                  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                  position: 1,
                  side: "con",
                  state: "active",
                  title: "R1",
                },
              ],
            error: null,
          }),
      }),
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]}>
          <Routes>
            <Route path="/app/workspaces/:workspaceId" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "For" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Against" })).toBeInTheDocument();
    expect(screen.getByText("Assigned to Member 2222")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document editor" })).toHaveAttribute("contenteditable", "true");
  });
});
