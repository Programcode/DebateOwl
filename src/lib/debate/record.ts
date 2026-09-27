import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';

/**
 * Saving a finished result into its debate must not turn a successful AI
 * response into a failure: the result stays on screen and the user is told
 * only that it was not saved.
 */
export async function recordInDebate(record: () => Promise<string>): Promise<string | null> {
  try {
    return await record();
  } catch (error) {
    console.error('Failed to record result in debate:', error);
    toast({ title: i18n.t('debate.recordFailed'), variant: 'destructive' });
    return null;
  }
}
