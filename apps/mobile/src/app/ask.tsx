import type { AskOutput } from '@debatelab/core/ai/schemas/ask';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskAnswer } from '@/components/ask-answer';
import { AskHistory } from '@/components/ask-history';
import { TextButton } from '@/components/buttons';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { Text } from '@/components/text';
import { AIError, isAbortError, type AIErrorKind } from '@/lib/ai-request';
import { askOnce, canStream, isFinalAskError, isMessageWithinBudget, streamAsk, type AskOptions } from '@/lib/ask';
import { buildDebateContext } from '@/lib/context-request';
import { fetchFeatureConfig, type FeatureConfig } from '@/lib/feature-config';
import { useAuth } from '@/lib/auth';
import { ChatSaveError, fetchChat, saveChat, type ChatMessage, type ChatRecord } from '@/lib/chats';
import { useDebates } from '@/lib/debate-context';
import { useSettings } from '@/lib/settings';
import { fetchSources, type Source } from '@/lib/sources';
import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

const NO_OPTIONS: AskOptions = { citationMode: false, webSearch: false, prosConsMode: false, argumentMapMode: false };
const NEW_CHAT: ChatRecord = { chatId: null, debateId: null, persisted: 0 };

// The web's toggles as one row of chips above the composer (mock 07).
const OPTION_CHIPS: { key: keyof AskOptions; label: string; icon: IconName }[] = [
  { key: 'citationMode', label: 'askChat.citations', icon: 'quote' },
  { key: 'webSearch', label: 'askChat.webSearch', icon: 'globe' },
  { key: 'prosConsMode', label: 'askChat.modeProsCons', icon: 'list' },
  { key: 'argumentMapMode', label: 'askChat.modeArgMap', icon: 'map' },
];

const THINKING = ['askChat.thinking', 'askChat.researching', 'askChat.analyzing', 'askChat.generatingResponse', 'askChat.almostThere'];

const PLAN_ERRORS = new Set<AIErrorKind>(['trialExpired', 'limitReached', 'modelRestricted']);
const RETRYABLE_ERRORS = new Set<AIErrorKind>(['network', 'timeout', 'failed', 'rateLimit']);

let localId = 0;
const nextId = () => `local-${Date.now()}-${(localId += 1)}`;

/** Ask, as in mock 07: a coaching chat that streams, grounded in the Current Debate. */
export default function AskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current, oneOff, activeDebateId, refresh } = useDebates();
  const { outputLanguage } = useSettings();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [record, setRecordState] = useState<ChatRecord>(NEW_CHAT);
  const [options, setOptions] = useState<AskOptions>(NO_OPTIONS);
  const [input, setInput] = useState('');
  const [error, setError] = useState<{ kind: AIErrorKind; question: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [library, setLibrary] = useState<Source[]>([]);

  const scroll = useRef<ScrollView>(null);
  const requests = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const config = useRef<Promise<FeatureConfig> | null>(null);
  // The conversation the saved record belongs to; replacing it drops late writes.
  const conversation = useRef(0);
  const recordRef = useRef(record);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const activeDebateRef = useRef(activeDebateId);
  activeDebateRef.current = activeDebateId;

  const setRecord = (next: ChatRecord) => {
    recordRef.current = next;
    setRecordState(next);
  };

  const askConfig = () => {
    if (!config.current && userId) config.current = fetchFeatureConfig(userId, 'ask');
    return config.current!;
  };

  const abortActive = useCallback(() => {
    requests.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  // Leaving Ask cancels an answer still on its way, so nothing half-written is saved.
  useEffect(() => () => abortActive(), [abortActive]);

  const startConversation = (messagesNext: ChatMessage[], recordNext: ChatRecord) => {
    abortActive();
    conversation.current += 1;
    setMessages(messagesNext);
    setRecord(recordNext);
    setStreaming(null);
    setLoading(false);
    setOpening(false);
    setError(null);
    setNotice('');
  };

  // Another debate, or one-off mode, starts a fresh conversation; an open chat in the new scope stays.
  const scope = oneOff ? null : current?.id ?? null;
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    const open = recordRef.current;
    if (!(open.chatId && open.debateId === scope)) startConversation([], NEW_CHAT);
    // startConversation only touches refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // The debate this conversation reads from: a loaded chat keeps its own.
  const chatDebateId = record.chatId ? record.debateId : activeDebateId;
  useEffect(() => {
    if (!chatDebateId || !userId) {
      setLibrary([]);
      return;
    }
    let active = true;
    fetchSources(userId, chatDebateId)
      .then((next) => {
        if (active) setLibrary(next);
      })
      .catch((cause: unknown) => console.warn('Could not load sources for citations:', cause instanceof Error ? cause.message : cause));
    return () => {
      active = false;
    };
  }, [userId, chatDebateId]);

  // Each finished exchange is saved to the debate, as on the website.
  const lastRole = messages[messages.length - 1]?.role;
  useEffect(() => {
    if (loading || lastRole !== 'assistant' || !userId) return;
    const snapshot = messages;
    const owner = conversation.current;
    saves.current = saves.current.then(async () => {
      if (owner !== conversation.current || recordRef.current.persisted >= snapshot.length) return;
      try {
        const next = await saveChat(userId, recordRef.current, snapshot, activeDebateRef.current);
        if (next && owner === conversation.current) setRecord(next);
      } catch (cause) {
        console.warn('Could not save the chat:', cause instanceof Error ? cause.message : cause);
        if (owner !== conversation.current) return;
        if (cause instanceof ChatSaveError) setRecord(cause.record);
        setNotice(t('debate.recordFailed'));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lastRole, messages, userId]);

  const send = async (text: string, history: ChatMessage[]) => {
    const message = text.trim();
    if (!message || !userId) return;
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request;
    if (!isMessageWithinBudget(message)) {
      setError({ kind: 'tooLarge', question: message });
      return;
    }
    const requestOptions = options;
    const controller = new AbortController();
    abort.current = controller;
    setMessages([...history, { id: nextId(), role: 'user', content: message, timestamp: Date.now() }]);
    setInput('');
    setError(null);
    setNotice('');
    setLoading(true);
    const started = Date.now();

    try {
      const open = recordRef.current;
      const debateId = open.chatId ? open.debateId : activeDebateRef.current;
      const [askSettings, debateContext] = await Promise.all([
        askConfig(),
        // Ask prepares no side, so every saved result matches it.
        debateId ? buildDebateContext(userId, debateId, 'ask', 'both', open.chatId) : Promise.resolve(undefined),
      ]);
      if (!isCurrent()) return;
      const askRequest = {
        message,
        history: history.map((item) => ({ role: item.role, content: item.content })),
        options: requestOptions,
        config: askSettings,
        language: outputLanguage,
        debateContext,
      };

      let result: AskOutput;
      if (canStream(requestOptions)) {
        let received = '';
        let pending = '';
        let flush: ReturnType<typeof setTimeout> | null = null;
        setStreaming('');
        try {
          result = await streamAsk(askRequest, {
            signal: controller.signal,
            onDelta: (delta) => {
              if (!isCurrent()) return;
              received += delta;
              pending += delta;
              // Tokens arrive faster than the screen needs; paint every 30 ms like the website.
              flush ??= setTimeout(() => {
                flush = null;
                const batch = pending;
                pending = '';
                if (isCurrent()) setStreaming((previous) => (previous ?? '') + batch);
              }, 30);
            },
          });
        } catch (streamError) {
          if (isAbortError(streamError) || !isCurrent()) throw streamError;
          if (received) {
            setNotice(`${t('ask.streamInterrupted')} ${t('ask.streamInterruptedDesc')}`);
            result = { response: received.trim(), followUpQuestions: [], uncertainties: [t('ask.streamInterrupted')] };
          } else if (isFinalAskError(streamError)) {
            throw streamError;
          } else {
            // Nothing arrived: ask once more without streaming, as the website does.
            setStreaming(null);
            result = await askOnce(askRequest, controller.signal);
          }
        } finally {
          if (flush) clearTimeout(flush);
        }
      } else {
        result = await askOnce(askRequest, controller.signal);
      }

      if (!isCurrent()) return;
      const output = {
        ...result,
        model: result.model || askSettings.model,
        provider: result.provider || 'openrouter',
        durationMs: result.durationMs || Date.now() - started,
        generatedAt: result.generatedAt || new Date().toISOString(),
      };
      setStreaming(null);
      setMessages((previous) => [...previous, { id: nextId(), role: 'assistant', content: result.response, timestamp: Date.now(), output }]);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      setStreaming(null);
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Ask failed:', cause instanceof Error ? cause.message : cause);
      // A missing debate was deleted elsewhere; reload the list so the app stops using it.
      if (kind === 'debateMissing') void refresh();
      setError({ kind, question: message });
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setStreaming(null);
        abort.current = null;
      }
    }
  };

  // Retrying replaces the unanswered question instead of asking it twice.
  const retry = (question: string) => {
    const last = messages[messages.length - 1];
    void send(question, last?.role === 'user' ? messages.slice(0, -1) : messages);
  };

  const openChat = async (chatId: string) => {
    if (!userId) return;
    setHistoryOpen(false);
    startConversation([], NEW_CHAT);
    const owner = conversation.current;
    setOpening(true);
    try {
      const chat = await fetchChat(userId, chatId);
      if (owner !== conversation.current) return;
      setMessages(chat.messages);
      setRecord({ chatId, debateId: chat.debateId, persisted: chat.messages.length });
    } catch (cause) {
      console.warn('Could not open the chat:', cause instanceof Error ? cause.message : cause);
      if (owner === conversation.current) setNotice(t('mobile.ask.openFailed'));
    } finally {
      if (owner === conversation.current) setOpening(false);
    }
  };

  const subtitle = oneOff ? t('debate.oneOffActive') : current?.motion ?? '';
  const busy = loading || opening;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.card }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} onPress={() => router.back()} style={styles.headerButton}>
          <Icon name="chevronLeft" color={colors.primary} size={28} />
        </Pressable>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" weight="bold" style={styles.headerTitle}>
            {t('nav.ask')}
          </Text>
          {subtitle ? (
            <Text tone="faint" style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('askChat.openSavedChats')}
          hitSlop={8}
          onPress={() => setHistoryOpen(true)}
          style={styles.headerButton}
          testID="ask-history-button">
          <Icon name="history" color={colors.primary} size={26} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && streaming === null && !busy ? (
          <View style={styles.empty}>
            <Text weight="semibold" style={styles.emptyTitle}>
              {t('askChat.startConversation')}
            </Text>
            <Text tone="secondary" style={styles.emptyBody}>
              {t('askChat.startDesc')}
            </Text>
          </View>
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <View key={message.id} style={[styles.bubble, { backgroundColor: colors.primary }]}>
              <Text style={[styles.bubbleText, { color: colors.onPrimary }]} selectable>
                {message.content}
              </Text>
            </View>
          ) : (
            <AskAnswer key={message.id} content={message.content} output={message.output} library={library} />
          ),
        )}

        {streaming !== null && streaming !== '' ? <AskAnswer content={streaming} streaming library={library} /> : null}
        {loading && !streaming ? <Thinking /> : null}
        {opening ? <ActivityIndicator style={styles.opening} accessibilityRole="progressbar" /> : null}

        {notice ? (
          <Text tone="secondary" accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text weight="semibold" style={styles.errorTitle}>
              {t('ask.failed')}
            </Text>
            <Text tone="secondary" style={styles.errorBody}>
              {t(`mobile.ask.errors.${error.kind}`)}
            </Text>
            <View style={styles.errorActions}>
              {RETRYABLE_ERRORS.has(error.kind) ? <TextButton label={t('common.retry')} onPress={() => retry(error.question)} /> : null}
              {PLAN_ERRORS.has(error.kind) ? <TextButton label={t('mobile.ask.openYou')} onPress={() => router.navigate('/you')} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.line, backgroundColor: colors.tabBar }]}>
        <View style={styles.composerColumn}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow} keyboardShouldPersistTaps="handled">
            {OPTION_CHIPS.map((chip) => (
              <Chip
                key={chip.key}
                label={t(chip.label)}
                icon={chip.icon}
                selected={options[chip.key]}
                accessibilityRole="switch"
                onPress={() => setOptions((previous) => ({ ...previous, [chip.key]: !previous[chip.key] }))}
              />
            ))}
          </ScrollView>
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('mobile.ask.placeholder')}
              placeholderTextColor={colors.tabInactive}
              accessibilityLabel={t('mobile.ask.placeholder')}
              editable={!busy}
              multiline
              numberOfLines={1}
              style={[styles.input, { color: colors.foreground }]}
              testID="ask-input"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('askChat.send')}
              accessibilityState={{ disabled: busy || !input.trim() }}
              disabled={busy || !input.trim()}
              onPress={() => void send(input, messages)}
              style={[styles.send, { backgroundColor: colors.primary }, (busy || !input.trim()) && styles.sendDisabled]}
              testID="ask-send">
              {busy ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Icon name="arrowUp" color={colors.onPrimary} size={19} />}
            </Pressable>
          </View>
        </View>
      </View>

      <AskHistory
        visible={historyOpen}
        debateId={scope}
        openChatId={record.chatId}
        onClose={() => setHistoryOpen(false)}
        onPick={(chatId) => void openChat(chatId)}
        onNewChat={() => {
          setHistoryOpen(false);
          startConversation([], NEW_CHAT);
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** What the coach is doing while a whole answer is prepared, cycling like the website's. */
function Thinking() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % THINKING.length), 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.thinking} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" />
      <Text tone="secondary" style={styles.thinkingText}>
        {t(THINKING[index])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, lineHeight: 22 },
  headerSubtitle: { fontSize: 13.5, lineHeight: 18 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingTop: 48, paddingHorizontal: 12 },
  emptyTitle: { fontSize: 18 },
  emptyBody: { fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  bubble: { alignSelf: 'flex-end', maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 11, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 17, lineHeight: 24 },
  opening: { marginTop: 32 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: { fontSize: 15 },
  notice: { fontSize: 14, lineHeight: 19 },
  error: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16 },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  // The same centred column as the messages, so the composer lines up on iPad.
  composerColumn: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, gap: 10 },
  chipRow: { flexGrow: 0, marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 17, fontFamily: fontFamily.regular, paddingTop: 7, paddingBottom: 7, maxHeight: 120 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
