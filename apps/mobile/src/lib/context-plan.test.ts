import { beforeEach, describe, expect, it, vi } from 'vitest';

// The debate context plan reads a debate's list each time, and an item's text
// only when the plan sends it and the row changed since: a regenerated case
// and a chat with a new message are read again, an unchanged row is not, and
// a row deleted between the two reads is left out.

type Row = Record<string, unknown>;

const { db, reads, deletedSinceList } = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  /** Every read, as `table select`. */
  reads: [] as string[],
  /** Rows the list read still sees but a text read (by id) no longer finds. */
  deletedSinceList: new Set<unknown>(),
}));

vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));
vi.mock('./auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      let columns = '';
      const filters: [string, unknown][] = [];
      let within: [string, unknown[]] | null = null;
      const builder = {
        select(value: string) {
          columns = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        in(column: string, values: unknown[]) {
          within = [column, values];
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          reads.push(`${table} ${columns}`);
          const rows = (db[table] ?? [])
            .filter((row) => filters.every(([column, value]) => row[column] === value))
            .filter((row) => !within || (within[1].includes(row[within[0]]) && !deletedSinceList.has(row.id)))
            .map((row) => ({
              ...row,
              // The list's version of a case, and its chats' message counts, as PostgREST computes them.
              ...(columns.includes('version:') ? { version: ((row.output as Row | undefined)?.metadata as Row | undefined)?.generatedAt ?? null } : {}),
              ...(columns.includes('messages(count)') ? { messages: [{ count: (db.messages ?? []).filter((message) => message.chat_id === row.id).length }] } : {}),
            }));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import { forgetText } from './context-texts';
import { planRequest, setOutputChoice } from './context-plan';

const USER = 'u1';
const DEBATE = '00000000-0000-4000-8000-0000000000d1';
const CASE = '00000000-0000-4000-8000-0000000000c1';
const CHAT = '00000000-0000-4000-8000-0000000000a1';

const caseRow = (output: Row) => ({ id: CASE, user_id: USER, debate_id: DEBATE, title: 'Case', side: 'pro', created_at: '2026-10-28T10:00:00Z', output });
const outputReads = (table: string) => reads.filter((read) => read.startsWith(`${table} id,output`)).length;

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  reads.length = 0;
  deletedSinceList.clear();
  forgetText(`case:${CASE}`);
  forgetText(`chat:${CHAT}`);
});

describe('planRequest', () => {
  it('reads a regenerated case again, so the plan uses its new text', async () => {
    db.cases = [caseRow({ metadata: { generatedAt: 't1' } })];
    const before = await planRequest(USER, DEBATE, 'attack', 'both');
    // The first version has nothing usable, so it is not sent.
    expect(before.request.outputs).toEqual([]);

    db.cases = [caseRow({ caseStructure: { thesis: 'Fares price people out' }, metadata: { generatedAt: 't2' } })];
    const after = await planRequest(USER, DEBATE, 'attack', 'both');
    expect(after.request.outputs).toEqual([{ kind: 'case', id: CASE }]);
    expect(outputReads('cases')).toBe(2);
  });

  it('does not read an unchanged case again', async () => {
    db.cases = [caseRow({ caseStructure: { thesis: 'Fares price people out' }, metadata: { generatedAt: 't1' } })];
    await planRequest(USER, DEBATE, 'attack', 'both');
    await planRequest(USER, DEBATE, 'attack', 'both');
    expect(outputReads('cases')).toBe(1);
  });

  it('reads a chat again once it has a new message', async () => {
    db.chats = [{ id: CHAT, user_id: USER, debate_id: DEBATE, title: 'Chat', side: 'neutral', created_at: '2026-10-28T10:00:00Z' }];
    db.messages = [{ chat_id: CHAT, role: 'user', content: 'Is free transit fair?', created_at: '2026-10-28T10:00:01Z' }];
    // Chats are not chosen automatically; Review includes this one.
    setOutputChoice('ask', DEBATE, { kind: 'chat', id: CHAT }, true);
    const messageReads = () => reads.filter((read) => read.startsWith('messages ')).length;

    await planRequest(USER, DEBATE, 'ask', 'both');
    await planRequest(USER, DEBATE, 'ask', 'both');
    expect(messageReads()).toBe(1);

    db.messages.push({ chat_id: CHAT, role: 'assistant', content: 'Mostly, for people priced out.', created_at: '2026-10-28T10:00:02Z' });
    await planRequest(USER, DEBATE, 'ask', 'both');
    expect(messageReads()).toBe(2);
  });

  it('leaves out a case deleted between the list read and the text read', async () => {
    db.cases = [caseRow({ caseStructure: { thesis: 'Fares price people out' }, metadata: { generatedAt: 't1' } })];
    deletedSinceList.add(CASE);
    const plan = await planRequest(USER, DEBATE, 'attack', 'both');
    expect(plan.request.outputs).toEqual([]);
    expect(outputReads('cases')).toBe(1);
  });
});
