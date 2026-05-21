import { useState, type AriaAttributes, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { List } from 'react-window';
import { useSessionStore, type Source } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Globe, FileText, Database, ShieldCheck, ShieldAlert, ExternalLink, Loader2, Link2, Upload, FolderPlus, Check, Search, Folder, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SOURCE_ROW_HEIGHT = 92;
const SOURCE_LIST_HEIGHT = 600;

interface SourceRowProps {
  sources: Source[];
  onRemove: (source: Source) => void;
  onToggle: (id: string) => void;
  manualEntryLabel: string;
  folderLabel: string;
}

function SourceRow({
  index,
  style,
  sources,
  onRemove,
  onToggle,
  manualEntryLabel,
  folderLabel,
  ariaAttributes,
}: SourceRowProps & { index: number; style: CSSProperties; ariaAttributes: AriaAttributes }) {
  const source = sources[index];
  if (!source) return null;

  return (
    <div style={style} {...ariaAttributes} className="px-1 pb-2">
      <div className={`flex h-[84px] items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors motion-list-item ${source.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className={`shrink-0 rounded-md p-1.5 ${source.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {source.type === 'url' ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {source.origin?.startsWith('http') ? (
                <a href={source.origin} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-foreground transition-colors hover:text-primary">
                  {source.title}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="truncate text-sm font-medium">{source.title}</span>
              )}
              <Badge variant="outline" className="shrink-0 py-0 text-[9px]">{source.type.toUpperCase()}</Badge>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatEuropeanDate(source.createdAt)} • {source.origin || manualEntryLabel}</p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <Badge variant="secondary" className="max-w-[140px] truncate py-0 text-[10px]">
                <Folder className="mr-1 h-3 w-3" />
                {folderLabel}: {source.folder || 'General'}
              </Badge>
              <span className="truncate text-[11px] text-muted-foreground">{source.content}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onRemove(source)}
            aria-label={`Delete ${source.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Switch
            checked={source.isActive}
            onCheckedChange={() => onToggle(source.id)}
            aria-label={`Toggle ${source.title}`}
          />
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const { t } = useTranslation();
  const { sourceLibrary, sourceFolders, addSource, createSourceFolder, removeSource, toggleSource, clearLibrary } = useSessionStore();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [newSource, setNewSource] = useState({
    title: '',
    content: '',
    type: 'text' as Source['type'],
    origin: '',
    folder: 'General',
  });
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    title: string;
    content: string;
    type: Source['type'];
    origin: string;
    wordCount?: number;
    domain?: string;
    excerpt?: string;
  } | null>(null);

  const handleAdd = async () => {
    if (!newSource.title || !newSource.content) {
      toast({ title: "Error", description: t('libraryPage.errorRequired'), variant: "destructive" });
      return;
    }
    await addSource(newSource);
    setNewSource({ title: '', content: '', type: 'text', origin: '', folder: newSource.folder });
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
        excerpt: imported.excerpt,
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
    const supportedTextTypes = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
    const supportedExtensions = new Set(['txt', 'md', 'markdown', 'csv', 'json']);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.type && !file.type.startsWith('text/') && !supportedTextTypes.has(file.type) && !supportedExtensions.has(extension)) {
      toast({ title: t('libraryPage.unsupportedFile', 'Unsupported file'), description: t('libraryPage.unsupportedFileDesc', 'Import plain text, Markdown, CSV, or JSON. PDF/DOCX parsing is not reliable here yet.'), variant: 'destructive' });
      return;
    }
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
    if (trimmedOrigin && sourceLibrary.some(existing => existing.origin?.trim().toLowerCase() === trimmedOrigin.toLowerCase())) {
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
      folder: newSource.folder,
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
  const folders = Array.from(new Set([
    ...(sourceFolders || ['General']),
    ...sourceLibrary.map(s => s.folder || 'General').filter(Boolean),
  ])).sort();
  const visibleSources = sourceLibrary
    .filter((source) => selectedFolder === 'all' || (source.folder || 'General') === selectedFolder)
    .filter((source) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return [
        source.title,
        source.content,
        source.origin || '',
        source.folder || 'General',
      ].some((value) => value.toLowerCase().includes(query));
    });
  const handleCreateFolder = () => {
    const folder = newFolderName.trim();
    if (!folder) return;
    void createSourceFolder(folder);
    setNewSource({ ...newSource, folder });
    setSelectedFolder(folder);
    setNewFolderName('');
    toast({
      title: t('libraryPage.folderCreated', 'Folder created'),
      description: t('libraryPage.folderCreatedDesc', 'New sources can now be saved there.'),
    });
  };
  const handleRemoveSource = (source: Source) => {
    void Promise.resolve(removeSource(source.id)).then(() => {
      toast({ title: t('common.deleted', 'Deleted'), description: t('libraryPage.sourceDeleted', 'Source removed.') });
    });
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('libraryPage.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('libraryPage.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
                <Plus className="h-4 w-4 mr-1" /> {isAdding ? t('libraryPage.cancel') : t('libraryPage.addSource')}
              </Button>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger className="h-9 w-[140px]">
                  <FolderPlus className="h-4 w-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('libraryPage.allFolders', 'All')}</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Input
                  aria-label={t('libraryPage.newFolder', 'New Folder')}
                  className="h-9 w-36"
                  placeholder={t('libraryPage.newFolderPlaceholder', 'Folder name...')}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  aria-label={t('libraryPage.createFolder', 'Create folder')}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
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

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{t('libraryPage.totalSources', 'Total sources')}</p>
            <p className="mt-1 text-2xl font-semibold">{sourceLibrary.length}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{t('libraryPage.activeSources', 'Active sources')}</p>
            <p className="mt-1 text-2xl font-semibold">{activeSourceCount}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{t('libraryPage.syncedFolders', 'Synced folders')}</p>
            <p className="mt-1 text-2xl font-semibold">{folders.length}</p>
          </div>
        </div>

        {isAdding && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('libraryPage.addNewTitle')}
              </CardTitle>
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
                  <p className="text-xs text-muted-foreground">{t('libraryPage.importUrlHelp', 'Auto import creates an editable draft. Review it before saving to your library.')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-file">{t('libraryPage.importFileLabel')}</Label>
                  <Button type="button" variant="outline" className="relative w-full overflow-hidden lg:w-44">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('libraryPage.chooseFile')}
                    <input
                      id="source-file"
                      type="file"
                      accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => void handleFileImport(event.target.files?.[0])}
                    />
                  </Button>
                </div>
              </div>

              {importPreview && (
                <div className="space-y-3 rounded-lg border bg-background p-4">
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
                  {importPreview.excerpt && (
                    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{importPreview.excerpt}</p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="import-title">{t('libraryPage.titleLabel')}</Label>
                    <Input
                      id="import-title"
                      value={importPreview.title}
                      onChange={(e) => setImportPreview({ ...importPreview, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('libraryPage.folder', 'Folder')}</Label>
                    <Select value={newSource.folder} onValueChange={(f) => setNewSource({ ...newSource, folder: f })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['General', ...folders.filter(f => f !== 'General')].map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase text-muted-foreground">{t('libraryPage.manualSource', 'Manual source')}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                <Label>{t('libraryPage.titleLabel')}</Label>
                <Input
                  placeholder={t('libraryPage.titlePlaceholder')}
                  value={newSource.title}
                  onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('libraryPage.contentLabel')}</Label>
                <Textarea
                  placeholder={t('libraryPage.contentPlaceholder')}
                  className="min-h-[120px]"
                  value={newSource.content}
                  onChange={(e) => setNewSource({ ...newSource, content: e.target.value })}
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                  <Label>{t('libraryPage.folder', 'Folder')}</Label>
                  <div className="flex gap-2">
                    <Select value={newSource.folder} onValueChange={(f) => setNewSource({ ...newSource, folder: f })}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['General', ...folders.filter(f => f !== 'General')].map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={t('libraryPage.newFolderPlaceholder', 'New folder...')}
                      className="w-36"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      aria-label={t('libraryPage.createFolder', 'Create folder')}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button onClick={() => void handleAdd()} className="w-full">{t('libraryPage.saveToLibrary')}</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="text-xl">{t('libraryPage.yourKBTitle')}</CardTitle>
                <CardDescription>{t('libraryPage.yourKBDesc')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Database className="h-3 w-3 mr-1" />
                  {visibleSources.length} {t('libraryPage.sourcesCount')}
                </Badge>
              </div>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 pr-9"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('libraryPage.searchPlaceholder', 'Search sources, folders, or content...')}
                    aria-label={t('libraryPage.searchSources', 'Search sources')}
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setSearchQuery('')}
                      aria-label={t('common.clear', 'Clear')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {['all', ...folders].map((folder) => (
                    <Button
                      key={folder}
                      type="button"
                      variant={selectedFolder === folder ? 'default' : 'outline'}
                      size="sm"
                      className="shrink-0"
                      onClick={() => setSelectedFolder(folder)}
                    >
                      {folder === 'all' ? t('libraryPage.allFolders', 'All folders') : folder}
                    </Button>
                  ))}
                </div>
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
                <div className="h-[600px] pr-1 stagger-enter">
                  <List
                    rowComponent={SourceRow}
                    rowCount={visibleSources.length}
                    rowHeight={SOURCE_ROW_HEIGHT}
                    rowProps={{
                      sources: visibleSources,
                      onRemove: handleRemoveSource,
                      onToggle: toggleSource,
                      manualEntryLabel: t('libraryPage.manualEntry'),
                      folderLabel: t('libraryPage.folder', 'Folder'),
                    }}
                    overscanCount={8}
                    className="scrollbar-thin"
                    style={{ height: SOURCE_LIST_HEIGHT }}
                  />
                </div>
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
