import { prefillFromAttack, prefillFromGenerate } from '@debatelab/core/crossfire/prefill';
import { caseHasFlowchart, flowchartFromCase } from '@debatelab/core/flowchart';
import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import type { TFunction } from 'i18next';

import { crossfirePrefill } from './crossfire';
import { newDraft, scopeKey, showDraft } from './flowchart-drafts';

/**
 * Where a case or an attack leads next, as the website's Generate and Attack
 * pages send them: "Open in Crossfire" with the case or the attack's
 * questions filled in, and the case built into a map.
 */

/** The Crossfire form the next Crossfire screen opens with, from a case. */
export function crossfireFromCase(motion: string, output: GenerateOutput) {
  crossfirePrefill.set(prefillFromGenerate(motion || output.caseStructure.thesis, output));
}

/** The Crossfire form from an attack: the case it read, and its cross-examination questions. */
export function crossfireFromAttack(caseText: string, output: AttackOutput) {
  crossfirePrefill.set(prefillFromAttack(caseText, output));
}

export type FlowchartBuild = 'built' | 'noData' | 'otherDebate';

/**
 * Puts the case on the Flowchart as a new, unsaved map, as the website's
 * Flowcharts button does. The Flowchart files its map in the debate on
 * screen, so only a case from that debate (or one-off work, in one-off mode)
 * goes there.
 */
export function buildFlowchartFromCase(output: GenerateOutput, caseDebateId: string | null, activeDebateId: string | null, t: TFunction): FlowchartBuild {
  if (!caseHasFlowchart(output)) return 'noData';
  if (caseDebateId !== activeDebateId) return 'otherDebate';
  const draft = newDraft(activeDebateId, flowchartFromCase(output, t));
  showDraft(scopeKey(activeDebateId), { ...draft, edited: true }, { replace: true });
  return 'built';
}
