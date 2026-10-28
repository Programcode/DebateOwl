import { askDisplayContent, askMessageWithFiles } from '@debatelab/core/ai/ask-files';
import type { AskOutput } from '@debatelab/core/ai/schemas/ask';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskAnswer } from '@/components/ask-answer';
import { AskChatPane } from '@/components/ask-chat-list';
import { AskHistory } from '@/components/ask-history';
import { TextButton } from '@/components/buttons';
import { Chip } from '@/components/chip';
import { ModelChips } from '@/components/model-picker';
import { FadingScrollRow } from '@/components/edge-fade';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-paths';
import { OneOffNotice } from '@/components/one-off-notice';
import { DailyUsageLine } from '@/components/tool-form';
import { Text } from '@/components/text';
import { AIError, isAbortError, type AIErrorKind, type ResponseExtras } from '@/lib/ai-request';
import { askOnce, canStream, isFinalAskError, isMessageWithinBudget, streamAsk, type AskMode, type AskOptions } from '@/lib/ask';
import { pickAskFiles, readAskFiles, type AskAttachment } from '@/lib/ask-attachments';
import { buildDebateContext } from '@/lib/context-request';
import type { FeatureConfig } from '@/lib/feature-config';
import { useAuth } from '@/lib/auth';
import { ChatSaveError, fetchChat, saveChat, type ChatMessage, type ChatRecord } from '@/lib/chats';
import { useDebates } from '@/lib/debate-context';
import { LIST_WIDTH, useLayoutClass } from '@/lib/layout';
import { openRefusal } from '@/lib/refusal';
import { keepSourceAssessments } from '@/lib/results';
import { useSettings } from '@/lib/settings';
import { addSource, fetchSources, type Source } from '@/lib/sources';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';
import { Owl, OwlAvatar } from '@/components/owl';

const NO_OPTIONS: AskOptions = { citationMode: false, webSearch: false, prosConsMode: false, argumentMapMode: false };
const NEW_CHAT: ChatRecord = { chatId: null, debateId: null, persisted: 0 };

// The web's toggles as one row of chips above the composer (mock 07).
const OPTION_CHIPS: { key: keyof AskOptions; label: string; icon: IconName }[] = [
  { key: 'citationMode', label: 'askChat.citations', icon: 'quote' },
  { key: 'webSearch', label: 'askChat.webSearch', icon: 'globe' },
  { key: 'prosConsMode', label: 'askChat.modeProsCons', icon: 'list' },
  { key: 'argumentMapMode', label: 'askChat.modeArgMap', icon: 'map' },
];

// The website's mode switch (askChat.modeOptions), shown first in the chip row.
const MODES: { key: AskMode; label: string }[] = [
  { key: 'general', label: 'askChat.modeGeneral' },
  { key: 'clarify', label: 'askChat.modeClarify' },
];

// The website's one progress line while the coach answers.
const THINKING = ['askChat.working'];

const PLAN_ERRORS = new Set<AIErrorKind>(['trialExpired', 'limitReached', 'modelRestricted']);
const RETRYABLE_ERRORS = new Set<AIErrorKind>(['network', 'timeout', 'failed', 'rateLimit']);

let localId = 0;
const nextId = () => `local-${Date.now()}-${(localId += 1)}`;

/**
 * Ask, as in mock 07: a coaching chat that streams, grounded in the Current Debate.
 * On iPad the debate's conversations stay listed beside the chat (iPad mock A).
 */
export default function AskScreen() {
  const { t } = useTranslation();
  const split = useLayoutClass() !== 'phone';
  const router = useRouter();
  const { prompt, chat: resumeChatId } = useLocalSearchParams<{ prompt?: string; chat?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { current, oneOff, activeDebateId, refresh } = useDebates();
  const { outputLanguage, readFeatureConfig } = useSettings();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [record, setRecordState] = useState<ChatRecord>(NEW_CHAT);
  const [options, setOptions] = useState<AskOptions>(NO_OPTIONS);
  const [mode, setMode] = useState<AskMode>('general');
  const [attachments, setAttachments] = useState<AskAttachment[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<{ kind: AIErrorKind; question: string; files?: AskAttachment[] } | null>(null);
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [library, setLibrary] = useState<Source[]>([]);

  const scroll = useRef<ScrollView>(null);
  // The answer's text so far, kept by Stop as the website keeps it.
  const partial = useRef('');
  const requests = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const config = useRef<Promise<FeatureConfig> | null>(null);
  // The conversation the saved record belongs to; replacing it drops late writes.
  const conversation = useRef(0);
  // The opened chat's saved copy counts until another conversation starts.
  const chatCopies = useCopyHolder();
  const recordRef = useRef(record);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const activeDebateRef = useRef(activeDebateId);
  activeDebateRef.current = activeDebateId;

  const setRecord = (next: ChatRecord) => {
    recordRef.current = next;
    setRecordState(next);
  };

  const askConfig = () => {
    if (!config.current && userId) config.current = readFeatureConfig(userId, 'ask');
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
    chatCopies.release();
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
  const libraryCopies = useCopyHolder();
  useEffect(() => {
    // The previous debate's sources never stand in for this one's while they load.
    setLibrary([]);
    if (!chatDebateId || !userId) {
      libraryCopies.release();
      return;
    }
    let active = true;
    fetchSources(userId, chatDebateId, libraryCopies.mark())
      .then((next) => {
        if (active) setLibrary(next);
      })
      .catch((cause: unknown) => console.warn('Could not load sources for citations:', cause instanceof Error ? cause.message : cause));
    return () => {
      active = false;
    };
  }, [userId, chatDebateId, libraryCopies]);

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

  const send = async (text: string, history: ChatMessage[], files: AskAttachment[] = []) => {
    const question = text.trim();
    if (!question || !userId) return;
    abortActive();
    const request = requests.current;
    const isCurrent = () => requests.current === request;
    // Attached files are read here and sent with the question; the chat keeps only their names.
    const message = files.length > 0 ? askMessageWithFiles(question, await readAskFiles(files)) : question;
    if (!isCurrent()) return;
    if (!isMessageWithinBudget(message)) {
      setError({ kind: 'tooLarge', question, files });
      return;
    }
    const requestOptions = options;
    const requestMode = mode;
    const controller = new AbortController();
    abort.current = controller;
    partial.current = '';
    setMessages([...history, { id: nextId(), role: 'user', content: askDisplayContent(question, files.map((file) => file.name)), timestamp: Date.now() }]);
    setInput('');
    setAttachments([]);
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
        mode: requestMode,
        history: history.map((item) => ({ role: item.role, content: item.content })),
        options: requestOptions,
        config: askSettings,
        language: outputLanguage,
        debateContext,
      };

      let result: AskOutput;
      const whole: { extras?: ResponseExtras } = {};
      const keepExtras = (extras: ResponseExtras) => {
        whole.extras = extras;
      };
      // Whole answers stream live from the ai function, as on the website; Stop keeps what arrived.
      const showText = (text: string) => {
        if (!isCurrent()) return;
        partial.current = text;
        setStreaming(text);
      };
      if (canStream(requestOptions, requestMode)) {
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
              partial.current = received;
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
          // Whitespace alone is not an answer (main #187): a model that spent its cap on
          // reasoning may send a newline first. Ask the structured endpoint then.
          if (received.trim()) {
            setNotice(`${t('ask.streamInterrupted')} ${t('ask.streamInterruptedDesc')}`);
            result = { response: received.trim(), followUpQuestions: [], uncertainties: [t('ask.streamInterrupted')] };
          } else if (isFinalAskError(streamError)) {
            throw streamError;
          } else {
            // Nothing usable arrived: ask once more without streaming, as the website does.
            setStreaming(null);
            result = await askOnce(askRequest, controller.signal, keepExtras, showText);
          }
        } finally {
          if (flush) clearTimeout(flush);
        }
      } else {
        setStreaming('');
        result = await askOnce(askRequest, controller.signal, keepExtras, showText);
      }

      if (!isCurrent()) return;
      // A whole answer ranks the Library sources it used and says when the question was shortened, as on the website.
      if (whole.extras) {
        const { truncated, assessments } = whole.extras;
        const assessed = await keepSourceAssessments(userId, debateId, assessments, controller.signal);
        if (!isCurrent()) return;
        const notices = [
          ...(assessed ? [] : [`${t('aiClient.sourceSaveFailed')}. ${t('aiClient.sourceAssessmentSaveFailed')}`]),
          ...(truncated ? [`${t('aiClient.inputShortened')}. ${t('aiClient.inputShortenedDesc')}`] : []),
        ];
        if (notices.length > 0) setNotice(notices.join(' '));
      }
      const output = {
        ...result,
        model: result.model || askSettings.model,
        provider: result.provider || 'openrouter',
        durationMs: result.durationMs || Date.now() - started,
        generatedAt: result.generatedAt || new Date().toISOString(),
      };
      setStreaming(null);
      partial.current = '';
      setMessages((previous) => [...previous, { id: nextId(), role: 'assistant', content: result.response, timestamp: Date.now(), output }]);
    } catch (cause) {
      if (!isCurrent() || isAbortError(cause)) return;
      setStreaming(null);
      const kind = cause instanceof AIError ? cause.kind : 'failed';
      if (!(cause instanceof AIError)) console.warn('Ask failed:', cause instanceof Error ? cause.message : cause);
      // A missing debate was deleted elsewhere; reload the list so the app stops using it.
      if (kind === 'debateMissing') void refresh();
      setError({ kind, question, files });
      // The question stays as not sent, and the website's dialog opens too.
      openRefusal(router, cause, 'ask');
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setStreaming(null);
        abort.current = null;
      }
    }
  };

  // Discuss on a case or an attack opens Ask with the website's message and sends it once.
  const prompted = useRef(false);
  useEffect(() => {
    if (prompted.current || !prompt?.trim() || !userId) return;
    prompted.current = true;
    void send(prompt, []);
    // send reads refs and state setters; it runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, userId]);

  // Retrying replaces the unanswered question instead of asking it twice.
  const retry = (question: string, files?: AskAttachment[]) => {
    const last = messages[messages.length - 1];
    void send(question, last?.role === 'user' ? messages.slice(0, -1) : messages, files);
  };

  /** The website's Stop: the answer so far stays, marked as stopped, and is saved like any answer. */
  const stop = () => {
    const kept = partial.current.trim();
    abortActive();
    setLoading(false);
    setStreaming(null);
    if (!kept) return;
    setMessages((previous) => [
      ...previous,
      { id: nextId(), role: 'assistant', content: kept, timestamp: Date.now(), output: { response: kept, followUpQuestions: [], uncertainties: [t('ask.stopped')] } },
    ]);
  };

  /** The website's Save to Library: the answer becomes a text source in the Current Debate's Ask folder. */
  const saveAnswer = async (content: string): Promise<boolean> => {
    const debateId = activeDebateRef.current;
    if (!userId) return false;
    if (!debateId) {
      setNotice(`${t('ask.saveFailed')}. ${t('debate.sourceNeedsDebate')}`);
      return false;
    }
    try {
      await addSource(userId, { title: content.length > 30 ? `${content.slice(0, 30)}...` : content, content, type: 'text', folder: 'Ask', debateId });
      setNotice(`${t('ask.saved')}. ${t('ask.savedDesc')}`);
      return true;
    } catch (cause) {
      console.warn('Could not save the answer to the Library:', cause instanceof Error ? cause.message : cause);
      setNotice(`${t('ask.saveFailed')}. ${t('ask.sourceSaveFailedDesc')}`);
      return false;
    }
  };

  const attach = async () => {
    try {
      const picked = await pickAskFiles(attachments);
      if (!picked) return;
      setAttachments(picked.files);
      if (picked.problem?.kind === 'tooMany') setNotice(`${t('askChat.tooManyFiles')}. ${t('askChat.tooManyFilesDesc', { max: 5 })}`);
      else if (picked.problem) setNotice(`${t('askChat.fileValidationFailed')}. ${t(picked.problem.kind === 'tooLarge' ? 'mobile.ask.fileTooLarge' : 'mobile.ask.fileType', { name: picked.problem.name })}`);
    } catch (cause) {
      console.warn('Could not pick files:', cause instanceof Error ? cause.message : cause);
    }
  };

  const openChat = async (chatId: string) => {
    if (!userId) return;
    setHistoryOpen(false);
    startConversation([], NEW_CHAT);
    const owner = conversation.current;
    setOpening(true);
    try {
      const chat = await fetchChat(userId, chatId, chatCopies.mark());
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

  // A chat picked in History opens here, as the website's Resume loads it into Ask. Once per opening.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !resumeChatId || !userId) return;
    resumed.current = true;
    void openChat(resumeChatId);
    // openChat reads refs and state setters; it runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeChatId, userId]);

  const subtitle = oneOff ? t('debate.oneOffActive') : current?.motion ?? '';
  const busy = loading || opening;
  // Beside the list, the chat is titled by its first question, as its saved row is.
  const question = messages.find((message) => message.role === 'user')?.content;
  const title = split ? question ?? t('askChat.newChat') : t('nav.ask');

  const chips = (
    <>
      {MODES.map((item) => (
        <Chip
          key={item.key}
          label={t(item.label)}
          selected={mode === item.key}
          accessibilityRole="radio"
          onPress={() => setMode(item.key)}
          testID={`ask-mode-${item.key}`}
        />
      ))}
      <View style={[styles.chipDivider, { backgroundColor: colors.line }]} />
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
      {/* The next question reads the model again, after this change is saved. */}
      <ModelChips feature="ask" onChange={() => (config.current = null)} />
    </>
  );

  const chat = (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.line }]}>
        {split ? (
          <View style={styles.headerButton} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} onPress={() => router.back()} style={styles.headerButton}>
            <Icon name="chevronLeft" color={colors.primary} size={28} />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text accessibilityRole="header" weight="display" style={styles.headerTitle} numberOfLines={split ? 1 : undefined}>
            {title}
          </Text>
          {subtitle ? (
            <Text tone="faint" style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {split ? (
          <View style={styles.headerButton} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('askChat.openSavedChats')}
            hitSlop={8}
            onPress={() => setHistoryOpen(true)}
            style={styles.headerButton}
            testID="ask-history-button">
            <Icon name="history" color={colors.primary} size={26} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroll}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // A streamed answer grows every 30 ms; restarting an animated scroll each time stutters.
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: streaming === null })}>
        <OneOffNotice />
        {messages.length === 0 && streaming === null && !busy ? (
          <View style={styles.empty}>
            <Owl pose="point" size={112} />
            <Text weight="display" style={styles.emptyTitle}>
              {t('askChat.startConversation')}
            </Text>
            <Text tone="secondary" style={styles.emptyBody}>
              {t('askChat.startDesc')}
            </Text>
            <DailyUsageLine />
          </View>
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <View key={message.id} style={[styles.bubble, { backgroundColor: colors.primaryFill }]}>
              <Text style={[styles.bubbleText, { color: colors.onPrimary }]} selectable>
                {message.content}
              </Text>
            </View>
          ) : (
            <AskAnswer key={message.id} content={message.content} output={message.output} library={library} onSave={() => saveAnswer(message.content)} />
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
              {RETRYABLE_ERRORS.has(error.kind) ? <TextButton label={t('common.retry')} onPress={() => retry(error.question, error.files)} /> : null}
              {PLAN_ERRORS.has(error.kind) ? <TextButton label={t('mobile.ask.openYou')} onPress={() => router.navigate('/you')} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.line, backgroundColor: colors.tabBar }]}>
        <View style={styles.composerColumn}>
          {split ? (
            // iPad: every option shows, wrapping onto a second line when the column is narrow.
            <View style={styles.chipsWrap}>
            {chips}
            </View>
          ) : (
            // iPhone: one sideways row, faded at the edge to show it scrolls.
            <FadingScrollRow color={colors.background} id="ask-chips-fade" style={styles.chipRow} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {chips}
            </FadingScrollRow>
          )}
          {attachments.length > 0 ? (
            <View style={styles.attachments} testID="ask-attachments">
              {attachments.map((file, index) => (
                <Chip
                  key={`${file.name}-${index}`}
                  label={file.name}
                  icon="file"
                  accessibilityLabel={t('askChat.removeFile', { name: file.name })}
                  trailing={<Icon name="x" color={colors.secondary} size={14} />}
                  onPress={() => setAttachments((previous) => previous.filter((_, at) => at !== index))}
                />
              ))}
            </View>
          ) : null}
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('askChat.attachFiles')}
              disabled={busy}
              hitSlop={6}
              onPress={() => void attach()}
              style={[styles.attach, busy && styles.sendDisabled]}
              testID="ask-attach">
              <Icon name="paperclip" color={colors.secondary} size={20} />
            </Pressable>
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
            {loading ? (
              // The website's Stop: the answer so far stays in the chat.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('askChat.stop')}
                onPress={stop}
                style={[styles.send, styles.stop, { borderColor: colors.primaryFill }]}
                testID="ask-stop">
                <Icon name="stop" color={colors.primaryFill} size={16} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('askChat.send')}
                accessibilityState={{ disabled: busy || !input.trim() }}
                disabled={busy || !input.trim()}
                onPress={() => void send(input, messages, attachments)}
                style={[styles.send, { backgroundColor: colors.primaryFill }, (busy || !input.trim()) && styles.sendDisabled]}
                testID="ask-send">
                {busy ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Icon name="arrowUp" color={colors.onPrimary} size={19} />}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </>
  );

  const newChat = () => {
    setHistoryOpen(false);
    startConversation([], NEW_CHAT);
  };

  if (split) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.card }]}>
        <View style={styles.split}>
          <AskChatPane
            debateId={scope}
            openChatId={record.chatId}
            reloadKey={`${record.chatId ?? ''}:${record.persisted}`}
            width={LIST_WIDTH.ask}
            onBack={() => router.back()}
            onPick={(chatId) => void openChat(chatId)}
            onNewChat={newChat}
          />
          <View style={styles.chatPane}>{chat}</View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.card }]}>
      {chat}
      <AskHistory
        visible={historyOpen}
        debateId={scope}
        openChatId={record.chatId}
        onClose={() => setHistoryOpen(false)}
        onPick={(chatId) => void openChat(chatId)}
        onNewChat={newChat}
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
      <OwlAvatar pose="coach" size={32} />
      <Text tone="secondary" style={styles.thinkingText}>
        {t(THINKING[index])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  chatPane: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, lineHeight: 22 },
  headerSubtitle: { fontSize: 13.5, lineHeight: 18 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingTop: 24, paddingHorizontal: 12 },
  emptyTitle: { fontSize: 20 },
  emptyBody: { fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  bubble: { alignSelf: 'flex-end', maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 11, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 17, lineHeight: 24 },
  opening: { marginTop: 32 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: { fontSize: 15 },
  notice: { fontSize: 14, lineHeight: 19 },
  error: { borderWidth: 2, borderRadius: radius.card, padding: 14, gap: 4 },
  errorTitle: { fontSize: 16 },
  errorBody: { fontSize: 15, lineHeight: 21 },
  errorActions: { flexDirection: 'row', gap: 20 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  // The same centred column as the messages, so the composer lines up on iPad.
  composerColumn: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, gap: 10 },
  chipRow: { marginHorizontal: -16 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { gap: 8, paddingHorizontal: 16 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 17, fontFamily: fontFamily.regular, paddingTop: 7, paddingBottom: 7, maxHeight: 120 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stop: { borderWidth: 2 },
  attach: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8, marginRight: 2 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipDivider: { width: 1.5, height: 24, alignSelf: 'center', marginHorizontal: 2 },
  sendDisabled: { opacity: 0.45 },
});
