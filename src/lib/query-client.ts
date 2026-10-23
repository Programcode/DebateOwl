import { QueryClient } from '@tanstack/react-query';

/** The app's one query cache, shared with code outside React (the AI transport). */
export const queryClient = new QueryClient();

/**
 * Re-reads what is left today after an AI call: the server charged it, gave it
 * back, or counted a round, so the usage line on the tool pages, Settings and
 * the Crossfire and Sparring cost notes would otherwise show the old count for
 * a minute (QB-03).
 */
export function refreshAIUsage(): void {
  void queryClient.invalidateQueries({ queryKey: ['subscription'] });
  void queryClient.invalidateQueries({ queryKey: ['session-quota'] });
}
