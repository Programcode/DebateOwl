import {
  DuplicateSourceError,
  useSessionStore,
} from '../stores/session-store';
import { activeDebateId } from '../stores/debate-store';
import { toast } from '@/hooks/use-toast';
import { findSavedPage, normalizeSourceUrl } from '@/lib/source-url';
import i18n from '@/i18n';

import { autoSavedSourceRow, retainedDiscoveredSources, type DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
export { parseDiscoveredSources, type DiscoveredSource, type ResultWithSources } from '@debatelab/core/ai/discovered-sources';
export { parseSourceAssessments } from '@debatelab/core/ai/source-assessments';

type AutosaveFeature = 'generate' | 'attack' | 'brainstorm' | 'factoids';

export { normalizeSourceUrl };

// Generate, Attack, Brainstorm and Factoids can finish at the same time. Each
// batch waits for the one before it, so it sees the rows that batch saved.
let autosaveQueue: Promise<void> = Promise.resolve();

export function autosaveDiscoveredSources(sources: DiscoveredSource[], capturedVia: AutosaveFeature, debateId: string | null | undefined): Promise<void> {
  const targetDebateId = debateId !== undefined ? debateId : activeDebateId();
  const run = autosaveQueue.then(() => autosaveBatch(sources, capturedVia, targetDebateId));
  autosaveQueue = run.catch((): void => undefined);
  return run;
}

async function autosaveBatch(sources: DiscoveredSource[], capturedVia: AutosaveFeature, targetDebateId: string | null): Promise<void> {
  // Every source belongs to one debate, so one-off research is not kept.
  if (!targetDebateId) return;
  const retainedSources = retainedDiscoveredSources(sources);
  if (retainedSources.length === 0) return;

  let added = 0;
  for (const source of retainedSources) {
    const session = useSessionStore.getState();
    const row = autoSavedSourceRow(source, capturedVia);
    const { metadata } = row;
    const existing = findSavedPage(session.sourceLibrary, targetDebateId, source.url);
    try {
      if (existing) {
        // Already in this debate's Library: refresh what research learned about
        // it, and keep the student's title, folder and on/off choice.
        await session.updateSource(existing.id, {
          metadata: { ...existing.metadata, ...metadata },
          ...(!existing.content.trim() && source.content ? { content: source.content } : {}),
        });
        continue;
      }
      await session.addSource({
        ...row,
        debateId: targetDebateId,
      });
      added += 1;
    } catch (error) {
      // Another tab saved this page first; the debate already has it.
      if (error instanceof DuplicateSourceError) continue;
      toast({
        title: i18n.t('aiClient.sourceSaveFailed'),
        description: i18n.t('aiClient.sourceSaveFailedDesc', { title: source.title }),
        variant: 'destructive',
      });
    }
  }
  // Research changes what grounds the next request, so say so.
  if (added > 0) {
    toast({
      title: i18n.t('aiClient.sourcesAutoSaved', { count: added }),
      description: i18n.t('aiClient.sourcesAutoSavedDesc'),
    });
  }
}
