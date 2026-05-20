import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isTimeoutError } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import { useToast } from '@/hooks/use-toast';
import { ModelSelector } from '@/components/ModelSelector';
import { AnimatedSection } from '@/components/ui/animated-section';
import { ToastAction } from '@/components/ui/toast';

const MAX_AI_INPUT_LENGTH = 50000;

export default function AskPage() {
  const { askMessages, askLoading, addAskMessage, setAskLoading, clearAskMessages, addSource } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();
  const subError = useSubscriptionError();
  const { t } = useTranslation();

  const handleSend = async (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
    prosConsMode: boolean,
    argumentMapMode: boolean,
    files?: File[]
  ) => {
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

      addAskMessage({ role: 'user', content: displayContent });
      setAskLoading(true);

      const result = await askChat(fullMessage, history, mode, config, {
        citationMode,
        webSearch,
        prosConsMode,
        argumentMapMode,
      });

      addAskMessage({
        role: 'assistant',
        content: result.response,
        output: result
      });
    } catch (error) {
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
      setAskLoading(false);
    }
  };

  const handleSaveToLibrary = (title: string, content: string) => {
      const saveResult = addSource({ title, content, type: 'text' });
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

  return (
    <div className="container py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <AnimatedSection className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('ask.title')}</h1>
          <ModelSelector feature="ask" />
        </AnimatedSection>
        <AnimatedSection delay={75}>
          <AskChat
            messages={formattedMessages}
            isLoading={askLoading}
            onSend={handleSend}
            onClear={clearAskMessages}
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
