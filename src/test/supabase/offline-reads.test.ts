import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase/client';

let online = true;
const fetchMock = vi.fn<typeof fetch>();
const ok = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });

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

it('sends a failed read once while offline instead of retrying it three more times', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  online = false;
  const { error } = await supabase.from('user_roles').select('role');
  expect(error).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('still sends reads when the browser wrongly reports offline', async () => {
  fetchMock.mockResolvedValue(ok());
  online = false;
  const { error } = await supabase.from('user_roles').select('role');
  expect(error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('keeps retrying a failed read while online', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(ok());
  const { error } = await supabase.from('user_roles').select('role');
  expect(error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
