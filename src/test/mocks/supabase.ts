/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

type TableResponse = {
  select?: unknown[];
  single?: unknown;
  insert?: unknown;
  order?: unknown[];
  in?: unknown[];
  update?: unknown;
  error?: { message: string };
};

const tableResponses: Record<string, TableResponse> = {};
let currentUser: { id: string } | null = { id: "user_1" };
let sessionToken = "test-token";
const defaultInvokeResponse: { data: any; error: unknown } = {
  data: { output: { ok: true } },
  error: null,
};

type FilterResult = { data: unknown; error: unknown };
type FilterChain = PromiseLike<FilterResult> & {
  eq: (...args: unknown[]) => FilterChain;
  in: (...args: unknown[]) => FilterChain;
  neq: (...args: unknown[]) => FilterChain;
  is: (...args: unknown[]) => FilterChain;
};

/** A filter chain that can be awaited after any number of .eq/.in/.neq calls. */
const filterChain = (result: () => FilterResult): FilterChain => {
  const chain: FilterChain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
};

const createQuery = (table: string) => {
  const responses = tableResponses[table] || {};

  const selectBuilder = {
    order: vi.fn(async () => ({ data: responses.order ?? responses.select ?? [], error: null })),
    single: vi.fn(async () => ({ data: responses.single ?? null, error: null })),
    eq: vi.fn(async () => ({ data: responses.select ?? [], error: responses.error ?? null })),
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
    update: vi.fn(() => filterChain(() => ({ data: responses.update ?? null, error: null }))),
    delete: vi.fn(() => filterChain(() => ({ data: null, error: null }))),
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
  rpc: vi.fn(async () => ({ data: null, error: null })),
  functions: {
    invoke: vi.fn(async () => defaultInvokeResponse),
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
  supabaseMock.functions.invoke.mockResolvedValue({ data: data as any, error });
};

export const resetMockState = () => {
  Object.keys(tableResponses).forEach((key) => delete tableResponses[key]);
  currentUser = { id: "user_1" };
  sessionToken = "test-token";
  supabaseMock.from.mockClear();
  supabaseMock.rpc.mockClear();
  supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
  supabaseMock.auth.getUser.mockClear();
  supabaseMock.auth.getSession.mockClear();
  supabaseMock.functions.invoke.mockClear();
  supabaseMock.functions.invoke.mockResolvedValue(defaultInvokeResponse);
};
