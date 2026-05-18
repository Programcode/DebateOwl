import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isTimeoutError } from '@/lib/ai/client';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import { useToast } from '@/hooks/use-toast';
import { ModelSelector } from '@/components/ModelSelector';

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
    files?: File[]
  ) => {
    let displayContent = message;
    if (files && files.length > 0) {
      displayContent += `\n\n[Attachments: ${files.map(f => f.name).join(', ')}]`;
    }

    addAskMessage({ role: 'user', content: displayContent });
    setAskLoading(true);

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

      const result = await askChat(fullMessage, history, mode, config, { citationMode });

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
        toast({ title: t('ask.failed'), description: t('ask.failedDesc'), variant: "destructive" });
      }
    } finally {
      setAskLoading(false);
    }
  };

  const handleSaveToLibrary = (title: string, content: string) => {
    addSource({ title, content, type: 'text' });
    toast({ title: t('ask.saved'), description: t('ask.savedDesc') });
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('ask.title')}</h1>
          <ModelSelector feature="ask" />
        </div>
        <AskChat
          messages={formattedMessages}
          isLoading={askLoading}
          onSend={handleSend}
          onClear={clearAskMessages}
          onSaveSource={handleSaveToLibrary}
        />
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
