import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isTimeoutError } from '@/lib/ai/client';
import { isAskStreamingSupported, streamAskChat } from '@/lib/ai/streaming';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import { useToast } from '@/hooks/use-toast';
import { AnimatedSection } from '@/components/ui/animated-section';
import { ToastAction } from '@/components/ui/toast';
import { useCallback, useEffect, useRef } from 'react';
import type { AskOutput } from '@/lib/ai/schemas/ask';

const MAX_AI_INPUT_LENGTH = 50000;

export default function AskPage() {
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
  } = useSessionStore();
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

  const handleSend = async (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
    prosConsMode: boolean,
    argumentMapMode: boolean,
    files?: File[]
  ) => {
    invalidateActiveRequest();
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

      const history = askMessages.map(m => ({ role: m.role, content: m.content }));
      const fullMessage = fileContext ? `CONTEXT:\n${fileContext}\n\nQUESTION: ${message}` : message;
      if (fullMessage.length > MAX_AI_INPUT_LENGTH) {
        toast({
          title: t('ask.inputTooLargeTitle', 'Message is too large'),
          description: t('ask.inputTooLargeDesc', 'Remove some attachment text or shorten your question before sending.'),
          variant: "destructive"
        });
        return;
      }
      if (!isCurrentRequest()) return;

      addAskMessage({ role: 'user', content: displayContent });
      setAskLoading(true);

      const options = {
        citationMode,
        webSearch,
        prosConsMode,
        argumentMapMode,
      };

      let result: AskOutput;
      const askStartTime = Date.now();

      if (isAskStreamingSupported(config, { ...options, mode })) {
        let receivedStreamText = false;
        let partialResponse = '';
        const streamingMessage = {
          id: `stream_${requestId}`,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          isStreaming: true as const,
        };
        const controller = new AbortController();
        streamAbortRef.current = controller;
        setAskStreamingAssistant(streamingMessage);
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
            // A newer request replaced this one. Drop the partial silently.
            return;
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

      if (!isCurrentRequest()) return;
      addAskMessage({
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
    } catch (error) {
      if (!isCurrentRequest()) return;
      setAskStreamingAssistant(null);
      console.error(error);

      if (subError.handleSubscriptionError(error)) {
        // Subscription error handled by modal
      } else if (isTimeoutError(error)) {
        toast({
          title: t('ask.timeout'),
          description: t('ask.timeoutDesc'),
          variant: "destructive"
        });
      } else {
        toast({
          title: t('ask.failed'),
          description: getUserFacingAIError(error) || t('ask.retryableFailedDesc', "Couldn't reach the AI. Check your connection and retry."),
          variant: "destructive",
          action: (
            <ToastAction
              altText={t('common.retry', 'Retry')}
              onClick={() => void handleSend(message, mode, citationMode, webSearch, prosConsMode, argumentMapMode, files)}
            >
              {t('common.retry', 'Retry')}
            </ToastAction>
          ),
        });
      }
    } finally {
      if (isCurrentRequest()) {
        setAskStreamingAssistant(null);
        setAskLoading(false);
      }
    }
  };

  const handleClear = () => {
    invalidateActiveRequest();
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
      const showFailure = () => toast({
          title: t('ask.saveFailed', 'Save failed'),
          description: t('ask.saveFailedDesc', 'The source could not be saved. Please try again.'),
          variant: 'destructive',
        });
      if (saveResult && typeof saveResult.then === 'function') {
        saveResult.then(showSuccess).catch(showFailure);
      } else {
        showSuccess();
      }
  };

  const formattedMessages = askMessages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    output: m.output
  }));
  const visibleMessages = askStreamingAssistant
    ? [...formattedMessages, askStreamingAssistant]
    : formattedMessages;

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <AnimatedSection className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('ask.title')}</h1>
        </AnimatedSection>
        <AnimatedSection delay={75}>
          <AskChat
            messages={visibleMessages}
            isLoading={askLoading}
            onSend={handleSend}
            onClear={handleClear}
            onSaveChat={handleSaveChat}
            savedChats={savedChats.map((chat) => ({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              messageCount: chat.data.length,
            }))}
            onLoadChat={handleLoadChat}
            onSaveSource={handleSaveToLibrary}
          />
        </AnimatedSection>
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
