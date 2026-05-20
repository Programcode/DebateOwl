import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore, type Source } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Globe, FileText, Database, ShieldCheck, ShieldAlert, ExternalLink, Loader2, Link2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatEuropeanDate } from '@/lib/date-format';
import { importSourceFromUrl } from '@/lib/source-import';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    title: string;
    content: string;
    type: Source['type'];
    origin: string;
    wordCount?: number;
    domain?: string;
  } | null>(null);

  const handleAdd = async () => {
    if (!newSource.title || !newSource.content) {
      toast({ title: "Error", description: t('libraryPage.errorRequired'), variant: "destructive" });
      return;
    }
    await addSource(newSource);
    setNewSource({ title: '', content: '', type: 'text', origin: '' });
    setIsAdding(false);
    toast({ title: t('libraryPage.sourceAdded'), description: t('libraryPage.sourceAddedDesc') });
  };

  const handleImportUrl = async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl) {
      toast({ title: t('libraryPage.importUrlRequired'), variant: "destructive" });
      return;
    }

    setIsImportingUrl(true);
    try {
      const imported = await importSourceFromUrl(trimmedUrl);
      setImportPreview({
        title: imported.title,
        content: imported.content,
        type: 'url',
        origin: imported.url,
        wordCount: imported.wordCount,
        domain: imported.domain,
      });
      toast({ title: t('libraryPage.importReady'), description: t('libraryPage.importReadyDesc') });
    } catch (error) {
      toast({
        title: t('libraryPage.importFailed'),
        description: error instanceof Error ? error.message : t('libraryPage.importFailedDesc'),
        variant: "destructive",
      });
    } finally {
      setIsImportingUrl(false);
    }
  };

  const handleFileImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 250_000) {
      toast({ title: t('libraryPage.fileTooLarge'), description: t('libraryPage.fileTooLargeDesc'), variant: "destructive" });
      return;
    }

    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(t('libraryPage.fileReadFailed')));
      reader.readAsText(file);
    });
    const content = text.trim();
    if (!content) {
      toast({ title: t('libraryPage.fileEmpty'), variant: "destructive" });
      return;
    }

    setImportPreview({
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
      content,
      type: 'file',
      origin: file.name,
      wordCount: content.split(/\s+/).filter(Boolean).length,
    });
  };

  const handleSavePreview = async () => {
    if (!importPreview?.title || !importPreview.content) return;
    const trimmedOrigin = importPreview.origin?.trim();
    if (trimmedOrigin && sourceLibrary.some(existing => existing.origin?.trim() === trimmedOrigin)) {
      toast({
        title: t('libraryPage.duplicateSource', 'Source already in library'),
        description: t('libraryPage.duplicateSourceDesc', 'This URL or file is already saved.'),
        variant: 'destructive',
      });
      return;
    }
    await addSource({
      title: importPreview.title.trim(),
      content: importPreview.content.trim(),
      type: importPreview.type,
      origin: importPreview.origin,
    });
    setImportPreview(null);
    setImportUrl('');
    setIsAdding(false);
    toast({ title: t('libraryPage.sourceAdded'), description: t('libraryPage.sourceAddedDesc') });
  };

  const handleClearLibrary = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await Promise.resolve(clearLibrary());
      toast({ title: t('common.deleted', 'Deleted'), description: t('libraryPage.clearSuccess', 'Library cleared.') });
    } catch (error) {
      console.error('Failed to clear library:', error);
      toast({ title: "Error", description: t('libraryPage.clearFailed'), variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const activeSourceCount = sourceLibrary.filter(source => source.isActive).length;
  const hasActiveSources = activeSourceCount > 0;
  const handleRemoveSource = (source: Source) => {
    void Promise.resolve(removeSource(source.id)).then(() => {
      toast({ title: t('common.deleted', 'Deleted'), description: t('libraryPage.sourceDeleted', 'Source removed.') });
    });
  };

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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive" disabled={isClearing}>
                  <Trash2 className="h-4 w-4 mr-2" /> {isClearing ? t('libraryPage.clearing') : t('libraryPage.clearAll')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('libraryPage.clearAll')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('libraryPage.clearConfirm')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleClearLibrary()}>
                    {t('libraryPage.clearAll')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {isAdding && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>{t('libraryPage.addNewTitle')}</CardTitle>
              <CardDescription>{t('libraryPage.addNewDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="source-url">{t('libraryPage.importUrlLabel')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="source-url"
                      placeholder={t('libraryPage.importUrlPlaceholder')}
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleImportUrl();
                      }}
                    />
                    <Button type="button" variant="secondary" onClick={() => void handleImportUrl()} disabled={isImportingUrl}>
                      {isImportingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      <span className="sr-only">{t('libraryPage.importUrl')}</span>
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-file">{t('libraryPage.importFileLabel')}</Label>
                  <Button type="button" variant="outline" className="relative w-full overflow-hidden lg:w-44">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('libraryPage.chooseFile')}
                    <input
                      id="source-file"
                      type="file"
                      accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => void handleFileImport(event.target.files?.[0])}
                    />
                  </Button>
                </div>
              </div>

              {importPreview && (
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('libraryPage.importPreview')}</p>
                      <p className="text-xs text-muted-foreground">
                        {[importPreview.domain || importPreview.origin, importPreview.wordCount ? `${importPreview.wordCount} ${t('libraryPage.words')}` : null].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void handleSavePreview()}>
                      {t('libraryPage.saveImported')}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="import-title">{t('libraryPage.titleLabel')}</Label>
                    <Input
                      id="import-title"
                      value={importPreview.title}
                      onChange={(e) => setImportPreview({ ...importPreview, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="import-content">{t('libraryPage.contentLabel')}</Label>
                    <Textarea
                      id="import-content"
                      className="min-h-[180px]"
                      value={importPreview.content}
                      onChange={(e) => setImportPreview({ ...importPreview, content: e.target.value })}
                    />
                  </div>
                </div>
              )}

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
              <Button onClick={() => void handleAdd()} className="w-full">{t('libraryPage.saveToLibrary')}</Button>
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
                            onClick={() => handleRemoveSource(source)}
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
