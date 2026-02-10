import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat, isTimeoutError } from '@/lib/ai/client';
import { useToast } from '@/hooks/use-toast';

export default function AskPage() {
  const { askMessages, askLoading, addAskMessage, setAskLoading, clearAskMessages, addSource } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('ask');
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSend = async (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
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

      const result = await askChat(fullMessage, history, mode, config, { citationMode, webSearch });

      addAskMessage({
        role: 'assistant',
        content: result.response,
        output: result
      });
    } catch (error) {
      console.error(error);

      // Handle timeout errors with a specific message
      if (isTimeoutError(error)) {
        toast({
          title: "Request Timed Out",
          description: "The request took too long. Please try again.",
          variant: "destructive"
        });
      } else {
        toast({ title: "Error", description: "Request failed. Please try again.", variant: "destructive" });
      }
    } finally {
      setAskLoading(false);
    }
  };

  const handleSaveToLibrary = (title: string, content: string) => {
    addSource({ title, content, type: 'text' });
    toast({ title: "Saved", description: "Source added to library." });
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
        <h1 className="text-3xl font-bold mb-8 text-foreground">Ask Your Coach</h1>
        <AskChat
          messages={formattedMessages}
          isLoading={askLoading}
          onSend={handleSend}
          onClear={clearAskMessages}
          onSaveSource={handleSaveToLibrary}
        />
      </div>
    </div>
  );
}
