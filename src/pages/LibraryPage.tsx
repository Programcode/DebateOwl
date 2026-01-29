import { useState } from 'react';
import { useSessionStore, type Source } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Globe, FileText, Database, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function LibraryPage() {
  const { sourceLibrary, addSource, removeSource, toggleSource, clearLibrary } = useSessionStore();
  const { toast } = useToast();
  
  const [isAdding, setIsAdding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [newSource, setNewSource] = useState({
    title: '',
    content: '',
    type: 'text' as Source['type'],
    origin: ''
  });

  const handleAdd = () => {
    if (!newSource.title || !newSource.content) {
      toast({ title: "Error", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    addSource(newSource);
    setNewSource({ title: '', content: '', type: 'text', origin: '' });
    setIsAdding(false);
    toast({ title: "Source Added", description: "This source is now available for AI grounding." });
  };

  const handleClearLibrary = async () => {
    if (isClearing) return;
    const confirmed = window.confirm('Clear all sources? This cannot be undone.');
    if (!confirmed) return;
    setIsClearing(true);
    try {
      await Promise.resolve(clearLibrary());
    } catch (error) {
      console.error('Failed to clear library:', error);
      toast({ title: "Error", description: "Failed to clear sources.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();
  const activeSourceCount = sourceLibrary.filter(source => source.isActive).length;
  const hasActiveSources = activeSourceCount > 0;

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Source Library</h1>
            <p className="text-muted-foreground mt-1">
              Manage research and evidence for "Deep Grounding" during case generation and chat.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsAdding(!isAdding)}>
              <Plus className="h-4 w-4 mr-2" /> {isAdding ? 'Cancel' : 'Add Source'}
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={handleClearLibrary} disabled={isClearing}>
              <Trash2 className="h-4 w-4 mr-2" /> {isClearing ? 'Clearing...' : 'Clear All'}
            </Button>
          </div>
        </div>

        {isAdding && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Add New Knowledge</CardTitle>
              <CardDescription>Manually add text or documentation to the library</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input 
                    placeholder="e.g., UBI Study 2024" 
                    value={newSource.title}
                    onChange={(e) => setNewSource({...newSource, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origin (URL/Author)</Label>
                  <Input 
                    placeholder="e.g., nature.com" 
                    value={newSource.origin}
                    onChange={(e) => setNewSource({...newSource, origin: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea 
                  placeholder="Paste the full text here..." 
                  className="min-h-[200px]"
                  value={newSource.content}
                  onChange={(e) => setNewSource({...newSource, content: e.target.value})}
                />
              </div>
              <Button onClick={handleAdd} className="w-full">Save to Library</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">Your Knowledge Base</CardTitle>
                <CardDescription>Active sources are used as context for all AI responses</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Database className="h-3 w-3 mr-1" />
                  {sourceLibrary.length} Sources
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {sourceLibrary.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <Database className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">Your library is empty</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                    Add sources manually or save URLs from the Chat or Factoids tabs.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {sourceLibrary.map((source) => (
                      <div key={source.id} className={`flex items-start justify-between p-4 border rounded-lg transition-colors ${source.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'}`}>
                        <div className="flex gap-4 items-start">
                          <div className={`mt-1 p-2 rounded-lg ${source.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {source.type === 'url' ? <Globe className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {source.origin?.startsWith('http') ? (
                                <a 
                                  href={source.origin} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="group flex items-center gap-2"
                                >
                                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors underline-offset-4 group-hover:underline">
                                    {source.title}
                                  </h4>
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                              ) : (
                                <h4 className="font-semibold">{source.title}</h4>
                              )}
                              <Badge variant="outline" className="text-[10px] py-0">{source.type.toUpperCase()}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Added {formatDate(source.createdAt)} • {source.origin || 'Manual entry'}</p>
                            <p className="text-sm text-foreground line-clamp-2 mt-2">{source.content}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-4 ml-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {source.isActive ? 'Active' : 'Disabled'}
                            </span>
                            <Switch 
                              checked={source.isActive} 
                              onCheckedChange={() => toggleSource(source.id)}
                            />
                          </div>
                          <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeSource(source.id)}>
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

          <Card className="bg-muted/50 border-dashed">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={hasActiveSources ? "bg-primary/10 p-3 rounded-full" : "bg-muted p-3 rounded-full"}>
                {hasActiveSources
                  ? <ShieldCheck className="h-6 w-6 text-primary" />
                  : <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                }
              </div>
              <div>
                <h4 className="font-semibold">
                  {hasActiveSources ? 'Deep Grounding is Active' : 'Deep Grounding is Disabled'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {hasActiveSources
                    ? 'The AI will automatically prioritize information from your active sources when generating cases or answering questions.'
                    : 'Enable at least one source to prioritize your library during case generation and chat.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
