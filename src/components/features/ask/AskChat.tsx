import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Send, RotateCcw, Quote, Map, List, HelpCircle, Paperclip, X, Bookmark, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { AskOutput } from '@/lib/ai/schemas/ask';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { useToast } from '@/hooks/use-toast';
import { validateFileUpload, MAX_FILE_COUNT, formatFileSize } from '@/lib/validation/file';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

interface AskChatProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (message: string, mode: string, citationMode: boolean, files?: File[]) => void;
  onClear: () => void;
  onSaveSource?: (title: string, content: string) => void;
}

const modeOptions = [
  { id: 'general', labelKey: 'askChat.modeGeneral', icon: MessageCircle },
  { id: 'clarify', labelKey: 'askChat.modeClarify', icon: HelpCircle },
  { id: 'proscons', labelKey: 'askChat.modeProsCons', icon: List },
  { id: 'argumentmap', labelKey: 'askChat.modeArgMap', icon: Map },
];

const LOADING_MESSAGES_KEYS = [
  'askChat.thinking',
  'askChat.researching',
  'askChat.analyzing',
  'askChat.generatingResponse',
  'askChat.almostThere',
];

const MessageBubble = React.memo(function MessageBubble({ message, onSave }: { message: Message, onSave?: (title: string, content: string) => void }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const output = message.output;

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 space-y-3 relative group',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card border border-border rounded-bl-sm'
        )}
      >
        {!isUser && onSave && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
            onClick={() => {
              const title = message.content.length > 30
                ? `${message.content.slice(0, 30)}...`
                : message.content;
              onSave(title, message.content);
            }}
            title={t('askChat.saveToLibrary')}
            aria-label={t('askChat.saveMessage')}
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Follow-up questions */}
        {output?.followUpQuestions && output.followUpQuestions.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.followUp')}</span>
            <ul className="space-y-1">
              {output.followUpQuestions.map((q: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Pros/Cons */}
        {output?.prosConsAnalysis && (
          <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-border/50">
            <div>
              <span className="text-xs font-medium text-primary">{t('askChat.pros')}</span>
              <ul className="mt-1 space-y-0.5">
                {output.prosConsAnalysis.pros.map((pro: string, i: number) => (
                  <li key={i} className="text-xs">✓ {pro}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-xs font-medium text-destructive">{t('askChat.cons')}</span>
              <ul className="mt-1 space-y-0.5">
                {output.prosConsAnalysis.cons.map((con: string, i: number) => (
                  <li key={i} className="text-xs">✗ {con}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <span className="text-[10px] text-muted-foreground">
          {(() => {
            try {
              if (!message.timestamp) return '';
              return new Date(message.timestamp).toLocaleTimeString();
            } catch (e) {
              return '';
            }
          })()}
        </span>
      </div>
    </div>
  );
});

export function AskChat({ messages, isLoading, onSend, onClear, onSaveSource }: AskChatProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('general');
  const [citationMode, setCitationMode] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useSpeechToText();

  // Cycle through loading messages
  useEffect(() => {
    if (!isLoading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % LOADING_MESSAGES_KEYS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && files.length === 0) || isLoading) return;
    onSend(input.trim(), mode, citationMode, files);
    setInput('');
    setFiles([]);
    resetTranscript();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const allFiles = [...files, ...newFiles];

      // Validate total file count
      if (allFiles.length > MAX_FILE_COUNT) {
        toast({
          title: t('askChat.tooManyFiles'),
          description: t('askChat.tooManyFilesDesc', { max: MAX_FILE_COUNT }),
          variant: 'destructive',
        });
        return;
      }

      // Validate each file
      const result = validateFileUpload(allFiles);
      if (!result.valid) {
        toast({
          title: t('askChat.fileValidationFailed'),
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setFiles(allFiles);
    }
    // Reset input so same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  return (
    <Card className="flex flex-col h-[700px] border-primary/20">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t('askChat.title')}</CardTitle>
              <CardDescription>{t('askChat.subtitle')}</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('askChat.clear')}
          </Button>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-medium text-foreground mb-1">{t('askChat.startConversation')}</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {t('askChat.startDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onSave={onSaveSource} />
              ))}
              {isLoading && (
                <div className="flex gap-3" role="status" aria-live="polite" aria-atomic="true">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      <span className="text-sm text-muted-foreground animate-pulse">
                        {t(LOADING_MESSAGES_KEYS[loadingMessageIndex])}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <div className="shrink-0 border-t border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1">
            {modeOptions.map((option) => (
              <Button
                key={option.id}
                variant={mode === option.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode(option.id)}
                className="text-xs"
              >
                <option.icon className="mr-1 h-3 w-3" />
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="citation-mode" className="text-xs">{t('askChat.citations')}</Label>
              <Switch
                id="citation-mode"
                checked={citationMode}
                onCheckedChange={setCitationMode}
              />
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file) => (
              <div key={file.name} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(files.indexOf(file))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="file"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title={t('askChat.attachFiles')}
            aria-label={t('askChat.attachFiles')}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {hasSupport && (
            <Button
              type="button"
              variant={isListening ? "destructive" : "outline"}
              size="icon"
              onClick={toggleListening}
              title={isListening ? t('askChat.stopListening') : t('askChat.startVoice')}
              aria-label={isListening ? t('askChat.stopListening') : t('askChat.startVoice')}
              className={isListening ? "animate-pulse" : ""}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? t('askChat.placeholderListening') : t('askChat.placeholder')}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={(!input.trim() && files.length === 0) || isLoading} aria-label={t('askChat.send')}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
