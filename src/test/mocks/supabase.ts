import { vi } from "vitest";

type TableResponse = {
  select?: unknown[];
  single?: unknown;
  insert?: unknown;
  order?: unknown[];
  in?: unknown[];
  update?: unknown;
};

const tableResponses: Record<string, TableResponse> = {};
let currentUser: { id: string } | null = { id: "user_1" };
let sessionToken = "test-token";

const createQuery = (table: string) => {
  const responses = tableResponses[table] || {};

  const selectBuilder = {
    order: vi.fn(async () => ({ data: responses.order ?? responses.select ?? [], error: null })),
    single: vi.fn(async () => ({ data: responses.single ?? null, error: null })),
    in: vi.fn(() => ({
      order: vi.fn(async () => ({ data: responses.in ?? [], error: null })),
    })),
  };

  return {
    select: vi.fn(() => selectBuilder),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: responses.insert ?? null, error: null })),
      })),
    })),
    upsert: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: responses.update ?? null, error: null })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: null, error: null })),
      neq: vi.fn(async () => ({ data: null, error: null })),
    })),
    eq: vi.fn(async () => ({ data: responses.select ?? null, error: null })),
    neq: vi.fn(async () => ({ data: null, error: null })),
    in: vi.fn(() => ({
      order: vi.fn(async () => ({ data: responses.in ?? [], error: null })),
    })),
    order: vi.fn(async () => ({ data: responses.order ?? responses.select ?? [], error: null })),
  };
};

export const supabaseMock = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: currentUser } })),
    getSession: vi.fn(async () => ({
      data: { session: sessionToken ? { access_token: sessionToken } : null },
    })),
  },
  from: vi.fn((table: string) => createQuery(table)),
  functions: {
    invoke: vi.fn(async () => ({ data: { output: { ok: true } }, error: null })),
  },
};

export const setMockTableResponse = (table: string, response: TableResponse) => {
  tableResponses[table] = response;
};

export const setMockAuthUser = (user: { id: string } | null) => {
  currentUser = user;
};

export const setMockSessionToken = (token: string | null) => {
  sessionToken = token || "";
};

export const setMockInvokeResponse = (data: unknown, error: unknown = null) => {
  supabaseMock.functions.invoke.mockResolvedValue({ data, error });
};

export const resetMockState = () => {
  Object.keys(tableResponses).forEach((key) => delete tableResponses[key]);
  currentUser = { id: "user_1" };
  sessionToken = "test-token";
  supabaseMock.from.mockClear();
  supabaseMock.auth.getUser.mockClear();
  supabaseMock.auth.getSession.mockClear();
  supabaseMock.functions.invoke.mockClear();
};
