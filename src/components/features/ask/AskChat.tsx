import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Send, RotateCcw, Quote, Map, List, HelpCircle, Paperclip, X, Bookmark, Mic, MicOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AskOutput } from '@/lib/ai/schemas/ask';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { useToast } from '@/hooks/use-toast';
import { validateFileUpload, MAX_FILE_COUNT, formatFileSize } from '@/lib/validation/file';
import { formatEuropeanTime } from '@/lib/date-format';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

interface AskChatProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
    prosConsMode: boolean,
    argumentMapMode: boolean,
    files?: File[]
  ) => void;
  onClear: () => void;
  onSaveSource?: (title: string, content: string) => void;
}

const modeOptions = [
  { id: 'general', labelKey: 'askChat.modeGeneral', icon: MessageCircle },
  { id: 'clarify', labelKey: 'askChat.modeClarify', icon: HelpCircle },
];

const LOADING_MESSAGES_KEYS = [
  'askChat.thinking',
  'askChat.researching',
  'askChat.analyzing',
  'askChat.generatingResponse',
  'askChat.almostThere',
];

function getFirstUrl(text?: string) {
  return text?.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;!?]+$/g, '');
}

function sourceQualityClass(label?: string) {
  if (label === 'strong') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (label === 'moderate') return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
}

const MessageBubble = React.memo(function MessageBubble({ message, onSave }: { message: Message, onSave?: (title: string, content: string) => void }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const output = message.output;

  return (
    <div className={cn('flex gap-3 message-enter', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 space-y-3 relative group',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card border border-border rounded-bl-sm'
        )}
        data-streaming={message.isStreaming ? 'true' : undefined}
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
        <div className="text-sm">
          {message.content ? (
            <Markdown>{message.content}</Markdown>
          ) : message.isStreaming ? (
            <span className="text-muted-foreground">{t('askChat.typing', 'Typing')}</span>
          ) : null}
          {message.isStreaming && (
            <span className="streaming-caret" aria-hidden="true" />
          )}
        </div>

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

        {/* Citations */}
        {output?.citations && output.citations.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.citationResults')}</span>
            <ul className="space-y-2">
              {output.citations.map((citation: { claim: string; source?: string; verified: boolean; note?: string }, i: number) => (
                <li key={i} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{citation.claim}</span>
                    <span className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      citation.verified ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    )}>
                      {citation.verified ? t('askChat.verified') : t('askChat.unverified')}
                    </span>
                  </div>
                  {citation.source && getFirstUrl(citation.source) ? (
                    <a
                      className="mt-1 block break-words text-primary hover:underline [overflow-wrap:anywhere]"
                      href={getFirstUrl(citation.source)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {citation.source}
                    </a>
                  ) : citation.source ? (
                    <div className="mt-1 break-words [overflow-wrap:anywhere] text-muted-foreground">{citation.source}</div>
                  ) : null}
                  {citation.note && (
                    <div className="mt-1 text-muted-foreground">{citation.note}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Web research */}
        {output?.searchInfo?.webSearchUsed && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.webResearchUsed')}</span>
            {output.searchInfo.queries?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {t('askChat.searchQueries')} {output.searchInfo.queries.join('; ')}
              </div>
            )}
            {output.searchInfo.sources?.length > 0 && (
              <ul className="space-y-1">
                {output.searchInfo.sources.map((source: { title: string; url: string; verified: boolean; sourceType?: string; qualityScore?: number; qualityLabel?: string }, i: number) => (
                  <li key={`${source.url}-${i}`} className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {source.qualityLabel && (
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', sourceQualityClass(source.qualityLabel))}>
                          {source.qualityLabel}
                        </span>
                      )}
                      {source.sourceType && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {source.sourceType}
                        </span>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {source.verified ? t('askChat.verified') : t('askChat.unverified')}
                      </span>
                    </div>
                    <a className="mt-1 block text-primary hover:underline break-words [overflow-wrap:anywhere]" href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
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

        {/* Argument map */}
        {output?.argumentMap && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.argumentMap')}</span>
            <div className="grid gap-2 text-xs">
              <div className="rounded-md bg-muted/30 p-2">
                <span className="font-medium text-foreground">{t('askChat.mainClaim')}</span>
                <p className="mt-1 text-muted-foreground">{output.argumentMap.mainClaim}</p>
              </div>
              {[
                [t('askChat.supportingPoints'), output.argumentMap.supportingPoints],
                [t('askChat.counterpoints'), output.argumentMap.counterpoints],
                [t('askChat.assumptions'), output.argumentMap.assumptions],
              ].map(([label, items]) => (
                Array.isArray(items) && items.length > 0 ? (
                  <div key={String(label)} className="rounded-md bg-muted/30 p-2">
                    <span className="font-medium text-foreground">{String(label)}</span>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {items.map((item: string, i: number) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        )}

        {/* Uncertainties */}
        {output?.uncertainties && output.uncertainties.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.uncertainties')}</span>
            <ul className="space-y-1">
              {output.uncertainties.map((uncertainty: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">• {uncertainty}</li>
              ))}
            </ul>
          </div>
        )}

        <span className="text-[10px] text-muted-foreground">
          {(() => {
            try {
              if (!message.timestamp) return '';
              return formatEuropeanTime(message.timestamp);
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
  const [webSearch, setWebSearch] = useState(false);
  const [prosConsMode, setProsConsMode] = useState(false);
  const [argumentMapMode, setArgumentMapMode] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useSpeechToText();
  const hasStreamingMessage = messages.some((message) => message.isStreaming);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

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
    onSend(input.trim(), mode, citationMode, webSearch, prosConsMode, argumentMapMode, files);
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
    <Card className="flex flex-col h-[calc(100vh-14rem)] min-h-[400px] max-h-[800px] border-primary/20">
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
              {isLoading && !hasStreamingMessage && (
                <div className="motion-swap flex gap-3" role="status" aria-live="polite" aria-atomic="true">
                  <div className="motion-shimmer bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="typing-indicator">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t(LOADING_MESSAGES_KEYS[loadingMessageIndex])}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <div className="shrink-0 border-t border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1">
            {modeOptions.map((option) => (
              <Button
                key={option.id}
                variant={mode === option.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode(option.id)}
                className="text-xs transition-all duration-200"
              >
                <option.icon className="mr-1 h-3 w-3" />
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 transition-all duration-200 hover:border-primary/30">
              <Quote className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="citation-mode" className="text-xs">{t('askChat.citations')}</Label>
              <Switch
                id="citation-mode"
                checked={citationMode}
                onCheckedChange={setCitationMode}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 transition-all duration-200 hover:border-primary/30">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="web-search-mode" className="text-xs">{t('askChat.webSearch')}</Label>
              <Switch
                id="web-search-mode"
                checked={webSearch}
                onCheckedChange={setWebSearch}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 transition-all duration-200 hover:border-primary/30">
              <List className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="pros-cons-mode" className="text-xs">{t('askChat.modeProsCons')}</Label>
              <Switch
                id="pros-cons-mode"
                checked={prosConsMode}
                onCheckedChange={setProsConsMode}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 transition-all duration-200 hover:border-primary/30">
              <Map className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="argument-map-mode" className="text-xs">{t('askChat.modeArgMap')}</Label>
              <Switch
                id="argument-map-mode"
                checked={argumentMapMode}
                onCheckedChange={setArgumentMapMode}
              />
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file) => (
              <div key={file.name} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs motion-list-item">
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
