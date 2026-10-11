import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isAskMessageWithinBudget, isTimeoutError } from '@/lib/ai/client';
import { isAskStreamingSupported, streamAskChat } from '@/lib/ai/streaming';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
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

  useEffect(() => () => {
    abortActiveRequest();
  }, [abortActiveRequest]);

  // A reply still in flight belongs to the scope it was asked in; a new debate
  // or one-off mode starts a fresh conversation, so drop the late answer.
  const askedScopeRef = useRef(chatScope);
  useEffect(() => {
    if (askedScopeRef.current === chatScope) return;
    askedScopeRef.current = chatScope;
    abortActiveRequest();
  }, [abortActiveRequest, chatScope]);

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
        let receivedStreamText = false;
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
              receivedStreamText = true;
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
          if (receivedStreamText) {
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
      const retryAsk = (): void => { void handleSend(message, mode, citationMode, webSearch, prosConsMode, argumentMapMode, files, true); };
      if (subError.handleSubscriptionError(error)) {
        // Subscription error handled by modal
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
  const sendRef = useRef(handleSend);
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
    <div className="container py-8 px-4">
      <WorkspaceToolScope context={workspace.context} />
      <div className="max-w-5xl mx-auto">
        <PageHeader title={t('nav.ask')} />
        <CurrentDebateStrip hidden={Boolean(workspace.context)} />
        <div>
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

      <LimitReachedModal
        open={subError.limitModalOpen}
        onOpenChange={subError.setLimitModalOpen}
        variant={subError.limitModalVariant}
        limit={subError.limitModalLimit}
        current={subError.limitModalCurrent}
        onUpgrade={() => { subError.setLimitModalOpen(false); subError.setPricingModalOpen(true); }}
      />
      <ModelRestrictedModal
        open={subError.modelModalOpen}
        onOpenChange={subError.setModelModalOpen}
        onUpgrade={() => {
          subError.setModelModalOpen(false);
          subError.setPricingModalOpen(true);
        }}
      />
      <PricingModal
        open={subError.pricingModalOpen}
        onOpenChange={subError.setPricingModalOpen}
      />
    </div>
  );
}
