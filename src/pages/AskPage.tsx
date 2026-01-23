// src/pages/AskPage.tsx
import { useSessionStore } from '@/lib/stores/session-store';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { AskChat } from '@/components/features/ask/AskChat';
import { mockAsk } from '@/lib/ai/providers/mock-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AskPage() {
  const { askMessages, askLoading, addAskMessage, setAskLoading, clearAskMessages } = useSessionStore();
  const { getFeatureConfig } = useSettingsStore();
  const config = getFeatureConfig('ask');

  const handleSend = async (message: string, mode: string, citationMode: boolean) => {
    // Add user message
    addAskMessage({ role: 'user', content: message });
    setAskLoading(true);

    try {
      if (config.provider === 'mock') {
        const result = await mockAsk(message, mode);
        addAskMessage({ role: 'assistant', content: result.response });
      } else {
        const result = await mockAsk(message, mode);
        addAskMessage({ role: 'assistant', content: result.response });
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      addAskMessage({ role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' });
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
  }));

  return (
    <div className="container py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Ask Your Coach</h1>
          <p className="text-muted-foreground mt-1">
            Get personalized debate coaching and answers to your questions
          </p>
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
