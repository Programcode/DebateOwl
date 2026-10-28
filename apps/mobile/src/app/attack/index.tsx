import { attackDraftSections } from '@debatelab/core/ai/live-sections';
import type { AttackInput } from '@debatelab/core/ai/schemas/attack';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton } from '@/components/buttons';
import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow, SwitchRow } from '@/components/form-rows';
import { ModelPicker } from '@/components/model-picker';
import { Text } from '@/components/text';
import { LiveToolRun, useLiveRun } from '@/components/live-run';
import { ToolError, ToolTitle, WorkingIn } from '@/components/tool-form';
import { AIError, isAbortError, type AIErrorKind } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { buildDebateContext } from '@/lib/context-request';
import { useDebates } from '@/lib/debate-context';
import { keepOpenResult, openResult } from '@/lib/open-results';
import { caseToText } from '@/lib/result-text';
import { openRefusal } from '@/lib/refusal';
import { arrivalNotices, attackCase, autosaveSources, fetchResult, isCompleteCase, keepSourceAssessments, recordResult } from '@/lib/results';
import { sessionSlot } from '@/lib/session-memory';
import { useSettings } from '@/lib/settings';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';

// The website's defaults (AttackForm). The last form stays for the session, as on the website.
const DEFAULT_FORM: AttackInput = {
  caseText: '',
  aggressiveness: 'ruthless',
  judgeParadigm: 'logic',
  detectFallacies: true,
  analyzeWeighing: true,
};
const lastForm = sessionSlot<AttackInput>(() => DEFAULT_FORM);


/**
 * Attack, as the website's AttackPage. Opened from a case, the case's text
 * fills the form, as the website passes a case in through the Attack form.
 */
export default function AttackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from, caseKey } = useLocalSearchParams<{ from?: string; caseKey?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { activeDebateId, refresh } = useDebates();
  const { outputLanguage, readFeatureConfig } = useSettings();
  const { colors } = useTheme();
  const [form, setFormState] = useState<AttackInput>(lastForm.get);
  const [textError, setTextError] = useState(false);
  const [phase, setPhase] = useState<'form' | 'attacking'>('form');
  const [error, setError] = useState<AIErrorKind | null>(null);
  const requests = useRef(0);
  const copies = useCopyHolder();
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);

  const setForm = useCallback((patch: Partial<AttackInput>) =>
    setFormState((previous) => {
      const next = { ...previous, ...patch };
      lastForm.set(next);
      return next;
    }), []);

  const liveRun = useLiveRun();
  const endLiveRun = liveRun.end;
  const abortActive = useCallback(() => {
    requests.current += 1;
    abort.current?.abort();
    abort.current = null;
    endLiveRun();
  }, [endLiveRun]);

  useEffect(() => () => {
    live.current = false;
    abortActive();
  }, [abortActive]);

  // A case opened here fills the form with its text.
  useEffect(() => {
    if (!caseKey) return;
    const open = openResult(caseKey, 'case');
    if (open && isCompleteCase(open.output)) {
      setForm({ caseText: caseToText(open.output) });
      return;
    }
    if (!userId || caseKey.startsWith('local-')) return;
    let active = true;
    fetchResult(userId, 'case', caseKey, copies.mark())
      .then((row) => {
        if (active && row && isCompleteCase(row.output)) setForm({ caseText: caseToText(row.output) });
      })
      .catch((cause: unknown) => console.warn('Could not load the case to attack:', cause instanceof Error ? cause.message : cause));
    return () => {
      active = false;
    };
  }, [caseKey, userId, setForm, copies]);

  const submit = async () => {
    if (!userId) return;
    const input = { ...form, caseText: form.caseText.trim() };
    if (!input.caseText) {
      setTextError(true);
      return;
    }
    const forUser = userId;
    // Attack critiques pasted text, not a motion, so it follows the Current Debate directly.
    const debateId = activeDebateId;
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request && live.current;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase('attacking');
    try {
      const [config, debateContext] = await Promise.all([
        readFeatureConfig(forUser, 'attack'),
        debateId ? buildDebateContext(forUser, debateId, 'attack', 'both') : Promise.resolve(undefined),
      ]);
      if (!isCurrent()) return;
      const { result, discoveredSources, truncated, assessments } = await attackCase(input, {
        config,
        language: outputLanguage,
        debateContext,
        signal: controller.signal,
        live: liveRun.begin(),
      });
      if (!isCurrent()) return;
      const assessed = await keepSourceAssessments(forUser, debateId, assessments, controller.signal);
      if (!isCurrent()) return;
      const sources = await autosaveSources(forUser, discoveredSources, 'attack', debateId, controller.signal);
      if (!isCurrent()) return;
      const title = result.overallAssessment?.summary?.slice(0, 80) || input.caseText.slice(0, 80);
      let savedId: string | null = null;
      let recordFailed = false;
      if (debateId) {
        try {
          savedId = await recordResult(forUser, 'attack', { title, input, output: result, debateId, side: 'neutral' });
        } catch (cause) {
          console.warn('Could not save the attack to the debate:', cause instanceof Error ? cause.message : cause);
          recordFailed = true;
        }
      }
      if (!isCurrent()) return;
      const key = keepOpenResult({ kind: 'attack', savedId, title, side: 'neutral', debateId, createdAt: Date.now(), input, output: result, sources: discoveredSources });
      const notice = arrivalNotices({ recordFailed, sourcesFailed: sources.failed, assessed, truncated });
      router.replace({
        pathname: '/attack/[id]',
        params: {
          id: key,
          from: caseKey ? 'case' : from ?? 'practice',
          ...(notice ? { notice } : {}),
          ...(sources.failed > 0 ? { failed: String(sources.failed) } : {}),
        },
      });
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Attack failed:', cause instanceof Error ? cause.message : cause);
      if (kind === 'debateMissing') void refresh();
      liveRun.end();
      setPhase('form');
      // A limit or model refusal opens the website's dialog as a sheet, not an inline error.
      if (openRefusal(router, cause, 'attack')) return;
      setError(kind);
    } finally {
      if (requests.current === request) abort.current = null;
    }
  };

  const attacking = phase === 'attacking';

  return (
    <DocumentScreen
      testID="attack-screen"
      header={<DocumentHeader backLabel={backLabel(t, caseKey ? 'case' : from, 'practice')} actions={[]} />}
      actions={attacking ? undefined : <MainActionButton label={t('attackForm.submit')} onPress={() => void submit()} />}>
      <ToolTitle title={t('nav.attack')} subtitle={t('attack.emptyDesc')} />
      <WorkingIn />
      {attacking ? (
        <LiveToolRun
          label={t('attack.working')}
          run={liveRun.state}
          sections={liveRun.state.draft ? attackDraftSections(liveRun.state.draft, t) : []}
          onCancel={() => {
            abortActive();
            setPhase('form');
          }}
          pose="skeptical"
        />
      ) : (
        <>
          <Field
            label={t('attackForm.argument')}
            value={form.caseText}
            onChangeText={(caseText) => {
              setForm({ caseText });
              if (caseText.trim()) setTextError(false);
            }}
            placeholder={t('attackForm.argumentPlaceholder')}
            multiline
            invalid={textError}
            style={styles.caseText}
            testID="attack-case-text"
          />
          {textError ? (
            <Text accessibilityRole="alert" style={[styles.invalid, { color: colors.destructive }]}>
              {t('mobile.attack.caseRequired')}
            </Text>
          ) : null}
          <FormGroup label={t('attackForm.options')}>
            <SelectRow<AttackInput['aggressiveness']>
              first
              label={t('attackForm.intensity')}
              value={form.aggressiveness}
              onChange={(aggressiveness) => setForm({ aggressiveness })}
              options={[
                { value: 'mild', label: t('attackForm.intensityMild') },
                { value: 'moderate', label: t('attackForm.intensityModerate') },
                { value: 'ruthless', label: t('attackForm.intensityRuthless') },
              ]}
            />
            <SelectRow<AttackInput['judgeParadigm']>
              label={t('attackForm.paradigm')}
              value={form.judgeParadigm}
              onChange={(judgeParadigm) => setForm({ judgeParadigm })}
              options={[
                { value: 'logic', label: t('attackForm.paradigmLogic') },
                { value: 'values', label: t('attackForm.paradigmValues') },
                { value: 'policy', label: t('attackForm.paradigmPolicy') },
              ]}
            />
            <SwitchRow
              label={t('attackForm.detectFallacies')}
              description={t('attackForm.detectFallaciesDesc')}
              value={form.detectFallacies}
              onChange={(detectFallacies) => setForm({ detectFallacies })}
            />
            <SwitchRow
              label={t('attackForm.analyzeWeighing')}
              description={t('attackForm.analyzeWeighingDesc')}
              value={form.analyzeWeighing}
              onChange={(analyzeWeighing) => setForm({ analyzeWeighing })}
            />
          </FormGroup>
          <ModelPicker feature="attack" />
          {error ? <ToolError title={t('attack.failed')} error={error} onRetry={() => void submit()} /> : null}
        </>
      )}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  caseText: { minHeight: 200, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  invalid: { fontSize: 14, marginTop: -6, marginLeft: 4 },
});
