import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, RotateCcw, Quote, Map, List, HelpCircle, Paperclip, X, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { AskOutput } from '@/lib/ai/schemas/ask';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/use-speech-to-text';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  output?: AskOutput;
}

interface AskChatProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (message: string, mode: string, citationMode: boolean, files?: File[]) => void;
  onClear: () => void;
}

const modeOptions = [
  { id: 'general', label: 'General', icon: MessageCircle },
  { id: 'clarify', label: 'Clarify', icon: HelpCircle },
  { id: 'proscons', label: 'Pros/Cons', icon: List },
  { id: 'argumentmap', label: 'Arg Map', icon: Map },
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const output = message.output;

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 space-y-3',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card border border-border rounded-bl-sm'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Follow-up questions */}
        {output?.followUpQuestions && output.followUpQuestions.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">Follow-up questions:</span>
            <ul className="space-y-1">
              {output.followUpQuestions.map((q, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Pros/Cons */}
        {output?.prosConsAnalysis && (
          <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-border/50">
            <div>
              <span className="text-xs font-medium text-primary">Pros</span>
              <ul className="mt-1 space-y-0.5">
                {output.prosConsAnalysis.pros.map((pro, i) => (
                  <li key={i} className="text-xs">✓ {pro}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-xs font-medium text-destructive">Cons</span>
              <ul className="mt-1 space-y-0.5">
                {output.prosConsAnalysis.cons.map((con, i) => (
                  <li key={i} className="text-xs">✗ {con}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Argument Map */}
        {output?.argumentMap && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div>
              <span className="text-xs font-medium text-primary">Main Claim:</span>
              <p className="text-xs">{output.argumentMap.mainClaim}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Supporting:</span>
                <ul className="space-y-0.5">
                  {output.argumentMap.supportingPoints.map((p, i) => (
                    <li key={i} className="text-xs">+ {p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Counters:</span>
                <ul className="space-y-0.5">
                  {output.argumentMap.counterpoints.map((c, i) => (
                    <li key={i} className="text-xs">- {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Uncertainties */}
        {output?.uncertainties && output.uncertainties.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-amber-500">Uncertainties:</span>
            <ul className="mt-1 space-y-0.5">
              {output.uncertainties.map((u, i) => (
                <li key={i} className="text-xs text-muted-foreground">⚠ {u}</li>
              ))}
            </ul>
          </div>
        )}

        <span className="text-[10px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

export function AskChat({ messages, isLoading, onSend, onClear }: AskChatProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('general');
  const [citationMode, setCitationMode] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport } = useSpeechToText();

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
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
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
              <CardTitle>Ask Your Coach</CardTitle>
              <CardDescription>Get answers to debate questions</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-medium text-foreground mb-1">Start a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask anything about debate strategy, arguments, or get help with your case.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                    <LoadingSpinner size="sm" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Input Area */}
      <div className="shrink-0 border-t border-border p-4 space-y-3">
        {/* Mode Selection */}
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
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="citation-mode" className="text-xs">Citations</Label>
            <Switch
              id="citation-mode"
              checked={citationMode}
              onCheckedChange={setCitationMode}
            />
          </div>
        </div>

        {/* Attached Files Preview */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{file.name}</span>
                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
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
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          
          {hasSupport && (
            <Button
              type="button"
              variant={isListening ? "destructive" : "outline"}
              size="icon"
              onClick={toggleListening}
              title={isListening ? "Stop listening" : "Start voice input"}
              className={isListening ? "animate-pulse" : ""}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : "Ask your debate coach..."}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={(!input.trim() && files.length === 0) || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}