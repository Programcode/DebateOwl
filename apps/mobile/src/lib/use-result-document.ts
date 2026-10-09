import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from './auth';
import { confirmDestructive, promptText } from './confirm';
import { useDebates } from './debate-context';
import { forgetOpenResult, keepOpenResult, openResult, updateOpenResult, type OpenResult } from './open-results';
import { deleteResult, fetchAutoSavedSourceIds, fetchResult, removeSources, saveCase, type ResultKind } from './results';
import { fetchSources, subscribeSourcesChanged, type Source } from './sources';

export type DocumentState<K extends ResultKind> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; key: string; result: OpenResult<K> };

const NOTICE_MS = 3500;

/**
 * A result's document: the result itself (from this session or the saved
 * row), the debate's Library for its citation chips, the Current Debate's
 * auto-saved sources for the undo, and the menu's actions. Every action reads
 * the account when the student acts, and nothing lands after the screen is
 * left or the account changes.
 */
export function useResultDocument<K extends ResultKind>(kind: K, id: string) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current } = useDebates();
  const [state, setState] = useState<DocumentState<K>>(() => {
    const cached = openResult(id, kind);
    return cached ? { status: 'ready', key: id, result: cached } : { status: 'loading' };
  });
  const [library, setLibrary] = useState<Source[]>([]);
  const [autoSaved, setAutoSaved] = useState<string[]>([]);
  const [notice, setNoticeState] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const owner = useRef(userId);
  owner.current = userId;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    live.current = false;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const setNotice = useCallback((text: string) => {
    if (!live.current) return;
    setNoticeState(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      if (live.current) setNoticeState('');
    }, NOTICE_MS);
  }, []);

  // Load the saved row unless this session already holds the result.
  useEffect(() => {
    if (openResult(id, kind)) return;
    if (!userId || id.startsWith('local-')) {
      setState({ status: id.startsWith('local-') ? 'missing' : 'loading' });
      return;
    }
    let active = true;
    fetchResult(userId, kind, id)
      .then((row) => {
        if (!active) return;
        if (!row) {
          setState({ status: 'missing' });
          return;
        }
        const result: OpenResult<K> = { ...row, savedId: row.id, sources: [] };
        keepOpenResult(result);
        setState({ status: 'ready', key: row.id, result });
      })
      .catch((cause: unknown) => {
        console.warn('Could not load the result:', cause instanceof Error ? cause.message : cause);
        if (active) setState({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [userId, kind, id]);

  const result = state.status === 'ready' ? state.result : null;
  const resultDebateId = result?.debateId ?? null;

  // The result's own debate's Library, for its citation chips.
  useEffect(() => {
    if (!userId || !resultDebateId) {
      setLibrary([]);
      return;
    }
    let active = true;
    const load = () =>
      fetchSources(userId, resultDebateId)
        .then((next) => {
          if (active) setLibrary(next);
        })
        .catch((cause: unknown) => console.warn('Could not load sources for citations:', cause instanceof Error ? cause.message : cause));
    void load();
    const unsubscribe = subscribeSourcesChanged(() => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, resultDebateId]);

  // The website's undo covers the Current Debate's Auto-saved folder, also in one-off mode.
  const currentId = current?.id ?? null;
  const autoSavedRequest = useRef(0);
  const loadAutoSaved = useCallback(() => {
    const request = ++autoSavedRequest.current;
    if (!userId || !currentId) {
      setAutoSaved([]);
      return;
    }
    fetchAutoSavedSourceIds(userId, currentId)
      .then((ids) => {
        if (live.current && autoSavedRequest.current === request) setAutoSaved(ids);
      })
      .catch((cause: unknown) => console.warn('Could not count auto-saved sources:', cause instanceof Error ? cause.message : cause));
  }, [userId, currentId]);
  useFocusEffect(loadAutoSaved);

  const remove = useCallback(async () => {
    if (!result?.savedId || !userId) return;
    const forUser = userId;
    const savedId = result.savedId;
    const confirmed = await confirmDestructive({
      title: kind === 'case' ? t('historyPage.deleteCaseTitle') : t('mobile.results.deleteAttackTitle'),
      message: kind === 'case' ? t('historyPage.deleteCaseDesc') : t('mobile.results.deleteAttackDesc'),
      confirm: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (!confirmed || !live.current || owner.current !== forUser) return;
    setBusy(true);
    try {
      await deleteResult(forUser, kind, savedId);
      forgetOpenResult(savedId);
      if (state.status === 'ready') forgetOpenResult(state.key);
      if (live.current) router.back();
    } catch (cause) {
      console.warn('Could not delete the result:', cause instanceof Error ? cause.message : cause);
      setNotice(t('mobile.results.deleteFailed'));
    } finally {
      if (live.current) setBusy(false);
    }
  }, [kind, result, router, setNotice, state, t, userId]);

  /** Saves an unsaved case outside any debate, as the website's Save button. */
  const save = useCallback(async () => {
    if (state.status !== 'ready' || state.result.savedId || state.result.kind !== 'case' || !userId) return;
    const forUser = userId;
    const { key, result: open } = state;
    const title = await promptText({
      title: t('generate.saveCase'),
      message: t('generate.savePrompt'),
      defaultValue: open.title,
      confirm: t('common.save'),
      cancel: t('common.cancel'),
    });
    if (!title?.trim() || !live.current || owner.current !== forUser) return;
    setBusy(true);
    try {
      const savedId = await saveCase(forUser, title.trim(), open.output as OpenResult<'case'>['output']);
      updateOpenResult(key, { savedId, title: title.trim() });
      if (!live.current) return;
      setState({ status: 'ready', key, result: { ...open, savedId, title: title.trim() } });
      setNotice(t('generate.saved'));
    } catch (cause) {
      console.warn('Could not save the case:', cause instanceof Error ? cause.message : cause);
      setNotice(t('generate.saveFailedDesc'));
    } finally {
      if (live.current) setBusy(false);
    }
  }, [setNotice, state, t, userId]);

  const undoAutoSaved = useCallback(async () => {
    if (!userId || autoSaved.length === 0) return;
    const forUser = userId;
    setBusy(true);
    try {
      const { succeeded, failed } = await removeSources(forUser, autoSaved);
      if (!live.current || owner.current !== forUser) return;
      if (failed === 0) setNotice(`${t('autoSavedSources.removedTitle')}. ${t('autoSavedSources.removedDesc', { count: succeeded })}`);
      else if (succeeded === 0) setNotice(`${t('autoSavedSources.removeFailed')} ${t('autoSavedSources.removeFailedDesc', { succeeded, failed })}`);
      else setNotice(`${t('autoSavedSources.removedPartialTitle')}. ${t('autoSavedSources.removedPartialDesc', { succeeded, failed })}`);
    } finally {
      if (live.current) setBusy(false);
      loadAutoSaved();
    }
  }, [autoSaved, loadAutoSaved, setNotice, t, userId]);

  return { state, library, autoSaved, notice, setNotice, busy, remove, save, undoAutoSaved };
}
