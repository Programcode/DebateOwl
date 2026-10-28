import type { DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import { mergeRegeneratedSection, type CaseSection } from '@debatelab/core/ai/generate-output';
import type { GenerateInput, GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import type { SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { AIError, isAbortError } from './ai-request';
import { useAuth } from './auth';
import { buildDebateContext } from './context-request';
import { openResult, updateOpenResult, type OpenResult } from './open-results';
import { openRefusal } from './refusal';
import { autosaveSources, generateCase, keepSourceAssessments, updateResult } from './results';
import { sessionSlot } from './session-memory';
import { useSettings } from './settings';

/**
 * Generate's Regenerate and Undo, as the website's GeneratePage: one part of
 * a case is written again from a whole new generation, and Undo goes back to
 * the version before. The earlier versions are kept for the session, per
 * case. Unlike the website, which leaves the saved row on the newer version,
 * Undo writes the restored version back, so History shows what is on screen.
 */

// The website keeps the last three generations.
const MAX_VERSIONS = 3;
const versions = sessionSlot(() => new Map<string, GenerateOutput[]>());
const listeners = new Set<() => void>();
let changes = 0;

function changed() {
  changes += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The case's earlier versions this session, newest last. */
function earlier(key: string): GenerateOutput[] {
  return versions.get().get(key) ?? [];
}

/** The request a regeneration repeats: the case's own form, as the website falls back to its defaults. */
function regenerationInput(result: OpenResult<'case'>): GenerateInput | null {
  const input = result.input as Partial<GenerateInput>;
  const motion = result.output.metadata?.motion?.trim() || input.motion?.trim();
  if (!motion) return null;
  return {
    motion,
    side: result.output.metadata?.side || input.side || 'pro',
    format: input.format || 'custom',
    role: input.role || 'r1',
    length: input.length || 'standard',
    audience: input.audience || 'intermediate',
    tone: input.tone || 'formal',
  };
}

async function keepResearch(userId: string, debateId: string | null, assessments: SourceAssessmentUpdate[], sources: DiscoveredSource[]) {
  try {
    await keepSourceAssessments(userId, debateId, assessments);
    await autosaveSources(userId, sources, 'generate', debateId);
  } catch (cause) {
    console.warn('Could not keep the regenerated case\'s sources:', cause instanceof Error ? cause.message : cause);
  }
}

export function useCaseEdits(key: string | null, setNotice: (text: string) => void) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { outputLanguage, readFeatureConfig } = useSettings();
  const [regenerating, setRegenerating] = useState<CaseSection | null>(null);
  const abort = useRef<AbortController | null>(null);
  useSyncExternalStore(subscribe, () => changes);

  // Leaving the case cancels a regeneration still on its way.
  useEffect(() => () => abort.current?.abort(), []);

  const saveOutput = useCallback(async (forUser: string, savedId: string | null, output: GenerateOutput) => {
    if (!savedId) return;
    try {
      await updateResult(forUser, 'case', savedId, output);
    } catch (cause) {
      console.warn('Could not save the changed case:', cause instanceof Error ? cause.message : cause);
      setNotice(t('debate.recordFailed'));
    }
  }, [setNotice, t]);

  const regenerate = useCallback(async (section: CaseSection) => {
    if (!key || !userId || regenerating) return;
    const base = openResult(key, 'case');
    const input = base ? regenerationInput(base) : null;
    if (!base || !input) {
      setNotice(`${t('generate.regenerateUnavailable')}. ${t('generate.regenerateUnavailableDesc')}`);
      return;
    }
    const forUser = userId;
    const controller = new AbortController();
    abort.current = controller;
    setRegenerating(section);
    try {
      // Against the case's own debate, never whichever is current now, as on the website.
      const [config, debateContext] = await Promise.all([
        readFeatureConfig(forUser, 'generate'),
        base.debateId ? buildDebateContext(forUser, base.debateId, 'generate', input.side) : Promise.resolve(undefined),
      ]);
      const { result: next, discoveredSources, assessments } = await generateCase(input, { config, language: outputLanguage, debateContext, signal: controller.signal });
      if (controller.signal.aborted) return;
      // An undo or another change replaced the case meanwhile; merging now would revert it.
      const latest = openResult(key, 'case');
      if (!latest || latest.output !== base.output) return;
      const merged = mergeRegeneratedSection(base.output, next, section);
      versions.get().set(key, [...earlier(key), base.output].slice(-MAX_VERSIONS));
      updateOpenResult<'case'>(key, { output: merged, sources: discoveredSources });
      changed();
      setNotice(`${t('generate.regenerated')}. ${t('generate.regeneratedDesc')}`);
      await saveOutput(forUser, base.savedId, merged);
      // The rankings and researched sources are the new generation's, kept even if the student
      // leaves now; their failure is not the regeneration's, which already landed.
      void keepResearch(forUser, base.debateId, assessments, discoveredSources);
    } catch (cause) {
      if (controller.signal.aborted || isAbortError(cause)) return;
      if (openRefusal(router, cause, 'generate')) return;
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Could not regenerate the section:', cause instanceof Error ? cause.message : cause);
      setNotice(`${t('generate.failed')}. ${t(`mobile.results.errors.${kind}`)}`);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setRegenerating(null);
      }
    }
  }, [key, outputLanguage, readFeatureConfig, regenerating, router, saveOutput, setNotice, t, userId]);

  const undo = useCallback(async () => {
    if (!key || !userId || regenerating) return;
    const held = openResult(key, 'case');
    const previous = earlier(key).at(-1);
    if (!held || !previous) {
      setNotice(t('generate.noUndo'));
      return;
    }
    versions.get().set(key, earlier(key).slice(0, -1));
    // Earlier versions do not carry their researched sources, as on the website.
    updateOpenResult<'case'>(key, { output: previous, sources: [] });
    changed();
    setNotice(`${t('generate.undone')}. ${t('generate.undoneDesc')}`);
    await saveOutput(userId, held.savedId, previous);
  }, [key, regenerating, saveOutput, setNotice, t, userId]);

  return { regenerating, regenerate, canUndo: key !== null && earlier(key).length > 0, undo };
}
