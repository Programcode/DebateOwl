import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MessageCircle, Send, RotateCcw, Quote, Map, List, HelpCircle, Paperclip, X, Bookmark, Mic, MicOff, Search, Save, PanelLeftOpen, PlusCircle, Square, SlidersHorizontal, ArrowDown, AlertCircle } from 'lucide-react';
import { Button, ThinkingDots } from '@/components/ui/button';
import { Owl, OwlAvatar } from '@/components/brand/Owl';
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
import { formatDecimal, formatEuropeanDate, formatEuropeanTime } from '@/lib/date-format';
import { ModelSelector } from '@/components/ModelSelector';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ListeningIndicator } from '@/components/features/voice/ListeningIndicator';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

/** A failed or rejected send, shown in the chat above the composer. */
export interface AskChatError {
  title: string;
  description?: string;
  onRetry?: () => void;
}

interface AskChatProps {
  messages: Message[];
  /** The reply being streamed, rendered after the stored messages. */
  streamingMessage?: Message | null;
  isLoading: boolean;
  error?: AskChatError | null;
  onDismissError?: () => void;
  /** Stops the reply in progress. */
  onStop?: () => void;
  /** Resolves false when the message was rejected, so the composer keeps the text. */
  onSend: (
    message: string,
    mode: string,
    citationMode: boolean,
    webSearch: boolean,
    prosConsMode: boolean,
    argumentMapMode: boolean,
    files?: File[]
  ) => boolean | void | Promise<boolean | void>;
  onClear: () => void;
  onSaveChat?: () => void;
  savedChats?: SavedChatSummary[];
  onLoadChat?: (id: string) => void;
  onSaveSource?: (title: string, content: string) => void;
  /** Shown directly above the message box, e.g. which debate material Ask will use. */
  contextControl?: React.ReactNode;
}

interface SavedChatSummary {
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}

const modeOptions = [
  { id: 'general', labelKey: 'askChat.modeGeneral', icon: MessageCircle },
  { id: 'clarify', labelKey: 'askChat.modeClarify', icon: HelpCircle },
];

// Within this distance of the bottom, new text keeps the view pinned to the latest message.
const AT_BOTTOM_PX = 80;

/** Seconds since `since`, ticking once a second while `active`. */
function useElapsedSeconds(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return elapsed;
}

function getFirstUrl(text?: string) {
  return text?.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;!?]+$/g, '');
}

function sourceQualityClass(label?: string) {
  if (label === 'strong') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (label === 'moderate') return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
}

const USER_BUBBLE_MARKDOWN = 'text-current [&_*]:text-current [&_li::marker]:text-current [&_a]:decoration-current [&_code]:bg-white/15 [&_blockquote]:border-current/40';

const MessageBubble = React.memo(function MessageBubble({ message, onSave }: { message: Message, onSave?: (title: string, content: string) => void }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const output = message.output;

  return (
    <div className={cn('flex items-end gap-2.5', isUser ? 'justify-end motion-safe:animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out-strong' : 'motion-safe:animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out-strong justify-start')}>
      {/* The coach is the owl. */}
      {!isUser && <OwlAvatar pose="coach" size={32} label={t('askChat.coachAvatarAlt', 'The owl, your debate coach')} className="mb-0.5 hidden sm:inline-flex" />}
      <div
        className={cn(
          'max-w-[85%] rounded-[20px] px-4 py-3 space-y-3 relative group',
          isUser
            ? 'bg-brand text-white rounded-br-md shadow-[0_3px_0_var(--do-primary-ledge)]'
            : 'bg-card border-2 border-border rounded-bl-md'
        )}
        data-streaming={message.isStreaming ? 'true' : undefined}
      >
        {!isUser && onSave && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-10 top-0 h-8 w-8 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
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
          {/* prose paints its own gray text, which was about 2:1 on the blue user bubble; take the bubble's color instead. */}
          {message.content ? (
            <Markdown className={isUser ? USER_BUBBLE_MARKDOWN : undefined}>{message.content}</Markdown>
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
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                      citation.verified ? 'bg-success-tint text-success-text' : 'bg-warning-tint text-warning-text'
                    )}>
                      {citation.verified ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : <HelpCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />}
                      {citation.verified ? t('askChat.verified') : t('askChat.unverified')}
                    </span>
                  </div>
                  {citation.source && getFirstUrl(citation.source) ? (
                    <a
                      className="mt-1 block text-primary hover:underline wrap-anywhere"
                      href={getFirstUrl(citation.source)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {citation.source}
                    </a>
                  ) : citation.source ? (
                    <div className="mt-1 wrap-anywhere text-muted-foreground">{citation.source}</div>
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
                {output.searchInfo.sources.map((source: { title: string; url: string; verified: boolean; sourceType?: string; qualityScore?: number; qualityLabel?: string }, i: number) => {
                  const safeUrl = getFirstUrl(source.url);
                  return (
                  <li key={`${source.url}-${i}`} className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {source.qualityLabel && (
                        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', sourceQualityClass(source.qualityLabel))}>
                          {t(`sourceQuality.labels.${source.qualityLabel}`, source.qualityLabel)}
                        </span>
                      )}
                      {source.sourceType && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {t(`sourceQuality.types.${source.sourceType}`, source.sourceType)}
                        </span>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {source.verified ? t('askChat.verified') : t('askChat.unverified')}
                      </span>
                    </div>
                    {safeUrl ? (
                      <a className="mt-1 block text-primary hover:underline wrap-anywhere" href={safeUrl} target="_blank" rel="noreferrer">
                        {source.title || source.url}
                      </a>
                    ) : (
                      <span className="mt-1 block text-muted-foreground wrap-anywhere">{source.title || source.url}</span>
                    )}
                  </li>
                  );
                })}
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
        {output && (output.uncertainties?.length > 0 || output.replyTruncated) && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">{t('askChat.uncertainties')}</span>
            <ul className="space-y-1">
              {output.uncertainties?.map((uncertainty: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">• {uncertainty}</li>
              ))}
              {output.replyTruncated && <li className="text-xs text-muted-foreground">• {t('ask.replyCutOff')}</li>}
            </ul>
          </div>
        )}

        {/* Muted gray is unreadable on the blue user bubble; the bubble's own color is 5:1 or better. */}
        <span data-testid="message-meta" className={cn('text-xs', isUser ? 'text-current' : 'text-muted-foreground')}>
          {(() => {
            try {
              const parts: string[] = [];
              if (message.timestamp) parts.push(formatEuropeanTime(message.timestamp));
              if (message.role === 'assistant' && message.output?.model) {
                parts.push(message.output.model);
              } else if (message.role === 'assistant' && message.output?.provider) {
                parts.push(message.output.provider);
              }
              if (message.role === 'assistant' && message.output?.durationMs) {
                parts.push(t('askChat.elapsed', { seconds: formatDecimal(message.output.durationMs / 1000, 1) }));
              }
              return parts.join(' • ');
            } catch (e) {
              return '';
            }
          })()}
        </span>
      </div>
    </div>
  );
});

function SavedChatsPanel({
  savedChats,
  onLoadChat,
  onNewChat,
  onClose,
}: {
  savedChats: SavedChatSummary[];
  onLoadChat?: (id: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();

  const handleLoad = (id: string) => {
    onLoadChat?.(id);
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => { onNewChat(); onClose?.(); }}>
        <PlusCircle className="mr-2 h-4 w-4" />
        {t('askChat.newChat', 'New chat')}
      </Button>
      {savedChats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center">
          <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t('askChat.noSavedChats', 'No saved chats yet')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('askChat.noSavedChatsDesc', 'Saved coaching chats will appear here.')}</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="space-y-2">
            {savedChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handleLoad(chat.id)}
              >
                <div className="truncate text-sm font-medium">{chat.title}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatEuropeanDate(chat.createdAt)}</span>
                  <span>{t('askChat.messageCount', '{{count}} messages', { count: chat.messageCount })}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function AskChat({ messages, streamingMessage, isLoading, error, onDismissError, onStop, onSend, onClear, onSaveChat, savedChats = [], onLoadChat, onSaveSource, contextControl }: AskChatProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('general');
  const [citationMode, setCitationMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [prosConsMode, setProsConsMode] = useState(false);
  const [argumentMapMode, setArgumentMapMode] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Starts pinned; scrolling up to read unpins until the user returns to the bottom.
  const atBottomRef = useRef(true);
  const { toast } = useToast();

  const { isListening, transcript, error: voiceError, startListening, stopListening, resetTranscript, hasSupport } = useSpeechToText();
  const waitingForText = isLoading && !streamingMessage?.content;
  const elapsed = useElapsedSeconds(waitingForText);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
    if (atBottomRef.current) setShowJump(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  };

  // New text follows only a reader who is already at the bottom, and only inside the
  // chat, never the window. Otherwise a "Jump to latest" pill appears.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    else setShowJump(true);
  }, [messages, streamingMessage?.content, waitingForText, error]);

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && files.length === 0) || isLoading) return;
    const sent = input;
    const sentFiles = files;
    setSearchingWeb(webSearch);
    // Sending scrolls to the new question.
    atBottomRef.current = true;
    setInput('');
    setFiles([]);
    resetTranscript();
    const accepted = await onSend(sent.trim(), mode, citationMode, webSearch, prosConsMode, argumentMapMode, sentFiles);
    // A rejected message comes back into the box so the user can shorten it.
    if (accepted === false) {
      setInput((current) => current || sent);
      setFiles((current) => (current.length ? current : sentFiles));
    }
  };

  const handleStop = () => {
    onStop?.();
    inputRef.current?.focus();
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
      void startListening();
    }
  };

  return (
    <div className="space-y-3 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col">
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(true)}>
          <PanelLeftOpen className="mr-2 h-4 w-4" />
          {t('askChat.savedChats', 'Saved chats')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('askChat.savedCount', '{{count}} saved', { count: savedChats.length })}</span>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[86vw] p-4">
          <SheetHeader>
            <SheetTitle>{t('askChat.savedChats', 'Saved chats')}</SheetTitle>
            <SheetDescription>{t('askChat.savedChatsDesc', 'Resume prior coaching conversations.')}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 h-[60dvh] sm:h-[calc(100dvh-8rem)]">
            <SavedChatsPanel
              savedChats={savedChats}
              onLoadChat={onLoadChat}
              onNewChat={onClear}
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className={cn('grid gap-3 max-md:min-h-0 max-md:flex-1', desktopSidebarOpen ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-[auto_minmax(0,1fr)]')}>
        <aside className="hidden lg:block">
          {desktopSidebarOpen ? (
            <Card className="flex h-[calc(100dvh-14rem)] min-h-[400px] max-h-[800px] flex-col border-primary/20">
              <CardHeader className="shrink-0 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{t('askChat.savedChats', 'Saved chats')}</CardTitle>
                    <CardDescription>{t('askChat.savedChatsDesc', 'Resume prior coaching conversations.')}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDesktopSidebarOpen(false)} aria-label={t('common.close', 'Close')}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                <SavedChatsPanel savedChats={savedChats} onLoadChat={onLoadChat} onNewChat={onClear} />
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-[calc(100dvh-14rem)] min-h-[400px] max-h-[800px] w-12 border-primary/20"
              onClick={() => setDesktopSidebarOpen(true)}
              aria-label={t('askChat.openSavedChats', 'Open saved chats')}
            >
              <PanelLeftOpen className="h-5 w-5" />
            </Button>
          )}
        </aside>

    <Card className="flex h-[calc(100dvh-14rem)] min-h-[400px] max-h-[800px] flex-col border-primary/20 max-md:h-auto max-md:max-h-none max-md:min-h-0 max-md:flex-1">
      <CardHeader className="shrink-0 border-b-2 border-border bg-brand-tint/50 pb-4">
        {/* Wraps on a phone: the Hungarian title and two buttons do not fit one 375 px row. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <OwlAvatar pose="coach" size={44} label={t('askChat.coachAvatarAlt', 'The owl, your debate coach')} />
            <div className="min-w-0">
              <CardTitle>{t('askChat.title')}</CardTitle>
              <CardDescription>{t('askChat.subtitle')}</CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {onSaveChat && messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onSaveChat}>
                <Save className="mr-2 h-4 w-4" />
                {t('askChat.save', 'Save')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClear}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('askChat.clear')}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="relative flex-1 overflow-hidden p-0">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain p-4">
          {messages.length === 0 && !streamingMessage ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 motion-safe:animate-in fade-in-0 duration-300">
              <Owl pose="point" size={112} className="mb-3" priority />
              <h3 className="font-display text-xl font-[600] text-heading mb-1">{t('askChat.startConversation')}</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {t('askChat.startDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* One keyed list: the finished reply keeps the streaming bubble's id and position, so it isn't remounted. */}
              {(streamingMessage && !messages.some((message) => message.id === streamingMessage.id) ? [...messages, streamingMessage] : messages).map((message) => (
                <MessageBubble key={message.id} message={message} onSave={message === streamingMessage ? undefined : onSaveSource} />
              ))}
              {waitingForText && (
                // One true status line: what is happening, and how long it has taken once that matters.
                <p className="flex items-center gap-2.5 text-sm font-bold text-muted-foreground motion-safe:animate-in fade-in-0 duration-200" role="status" aria-live="polite">
                  {/* Decorative: a label here would be announced with every status update. */}
                  <OwlAvatar pose="coach" size={32} />
                  <span className="inline-flex items-center gap-2 rounded-[20px] rounded-bl-md border-2 border-border bg-card px-3.5 py-2.5">
                    {searchingWeb ? t('askChat.searchingWeb', 'Searching the web…') : t('askChat.working', 'Working…')}
                    <ThinkingDots className="text-primary" />
                  </span>
                  {elapsed >= 5 && <span className="tabular-nums">{t('askChat.elapsed', { seconds: elapsed, defaultValue: '{{seconds}}s' })}</span>}
                </p>
              )}
            </div>
          )}
        </div>
        {showJump && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            {t('askChat.jumpToLatest', 'Jump to latest')}
          </Button>
        )}
      </CardContent>

      <div className="shrink-0 border-t border-border p-4 space-y-2">
        {/* Options share the mode row, so only one row of controls sits above the message box.
            On a phone it shows its icon only: the Hungarian label does not fit beside both modes. */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 gap-1 overflow-x-auto scrollbar-hide">
            {modeOptions.map((option) => (
              <Button
                key={option.id}
                variant={mode === option.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode(option.id)}
                className="text-xs transition-all duration-200 shrink-0"
              >
                <option.icon className="mr-1 h-3 w-3" />
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0 gap-2">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t('askChat.options', 'Options')}</span>
                {[citationMode, webSearch, prosConsMode, argumentMapMode].filter(Boolean).length > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary tabular-nums">{[citationMode, webSearch, prosConsMode, argumentMapMode].filter(Boolean).length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-1 p-3">
                <div className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 pointer-coarse:min-h-11">
                  <Label htmlFor="citation-mode" className="flex items-center gap-2 text-sm font-normal">
                    <Quote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t('askChat.citations')}
                  </Label>
                  <Switch id="citation-mode" checked={citationMode} onCheckedChange={setCitationMode} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 pointer-coarse:min-h-11">
                  <Label htmlFor="web-search-mode" className="flex items-center gap-2 text-sm font-normal">
                    <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t('askChat.webSearch')}
                  </Label>
                  <Switch id="web-search-mode" checked={webSearch} onCheckedChange={setWebSearch} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 pointer-coarse:min-h-11">
                  <Label htmlFor="pros-cons-mode" className="flex items-center gap-2 text-sm font-normal">
                    <List className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t('askChat.modeProsCons')}
                  </Label>
                  <Switch id="pros-cons-mode" checked={prosConsMode} onCheckedChange={setProsConsMode} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 pointer-coarse:min-h-11">
                  <Label htmlFor="argument-map-mode" className="flex items-center gap-2 text-sm font-normal">
                    <Map className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t('askChat.modeArgMap')}
                  </Label>
                  <Switch id="argument-map-mode" checked={argumentMapMode} onCheckedChange={setArgumentMapMode} />
                </div>
              <div className="border-t pt-2">
                <ModelSelector feature="ask" className="w-full" />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs motion-list-item">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('askChat.removeFile', 'Remove {{name}}', { name: file.name })}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {isListening && <ListeningIndicator label={t('askChat.placeholderListening')} />}
        {voiceError && (
          <p className="text-sm text-destructive">
            {voiceError === 'not-allowed'
              ? t('voice.permissionDenied', 'Microphone access is blocked. Allow microphone access in your browser settings and try again.')
              : t('voice.startFailed', 'Dictation could not start. Check your microphone and try again.')}
          </p>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{error.title}</p>
              {error.description && <p className="text-muted-foreground">{error.description}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              {error.onRetry && (
                <Button type="button" size="sm" variant="outline" onClick={error.onRetry}>{t('common.retry', 'Retry')}</Button>
              )}
              {onDismissError && (
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onDismissError} aria-label={t('common.close', 'Close')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {contextControl}

        <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2">
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
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}

          {/* The box stays editable while a reply streams, so the next question can be typed. */}
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? t('askChat.placeholderListening') : t('askChat.placeholder')}
            aria-label={t('askChat.inputLabel')}
            className="flex-1"
          />
          {isLoading && onStop ? (
            <Button type="button" variant="outline" onClick={handleStop} aria-label={t('askChat.stop', 'Stop answering')}>
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" disabled={(!input.trim() && files.length === 0) || isLoading} aria-label={t('askChat.send')}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </Card>
      </div>
    </div>
  );
}
