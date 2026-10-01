import { supabase } from '@/lib/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/supabase/edge-function-error';
import { saveBlob } from '@/lib/export-utils';

async function invokeAccount(body: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in first');

  const { data, error } = await supabase.functions.invoke('account', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error) || fallback);
  return data;
}

/** Downloads everything the signed-in account owns as one JSON file. */
export async function downloadAccountData(): Promise<void> {
  const data = await invokeAccount({ action: 'export' }, 'Could not export your data');
  const date = new Date().toISOString().slice(0, 10);
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `debatelab-data-${date}.json`);
}

/**
 * Permanently deletes the signed-in account. `confirmation` is the account
 * email, or DELETE for an account without one. Any Stripe subscription is
 * canceled first.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  await invokeAccount({ action: 'delete', confirmation }, 'Could not delete your account');
}
