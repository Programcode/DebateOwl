import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatEuropeanDate } from '@/lib/date-format';

export default function LibraryPage() {
  const { t } = useTranslation();
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
      toast({ title: "Error", description: t('libraryPage.errorRequired'), variant: "destructive" });
      return;
    }
    addSource(newSource);
    setNewSource({ title: '', content: '', type: 'text', origin: '' });
    setIsAdding(false);
    toast({ title: t('libraryPage.sourceAdded'), description: t('libraryPage.sourceAddedDesc') });
  };

  const handleClearLibrary = async () => {
    if (isClearing) return;
    const confirmed = window.confirm(t('libraryPage.clearConfirm'));
    if (!confirmed) return;
    setIsClearing(true);
    try {
      await Promise.resolve(clearLibrary());
    } catch (error) {
      console.error('Failed to clear library:', error);
      toast({ title: "Error", description: t('libraryPage.clearFailed'), variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const activeSourceCount = sourceLibrary.filter(source => source.isActive).length;
  const hasActiveSources = activeSourceCount > 0;

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('libraryPage.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('libraryPage.subtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsAdding(!isAdding)}>
              <Plus className="h-4 w-4 mr-2" /> {isAdding ? t('libraryPage.cancel') : t('libraryPage.addSource')}
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={handleClearLibrary} disabled={isClearing}>
              <Trash2 className="h-4 w-4 mr-2" /> {isClearing ? t('libraryPage.clearing') : t('libraryPage.clearAll')}
            </Button>
          </div>
        </div>

        {isAdding && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>{t('libraryPage.addNewTitle')}</CardTitle>
              <CardDescription>{t('libraryPage.addNewDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('libraryPage.titleLabel')}</Label>
                  <Input
                    placeholder={t('libraryPage.titlePlaceholder')}
                    value={newSource.title}
                    onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('libraryPage.originLabel')}</Label>
                  <Input
                    placeholder={t('libraryPage.originPlaceholder')}
                    value={newSource.origin}
                    onChange={(e) => setNewSource({ ...newSource, origin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('libraryPage.contentLabel')}</Label>
                <Textarea
                  placeholder={t('libraryPage.contentPlaceholder')}
                  className="min-h-[200px]"
                  value={newSource.content}
                  onChange={(e) => setNewSource({ ...newSource, content: e.target.value })}
                />
              </div>
              <Button onClick={handleAdd} className="w-full">{t('libraryPage.saveToLibrary')}</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">{t('libraryPage.yourKBTitle')}</CardTitle>
                <CardDescription>{t('libraryPage.yourKBDesc')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Database className="h-3 w-3 mr-1" />
                  {sourceLibrary.length} {t('libraryPage.sourcesCount')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {sourceLibrary.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <Database className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">{t('libraryPage.emptyTitle')}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                    {t('libraryPage.emptyDesc')}
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
                            <p className="text-xs text-muted-foreground">{t('libraryPage.added')} {formatEuropeanDate(source.createdAt)} • {source.origin || t('libraryPage.manualEntry')}</p>
                            <p className="text-sm text-foreground line-clamp-2 mt-2">{source.content}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-4 ml-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {source.isActive ? t('libraryPage.active') : t('libraryPage.disabled')}
                            </span>
                            <Switch
                              checked={source.isActive}
                              onCheckedChange={() => toggleSource(source.id)}
                              aria-label={`Toggle ${source.title} in knowledge base`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive h-8 w-8"
                            onClick={() => removeSource(source.id)}
                            aria-label={`Delete ${source.title}`}
                          >
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
                  {hasActiveSources ? t('libraryPage.groundingActive') : t('libraryPage.groundingDisabled')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {hasActiveSources ? t('libraryPage.groundingActiveDesc') : t('libraryPage.groundingDisabledDesc')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
