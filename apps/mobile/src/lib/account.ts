import { getEdgeFunctionErrorMessage } from '@debatelab/core/supabase/edge-function-error';

import { supabase } from './supabase';

/** The text a user types to confirm deletion. Must match deletionConfirmation in supabase/functions/account. */
export function deletionConfirmation(email: string | undefined): string {
  return email || 'DELETE';
}

/**
 * Permanently deletes the signed-in account through the `account` Edge
 * Function, with the same request as the website's src/lib/account.ts. Any
 * Stripe subscription is canceled first.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in first');
  const { error } = await supabase.functions.invoke('account', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: 'delete', confirmation },
  });
  if (error) throw new Error((await getEdgeFunctionErrorMessage(error)) || 'Could not delete your account');
}
