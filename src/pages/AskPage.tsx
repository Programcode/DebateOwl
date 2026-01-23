// src/pages/AskPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { askChat } from '@/lib/ai/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

export default function AskPage() {
  const { askMessages, askLoading, addAskMessage, setAskLoading, clearAskMessages, saveCurrentChat } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('ask');
  const { toast } = useToast();

  const handleSend = async (message: string, mode: string, citationMode: boolean, files?: File[]) => {
    // 1. Prepare Display Message (what the user sees)
    const displayContent = files && files.length > 0 
      ? `${message}\n\n[Attachments: ${files.map(f => f.name).join(', ')}]`
      : message;

    addAskMessage({ role: 'user', content: displayContent });
    setAskLoading(true);

    try {
      // 2. Process Files (Read content)
      let fileContext = "";
      if (files && files.length > 0) {
        const filePromises = files.map(file => {
          return new Promise<string>((resolve, reject) => {
            if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.json')) {
              const reader = new FileReader();
              reader.onload = (e) => resolve(`--- Start of file: ${file.name} ---\n${e.target?.result}\n--- End of file: ${file.name} ---\n\n`);
              reader.onerror = (reject);
              reader.readAsText(file);
            } else {
              resolve(`[File ${file.name} skipped: unsupported format (only text/md/json supported)]\n`);
            }
          });
        });
        
        const fileContents = await Promise.all(filePromises);
        fileContext = fileContents.join('\n');
      }

      // 3. Prepare AI Message (Context + User Query)
      const fullQuery = fileContext ? `Context from attached files:\n${fileContext}\n\nUser Question: ${message}` : message;

      // Pass the conversation history
      const history = askMessages.map(m => ({ role: m.role, content: m.content }));
      
      const result = await askChat(fullQuery, history, mode, config);
      
      addAskMessage({ 
        role: 'assistant', 
        content: result.response,
        // @ts-ignore
        output: result 
      });
    } catch (error) {
      console.error('Failed to get response:', error);
      addAskMessage({ role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' });
      toast({
        title: "Chat Request Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setAskLoading(false);
    }
  };

  // Format messages for the chat component
  const formattedMessages = askMessages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    output: m.output
  }));

  const handleSaveChat = () => {
    if (askMessages.length === 0) return;
    const title = window.prompt("Enter a title for this chat:", "Debate Session " + new Date().toLocaleDateString());
    if (title) {
      saveCurrentChat(title);
      toast({ title: "Chat Saved", description: "Conversation saved to history." });
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Ask Your Coach</h1>
            <p className="text-muted-foreground mt-1">
              Get personalized debate coaching and answers to your questions
            </p>
          </div>
          <Button variant="outline" onClick={handleSaveChat} disabled={askMessages.length === 0}>
            <Save className="h-4 w-4 mr-2" />
            Save Chat
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Chat */}
          <div>
            <AskChat
              messages={formattedMessages}
              isLoading={askLoading}
              onSend={handleSend}
              onClear={clearAskMessages}
            />
          </div>

          {/* Tips Sidebar */}
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Tips</CardTitle>
                <CardDescription>Get the most from your coach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">1</Badge>
                  <p className="text-muted-foreground">Be specific about your motion and position</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">2</Badge>
                  <p className="text-muted-foreground">Use "Pros/Cons" mode for balanced analysis</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">3</Badge>
                  <p className="text-muted-foreground">Enable citations for factual claims</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">4</Badge>
                  <p className="text-muted-foreground">Ask follow-up questions to dig deeper</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Example Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  "How do I respond to a utilitarian argument?"
                </p>
                <p className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  "What's the best framework for rights debates?"
                </p>
                <p className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  "Help me weigh economic vs social impacts"
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
