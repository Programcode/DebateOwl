import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isAIModelRestrictionError, isAIProviderError, isAISubscriptionError, isAskMessageWithinBudget, isTimeoutError } from '@/lib/ai/client';
import { isAskStreamingSupported, streamAskChat } from '@/lib/ai/streaming';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { DailyUsage, SubscriptionErrorModals } from '@/components/features/subscription';
import { useToast } from '@/hooks/use-toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AskOutput } from '@/lib/ai/schemas/ask';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { WorkspaceToolScope, useWorkspaceToolScope } from '@/components/features/workspace/WorkspaceToolScope';
import { CurrentDebateStrip } from '@/components/features/debate/CurrentDebateStrip';
import { activeDebateId, useDebateStore } from '@/lib/stores/debate-store';
import { DebateRequiredError } from '@/lib/stores/session-store';
import { PageHeader } from '@/components/layout/PageHeader';
import type { AskChatError } from '@/components/features/ask/AskChat';

const MAX_AI_INPUT_LENGTH = 50000;

export default function AskPage() {
  const workspace = useWorkspaceToolScope('ask');
  const {
    askMessages,
    askLoading,
    askStreamingAssistant,
    addAskMessage,
    setAskLoading,
    setAskStreamingAssistant,
    appendAskStreamingDelta,
    clearAskMessages,
    saveCurrentChat,
    loadSavedChat,
    savedChats,
    addSource,
    askChatId,
    askChatDebateId,
    askPersistedCount,
    syncAskChat,
  } = useSessionStore(useShallow((state) => ({
    askMessages: state.askMessages,
    askLoading: state.askLoading,
    askStreamingAssistant: state.askStreamingAssistant,
    addAskMessage: state.addAskMessage,
    setAskLoading: state.setAskLoading,
    setAskStreamingAssistant: state.setAskStreamingAssistant,
    appendAskStreamingDelta: state.appendAskStreamingDelta,
    clearAskMessages: state.clearAskMessages,
    saveCurrentChat: state.saveCurrentChat,
    loadSavedChat: state.loadSavedChat,
    savedChats: state.savedChats,
    addSource: state.addSource,
    askChatId: state.askChatId,
    askChatDebateId: state.askChatDebateId,
    askPersistedCount: state.askPersistedCount,
    syncAskChat: state.syncAskChat,
  })));
  const [chatError, setChatError] = useState<AskChatError | null>(null);
  const chatScope = useDebateStore((state) => state.oneOff ? null : state.currentDebateId);
  const { user } = useAuth();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();
  const streamAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const abortActiveRequest = useCallback(() => {
    requestIdRef.current += 1;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  const invalidateActiveRequest = () => {
    abortActiveRequest();
    setAskStreamingAssistant(null);
    setAskLoading(false);
  };

  // Leaving the page aborts the request. The in-flight handler then sees a new
  // request id and will not clear the flags, so do it here or Ask comes back
  // stuck on Typing with the composer disabled. A partial answer is kept.
  const leaveCleanupRef = useRef({
    abortActiveRequest,
    addAskMessage,
    setAskLoading,
    setAskStreamingAssistant,
    stoppedNote: t('ask.stopped', 'You stopped this answer before it finished.'),
  });
  leaveCleanupRef.current = {
    abortActiveRequest,
    addAskMessage,
    setAskLoading,
    setAskStreamingAssistant,
    stoppedNote: t('ask.stopped', 'You stopped this answer before it finished.'),
  };
  useEffect(() => () => {
    const cleanup = leaveCleanupRef.current;
    const partial = useSessionStore.getState().askStreamingAssistant;
    cleanup.abortActiveRequest();
    cleanup.setAskLoading(false);
    cleanup.setAskStreamingAssistant(null);
    const kept = partial?.content.trim();
    if (!kept) return;
    cleanup.addAskMessage({
      id: partial?.id,
      role: 'assistant',
      content: kept,
      output: { response: kept, followUpQuestions: [], uncertainties: [cleanup.stoppedNote] },
    });
  }, []);

  // A reply still in flight belongs to the scope it was asked in; a new debate
  // or one-off mode starts a fresh conversation, so drop the late answer.
  // The account is part of the scope: a reply (or its live text) asked by one
  // account never lands in the next one's chat.
  const askScope = `${user?.id ?? ''}:${chatScope ?? ''}`;
  const askedScopeRef = useRef(askScope);
  useEffect(() => {
    if (askedScopeRef.current === askScope) return;
    const accountChanged = askedScopeRef.current.split(':')[0] !== (user?.id ?? '');
    askedScopeRef.current = askScope;
    abortActiveRequest();
    if (accountChanged) {
      // Text that arrived after the account reset belongs to the old account.
      setAskStreamingAssistant(null);
      setAskLoading(false);
    }
  }, [abortActiveRequest, askScope, setAskLoading, setAskStreamingAssistant, user?.id]);

  // Each finished exchange is recorded into the Current Debate automatically,
  // including conversations started from another tool's Discuss button.
  const lastRole = askMessages[askMessages.length - 1]?.role;
  useEffect(() => {
    if (workspace.context || askLoading || lastRole !== 'assistant' || askPersistedCount >= askMessages.length) return;
    // A loaded chat keeps recording where it lives; a new one needs a Current Debate.
    const debateId = activeDebateId();
    if (!askChatId && !debateId) return;
    syncAskChat(debateId).catch((error) => {
      console.error('Failed to record chat in debate:', error);
      toast({ title: t('debate.recordFailed', 'Could not save this result to the debate'), variant: 'destructive' });
    });
  }, [askChatId, askLoading, askMessages.length, askPersistedCount, lastRole, syncAskChat, t, toast, workspace.context]);

  // The latest handleSend, for Retry and Discuss, which outlive the render that made them.
  const sendRef = useRef<(...args: Parameters<typeof handleSend>) => ReturnType<typeof handleSend>>(async () => false);

  /**
   * Sends a question. Returns false when the message is rejected before sending, so the
   * composer keeps the text. A retry re-asks the last question without adding it again.
   */
  const handleSend = async (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
    prosConsMode: boolean,
    argumentMapMode: boolean,
    files?: File[],
    retry = false,
  ): Promise<boolean> => {
    invalidateActiveRequest();
    setChatError(null);
    const requestId = requestIdRef.current;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    let displayContent = message;
    if (files && files.length > 0) {
      displayContent += `\n\n[Attachments: ${files.map(f => f.name).join(', ')}]`;
    }

    try {
      let fileContext = "";
      if (files && files.length > 0) {
        const textExtensions = new Set([
          'txt', 'md', 'markdown', 'csv', 'json', 'yaml', 'yml', 'xml',
          'html', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
          'c', 'cpp', 'h', 'hpp'
        ]);
        const isTextFile = (file: File) => {
          if (file.type?.startsWith('text/')) return true;
          if (file.type === 'application/json') return true;
          const ext = file.name.split('.').pop()?.toLowerCase();
          return ext ? textExtensions.has(ext) : false;
        };

        const contents = await Promise.all(files.map(file => {
          if (!isTextFile(file)) {
            const typeLabel = file.type || 'unknown';
            return Promise.resolve(`FILE: ${file.name} - binary skipped (type: ${typeLabel})\n`);
          }
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const text = typeof e.target?.result === 'string' ? e.target.result : '';
              resolve(`FILE: ${file.name}\nCONTENT:\n${text}\n\n`);
            };
            reader.onerror = () => resolve(`[Error reading ${file.name}]\n`);
            reader.readAsText(file);
          });
        }));
        fileContext = contents.join('\n');
      }

      // A retry's question is already in the chat; it is the message, not part of the history.
      const priorMessages = retry && askMessages[askMessages.length - 1]?.role === 'user' ? askMessages.slice(0, -1) : askMessages;
      const history = workspace.context ? [] : priorMessages.map(m => ({ role: m.role, content: m.content }));
      const fullMessage = fileContext ? `CONTEXT:\n${fileContext}\n\nQUESTION: ${message}` : message;
      if (fullMessage.length > MAX_AI_INPUT_LENGTH || !isAskMessageWithinBudget(fullMessage)) {
        setChatError({
          title: t('ask.inputTooLargeTitle', 'Message is too large'),
          description: t('ask.inputTooLargeDesc', 'Remove some attachment text or shorten your question before sending.'),
        });
        return false;
      }
      if (!isCurrentRequest()) return false;

      if (!retry) addAskMessage({ role: 'user', content: displayContent });
      setAskLoading(true);

      const options = {
        citationMode,
        webSearch,
        prosConsMode,
        argumentMapMode,
        workspaceContext: workspace.context ?? undefined,
        // A loaded chat stays grounded in its own debate's sources.
        debateId: askChatId ? askChatDebateId : activeDebateId(),
      };

      let result: AskOutput;
      let streamedId: string | null = null;
      const askStartTime = Date.now();

      if (!workspace.context && isAskStreamingSupported(config, { ...options, mode })) {
        let partialResponse = '';
        const streamingMessage = {
          // The stored reply reuses this id, so the bubble the user is reading never remounts.
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          isStreaming: true as const,
        };
        const controller = new AbortController();
        streamAbortRef.current = controller;
        setAskStreamingAssistant(streamingMessage);
        streamedId = streamingMessage.id;
        let pendingText = '';
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        try {
          result = await streamAskChat(fullMessage, history, mode, config, options, {
            onDelta: (text) => {
              if (!isCurrentRequest()) return;
              partialResponse += text;
              pendingText += text;
              if (!flushTimer) {
                flushTimer = setTimeout(() => {
                  const batch = pendingText;
                  pendingText = '';
                  flushTimer = null;
                  if (isCurrentRequest() && streamAbortRef.current === controller) {
                    appendAskStreamingDelta(batch);
                  }
                }, 30);
              }
            },
            signal: controller.signal,
          });
        } catch (streamError) {
          const ownsStream = isCurrentRequest() && streamAbortRef.current === controller;
          if (ownsStream) setAskStreamingAssistant(null);
          const aborted = streamError instanceof DOMException && streamError.name === 'AbortError';
          if (aborted || !isCurrentRequest()) {
            // A newer request or Stop replaced this one; Stop keeps the partial itself.
            return true;
          }
          // Whitespace alone is not an answer: a model that spent its cap on
          // reasoning may send a newline first. Ask the structured endpoint then.
          if (partialResponse.trim()) {
            toast({
              title: t('ask.streamInterrupted', 'Response was interrupted'),
              description: t('ask.streamInterruptedDesc', 'You can ask again to get a complete answer.'),
              variant: 'destructive',
            });
            result = {
              response: partialResponse.trim(),
              followUpQuestions: [],
              uncertainties: [t('ask.streamInterrupted', 'The streamed response was interrupted before completion.')],
            };
          } else if (
            (isAIProviderError(streamError) && streamError.details?.code === 'provider_unavailable') ||
            isAISubscriptionError(streamError) || isAIModelRestrictionError(streamError)
          ) {
            // The model's provider is down or the account may not send this,
            // not the stream: asking again through the plain endpoint would
            // only fail the same way.
            throw streamError;
          } else {
            result = await askChat(fullMessage, history, mode, config, options);
          }
        } finally {
          const ownsStream = isCurrentRequest() && streamAbortRef.current === controller;
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          if (ownsStream && pendingText) {
            appendAskStreamingDelta(pendingText);
          }
          pendingText = '';
          if (ownsStream) {
            streamAbortRef.current = null;
          }
        }
      } else if (!workspace.context) {
        // Structured modes (citations, web search, pros/cons, argument map)
        // answer in JSON; its response field fills the bubble as it is written.
        const liveMessage = {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          isStreaming: true as const,
        };
        const controller = new AbortController();
        streamAbortRef.current = controller;
        setAskStreamingAssistant(liveMessage);
        streamedId = liveMessage.id;
        try {
          result = await askChat(fullMessage, history, mode, config, {
            ...options,
            signal: controller.signal,
            live: {
              onDraft: (draft) => {
                if (!isCurrentRequest() || streamAbortRef.current !== controller) return;
                setAskStreamingAssistant({ ...liveMessage, content: typeof draft.response === 'string' ? draft.response : '' });
              },
            },
          });
        } finally {
          if (streamAbortRef.current === controller) streamAbortRef.current = null;
        }
      } else {
        result = await askChat(fullMessage, history, mode, config, options);
      }

      if (!isCurrentRequest()) return true;
      addAskMessage({
        id: streamedId ?? undefined,
        role: 'assistant',
        content: result.response,
        output: {
          ...result,
          model: result.model || config.model,
          provider: result.provider || (config.provider === 'mock' ? 'mock' : 'openrouter'),
          durationMs: result.durationMs || Date.now() - askStartTime,
          generatedAt: result.generatedAt || new Date().toISOString(),
        }
      });
      await workspace.attach({ fullMessage, history, mode }, result);
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return true;
      setAskStreamingAssistant(null);
      console.error(error);

      // Failures stay in the chat with a Retry that re-asks without duplicating the question.
      // Retry runs the latest handler, so a model picked after the failure is used.
      const retryAsk = (): void => { void sendRef.current(message, mode, citationMode, webSearch, prosConsMode, argumentMapMode, files, true); };
      if (subError.handleSubscriptionError(error)) {
        // The dialog explains the limit; the question stays in the chat, marked
        // as not sent, with a Retry for once there is room again.
        setChatError({
          title: isAISubscriptionError(error) && error.code === 'limit_reached' ? t('ask.notSentDailyLimit') : t('ask.notSent'),
          description: isAIModelRestrictionError(error) ? t('ask.notSentModelDesc') : getUserFacingAIError(error),
          onRetry: retryAsk,
        });
      } else if (isTimeoutError(error)) {
        setChatError({ title: t('ask.timeout'), description: t('ask.timeoutDesc'), onRetry: retryAsk });
      } else {
        setChatError({
          title: t('ask.failed'),
          description: getUserFacingAIError(error) || t('ask.retryableFailedDesc', "Couldn't reach the AI. Check your connection and retry."),
          onRetry: retryAsk,
        });
      }
      return true;
    } finally {
      if (isCurrentRequest()) {
        setAskStreamingAssistant(null);
        setAskLoading(false);
      }
    }
  };

  // Stop keeps whatever has streamed so far as the reply, marked as stopped.
  const handleStop = () => {
    const partial = useSessionStore.getState().askStreamingAssistant;
    invalidateActiveRequest();
    if (partial?.content.trim()) {
      addAskMessage({
        id: partial.id,
        role: 'assistant',
        content: partial.content.trim(),
        output: { response: partial.content.trim(), followUpQuestions: [], uncertainties: [t('ask.stopped', 'You stopped this answer before it finished.')] },
      });
    }
  };

  // "Discuss" on a tool result opens Ask with its prompt, sent here like a typed question.
  const location = useLocation();
  const discussPrompt = (location.state as { discussPrompt?: string } | null)?.discussPrompt;
  sendRef.current = handleSend;
  const discussedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!discussPrompt || discussedKey.current === location.key) return;
    discussedKey.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    void sendRef.current(discussPrompt, 'general', false, false, false, false);
  }, [discussPrompt, location.key, location.pathname, navigate]);

  const handleClear = () => {
    invalidateActiveRequest();
    setChatError(null);
    clearAskMessages();
  };

  const handleLoadChat = (id: string) => {
    invalidateActiveRequest();
    loadSavedChat(id);
  };

  const handleSaveChat = async () => {
    const title = askMessages[0]?.content?.slice(0, 60) || 'Chat';
    try {
      await saveCurrentChat(title);
      toast({ title: t('ask.chatSaved', 'Chat saved'), description: t('ask.chatSavedDesc', 'You can load it from History.') });
    } catch (error) {
      console.error('Failed to save chat:', error);
      toast({
        title: t('ask.saveFailed', 'Save failed'),
        description: t('ask.saveFailedDesc', 'The chat could not be saved. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleSaveToLibrary = (title: string, content: string) => {
      const saveResult = addSource({ title, content, type: 'text', folder: 'Ask' });
      const showSuccess = () => toast({ title: t('ask.saved'), description: t('ask.savedDesc') });
      const showFailure = (error?: unknown) => toast({
          title: t('ask.saveFailed', 'Save failed'),
          description: error instanceof DebateRequiredError
            ? t('debate.sourceNeedsDebate', 'Start or select a debate before saving sources.')
            : t('ask.sourceSaveFailedDesc', 'The source could not be saved. Please try again.'),
          variant: 'destructive',
        });
      if (saveResult && typeof saveResult.then === 'function') {
        saveResult.then(showSuccess).catch(showFailure);
      } else {
        showSuccess();
      }
  };


  return (
    <div className="container px-4 py-8 max-md:flex max-md:h-[calc(100dvh-var(--app-header-bottom,7.25rem)-var(--phone-tab-reserve,4.5rem))] max-md:flex-col max-md:overflow-hidden max-md:py-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="mx-auto w-full max-w-5xl max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col">
        <PageHeader title={t('nav.ask')} meta={<DailyUsage />} />
        <CurrentDebateStrip hidden={Boolean(workspace.context)} />
        <div className="max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col">
          <AskChat
            messages={askMessages}
            streamingMessage={askStreamingAssistant}
            isLoading={askLoading}
            error={chatError}
            onDismissError={() => setChatError(null)}
            onStop={handleStop}
            onSend={handleSend}
            onClear={handleClear}
            onSaveChat={askChatId ? undefined : handleSaveChat}
            savedChats={savedChats.filter((chat) => (chat.debateId ?? null) === chatScope).map((chat) => ({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              messageCount: chat.data.length,
            }))}
            onLoadChat={handleLoadChat}
            onSaveSource={handleSaveToLibrary}
            contextControl={(
              <DebateContextControl
                feature="ask"
                side="both"
                debateId={askChatId ? askChatDebateId : undefined}
                hidden={Boolean(workspace.context)}
              />
            )}
          />
        </div>
      </div>

      <SubscriptionErrorModals subError={subError} />
    </div>
  );
}
