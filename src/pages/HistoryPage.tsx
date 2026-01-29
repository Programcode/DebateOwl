import { useSessionStore } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Trash2, Eye, MessageCircle, FileText, Zap, Brain, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function HistoryPage() {
  const navigate = useNavigate();
  const store = useSessionStore();
  
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString();

  const handleLoadCase = (id: string) => {
    store.loadSavedCase(id);
    navigate('/');
  };

  const handleLoadChat = (id: string) => {
    store.loadSavedChat(id);
    navigate('/ask');
  };

  const handleLoadAttack = (id: string) => {
    store.loadSavedAttack(id);
    navigate('/attack');
  };

  const handleLoadBrainstorm = (id: string) => {
    store.loadSavedBrainstorm(id);
    navigate('/brainstorm');
  };

  const handleLoadFactoids = (id: string) => {
    store.loadSavedFactoids(id);
    navigate('/factoids');
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">History & Saved Items</h1>
          <p className="text-muted-foreground mt-1">
            Access your saved debate cases, chat sessions, and analysis results.
          </p>
        </div>

        <Tabs defaultValue="cases" className="space-y-6">
          <TabsList>
            <TabsTrigger value="cases" className="gap-2"><FileText className="h-4 w-4"/> Saved Cases</TabsTrigger>
            <TabsTrigger value="chats" className="gap-2"><MessageCircle className="h-4 w-4"/> Chat Sessions</TabsTrigger>
            <TabsTrigger value="attacks" className="gap-2"><Zap className="h-4 w-4"/> Attack Analyses</TabsTrigger>
            <TabsTrigger value="brainstorms" className="gap-2"><Brain className="h-4 w-4"/> Brainstorms</TabsTrigger>
            <TabsTrigger value="factoids" className="gap-2"><BookOpen className="h-4 w-4"/> Factoids</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            <Card>
              <CardHeader>
                <CardTitle>Debate Cases</CardTitle>
                <CardDescription>Generated arguments and cases</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedCases.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No saved cases yet.</p>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedCases.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{item.data.metadata.side.toUpperCase()}</Badge>
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleLoadCase(item.id)}>
                              <Eye className="h-4 w-4 mr-2" /> Load
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => store.deleteSavedCase(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chats">
            <Card>
              <CardHeader>
                <CardTitle>Chat Sessions</CardTitle>
                <CardDescription>Past conversations with the debate coach</CardDescription>
              </CardHeader>
              <CardContent>
                 {store.savedChats.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No saved chats yet.</p>
                ) : (
                  <div className="space-y-4">
                    {store.savedChats.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5">
                        <div className="space-y-1">
                          <h4 className="font-semibold">{item.title}</h4>
                          <p className="text-xs text-muted-foreground">{item.data.length} messages • {formatDate(item.createdAt)}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleLoadChat(item.id)}>
                          <Eye className="h-4 w-4 mr-2" /> Resume
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="attacks">
            <Card>
              <CardHeader>
                <CardTitle>Attack Analyses</CardTitle>
                <CardDescription>Saved critique and analysis results</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedAttacks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No saved attacks yet.</p>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedAttacks.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadAttack(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> Load
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="brainstorms">
            <Card>
              <CardHeader>
                <CardTitle>Brainstorms</CardTitle>
                <CardDescription>Saved idea explorations</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedBrainstorms.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No saved brainstorms yet.</p>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedBrainstorms.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadBrainstorm(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> Load
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="factoids">
            <Card>
              <CardHeader>
                <CardTitle>Factoids</CardTitle>
                <CardDescription>Saved evidence and citations</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedFactoids.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No saved factoids yet.</p>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedFactoids.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadFactoids(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> Load
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
