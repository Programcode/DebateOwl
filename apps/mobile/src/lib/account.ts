import { getEdgeFunctionErrorMessage } from '@debatelab/core/supabase/edge-function-error';

import { supabase } from './supabase';

/** The text a user types to confirm deletion. Must match deletionConfirmation in supabase/functions/account. */
export function deletionConfirmation(email: string | undefined): string {
  return email || 'DELETE';
}

/** One request to the `account` Edge Function, as the website's src/lib/account.ts sends it. */
async function invokeAccount(body: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in first');
  const { data, error } = await supabase.functions.invoke('account', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error) throw new Error((await getEdgeFunctionErrorMessage(error)) || fallback);
  return data;
}

/**
 * Permanently deletes the signed-in account through the `account` Edge
 * Function, with the same request as the website's src/lib/account.ts. Any
 * Stripe subscription is canceled first.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  await invokeAccount({ action: 'delete', confirmation }, 'Could not delete your account');
}

/** Everything the signed-in account owns, as the website's downloadAccountData fetches it, with its file name. */
export async function exportAccountData(now: Date = new Date()): Promise<{ fileName: string; json: string }> {
  const data = await invokeAccount({ action: 'export' }, 'Could not export your data');
  return { fileName: `debatelab-data-${now.toISOString().slice(0, 10)}.json`, json: JSON.stringify(data, null, 2) };
}

/**
 * Deletes the account's saved work, sources, debates and API keys through the
 * website's clear_current_user_data function, which acts for whoever holds the
 * session. The session must still be the account the student confirmed for.
 * Settings and the subscription stay.
 */
export async function clearAllData(userId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error('The signed-in account changed');
  const { error } = await supabase.rpc('clear_current_user_data');
  if (error) throw new Error(error.message);
}
