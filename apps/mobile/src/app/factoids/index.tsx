import type { FactoidsInput } from '@debatelab/core/ai/schemas/factoids';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton } from '@/components/buttons';
import { DocumentScreen } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow } from '@/components/form-rows';
import { SegmentedControl } from '@/components/segmented-control';
import { Text } from '@/components/text';
import { ToolError, ToolProgress, ToolTitle, WorkingIn } from '@/components/tool-form';
import { AIError, isAbortError, type AIErrorKind } from '@/lib/ai-request';
import { useAuth } from '@/lib/auth';
import { backLabel } from '@/lib/back-label';
import { buildDebateContext } from '@/lib/context-request';
import { useDebates } from '@/lib/debate-context';
import { fetchFeatureConfig } from '@/lib/feature-config';
import { keepOpenResult } from '@/lib/open-results';
import { arrivalNotices, autosaveSources, findFactoids, keepSourceAssessments, recordResult } from '@/lib/results';
import { sessionSlot } from '@/lib/session-memory';
import { useSettings } from '@/lib/settings';
import { useTheme } from '@/theme/use-theme';

// The website's defaults (FactoidsForm).
const DEFAULT_FORM: FactoidsInput = { claim: '', direction: 'for', region: '', timeframe: '', sourceType: 'any', sourceCount: 5 };
const SOURCE_COUNTS = Array.from({ length: 13 }, (_, index) => String(index + 3));

// The last form stays for the session, as on the website; session memory forgets it when the account changes.
const lastForm = sessionSlot<FactoidsInput>(() => DEFAULT_FORM);

const PROGRESS = ['factoidsForm.loadingMsg1', 'factoidsForm.loadingMsg2', 'factoidsForm.loadingMsg3', 'factoidsForm.loadingMsg4', 'factoidsForm.loadingMsg5'];

/**
 * Factoids, as the website's FactoidsPage. Factoids research a claim, not
 * the motion, so there is no motion gate: the result follows the Current
 * Debate, and one-off work is not saved. A search suggestion from a result
 * opens here with its query as the claim and runs once.
 */
export default function FactoidsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { from, claim: suggested } = useLocalSearchParams<{ from?: string; claim?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { activeDebateId, refresh } = useDebates();
  const { outputLanguage } = useSettings();
  const { colors } = useTheme();
  const [form, setFormState] = useState<FactoidsInput>(lastForm.get);
  const [claimError, setClaimError] = useState(false);
  const [phase, setPhase] = useState<'form' | 'working'>('form');
  const [error, setError] = useState<AIErrorKind | null>(null);
  const requests = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);
  const owner = useRef(userId);
  const ranSuggestion = useRef(false);

  const setForm = useCallback((patch: Partial<FactoidsInput>) =>
    setFormState((previous) => {
      const next = { ...previous, ...patch };
      lastForm.set(next);
      return next;
    }), []);

  const abortActive = useCallback(() => {
    requests.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  useEffect(() => () => {
    live.current = false;
    abortActive();
  }, [abortActive]);

  // Another account signing in cancels this one's request and drops its form.
  useEffect(() => {
    if (owner.current === userId) return;
    owner.current = userId;
    abortActive();
    setPhase('form');
    setError(null);
    setFormState(lastForm.get());
  }, [abortActive, userId]);

  const submit = async (input: FactoidsInput) => {
    if (!userId) return;
    if (!input.claim.trim()) {
      setClaimError(true);
      return;
    }
    const forUser = userId;
    // Read the Current Debate when the student asks; one-off work belongs to none.
    const debateId = activeDebateId;
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request && live.current && owner.current === forUser;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase('working');
    try {
      const [config, debateContext] = await Promise.all([
        fetchFeatureConfig(forUser, 'factoids'),
        debateId ? buildDebateContext(forUser, debateId, 'factoids', input.direction === 'against' ? 'con' : 'pro') : Promise.resolve(undefined),
      ]);
      if (!isCurrent()) return;
      const { result, discoveredSources, truncated, assessments } = await findFactoids(input, { config, language: outputLanguage, debateContext, signal: controller.signal });
      if (!isCurrent()) return;
      const assessed = await keepSourceAssessments(forUser, debateId, assessments, controller.signal);
      if (!isCurrent()) return;
      const sources = await autosaveSources(forUser, discoveredSources, 'factoids', debateId, controller.signal);
      if (!isCurrent()) return;
      let savedId: string | null = null;
      let recordFailed = false;
      if (debateId) {
        try {
          savedId = await recordResult(forUser, 'factoids', { title: input.claim, input, output: result, debateId, side: 'neutral' });
        } catch (cause) {
          console.warn('Could not save the factoids to the debate:', cause instanceof Error ? cause.message : cause);
          recordFailed = true;
        }
      }
      if (!isCurrent()) return;
      const key = keepOpenResult({
        kind: 'factoids',
        savedId,
        title: input.claim,
        side: 'neutral',
        debateId,
        createdAt: Date.now(),
        input,
        output: result,
        sources: discoveredSources,
      });
      const notice = arrivalNotices({ recordFailed, sourcesFailed: sources.failed, assessed, truncated });
      router.replace({
        pathname: '/factoids/[id]',
        params: {
          id: key,
          from: from ?? 'prepare',
          ...(notice ? { notice } : {}),
          ...(sources.failed > 0 ? { failed: String(sources.failed) } : {}),
        },
      });
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Factoids failed:', cause instanceof Error ? cause.message : cause);
      if (kind === 'debateMissing') void refresh();
      setError(kind);
      setPhase('form');
    } finally {
      if (requests.current === request) abort.current = null;
    }
  };

  // A suggestion searches its query with the rest of the last form, once, as the website's handleUseSuggestion.
  useEffect(() => {
    if (!suggested?.trim() || ranSuggestion.current || !userId) return;
    ranSuggestion.current = true;
    const input = { ...lastForm.get(), claim: suggested.trim() };
    setForm({ claim: input.claim });
    void submit(input);
    // submit reads the latest debate and account itself; the suggestion runs only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, userId]);

  const cancel = () => {
    abortActive();
    setPhase('form');
  };

  const working = phase === 'working';

  return (
    <DocumentScreen
      testID="factoids-screen"
      header={<DocumentHeader backLabel={backLabel(t, from, 'prepare')} actions={[]} />}
      actions={working ? undefined : <MainActionButton label={t('factoidsForm.submit')} onPress={() => void submit({ ...form, claim: form.claim.trim() })} />}>
      <ToolTitle title={t('nav.factoids')} subtitle={t('factoidsForm.subtitle')} />
      <WorkingIn />
      {working ? (
        <ToolProgress messages={PROGRESS.map((key) => t(key))} detail={form.claim} onCancel={cancel} />
      ) : (
        <>
          <Field
            label={t('factoidsForm.claim')}
            value={form.claim}
            onChangeText={(claim) => {
              setForm({ claim });
              if (claim.trim()) setClaimError(false);
            }}
            placeholder={t('factoidsForm.claimPlaceholder')}
            multiline
            invalid={claimError}
            style={styles.claim}
            testID="factoids-claim"
          />
          {claimError ? (
            <Text accessibilityRole="alert" style={[styles.invalid, { color: colors.destructive }]}>
              {t('mobile.factoids.claimRequired')}
            </Text>
          ) : null}
          <View style={styles.side}>
            <Text weight="medium" tone="secondary" style={styles.label}>
              {t('factoidsForm.direction')}
            </Text>
            <SegmentedControl<FactoidsInput['direction']>
              options={[
                { value: 'for', label: t('factoidsForm.directionFor') },
                { value: 'against', label: t('factoidsForm.directionAgainst') },
              ]}
              value={form.direction}
              onChange={(direction) => setForm({ direction })}
            />
          </View>
          <FormGroup>
            <SelectRow<FactoidsInput['sourceType']>
              first
              label={t('factoidsForm.sourceType')}
              value={form.sourceType}
              onChange={(sourceType) => setForm({ sourceType })}
              options={[
                { value: 'any', label: t('factoidsForm.sourceAny') },
                { value: 'academic', label: t('factoidsForm.sourceAcademic') },
                { value: 'government', label: t('factoidsForm.sourceGovernment') },
                { value: 'news', label: t('factoidsForm.sourceNews') },
              ]}
              testID="factoids-source-type"
            />
            <SelectRow
              label={t('factoidsForm.sourceCount')}
              value={String(form.sourceCount)}
              onChange={(count) => setForm({ sourceCount: Number(count) })}
              options={SOURCE_COUNTS.map((count) => ({ value: count, label: count }))}
              testID="factoids-source-count"
            />
          </FormGroup>
          <Field
            label={t('factoidsForm.region')}
            value={form.region ?? ''}
            onChangeText={(region) => setForm({ region })}
            placeholder={t('factoidsForm.regionPlaceholder')}
            testID="factoids-region"
          />
          <Field
            label={t('factoidsForm.timeframe')}
            value={form.timeframe ?? ''}
            onChangeText={(timeframe) => setForm({ timeframe })}
            placeholder={t('factoidsForm.timeframePlaceholder')}
            testID="factoids-timeframe"
          />
          {error ? <ToolError title={t('factoids.failed')} error={error} onRetry={() => void submit({ ...form, claim: form.claim.trim() })} /> : null}
        </>
      )}
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  claim: { minHeight: 72, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
  invalid: { fontSize: 14, marginTop: -6, marginLeft: 4 },
  side: { gap: 7 },
  label: { fontSize: 14, marginLeft: 4 },
});
