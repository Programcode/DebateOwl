import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase/client';

let online = true;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

it('holds a Supabase read while offline and sends it once, when the connection returns', async () => {
  fetchMock.mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
  online = false;
  const read = supabase.from('user_roles').select('role');
  const result = read.then((answer) => answer);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();

  online = true;
  window.dispatchEvent(new Event('online'));
  expect((await result).error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('lets an aborted held read end without a request', async () => {
  online = false;
  const controller = new AbortController();
  const result = supabase.from('user_roles').select('role').abortSignal(controller.signal).then((answer) => answer);
  await settle();
  controller.abort();
  expect((await result).error).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('fails a write at once while offline instead of waiting', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  online = false;
  const { error } = await supabase.from('user_settings').update({ theme: 'dark' }).eq('user_id', 'u1');
  expect(error).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
