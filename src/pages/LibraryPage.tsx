import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore, type Source } from '@/lib/stores/session-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Globe, FileText, Database, ShieldCheck, ShieldAlert, ExternalLink, Loader2, Link2, Upload, FolderPlus, Check, Search, Folder, Sparkles, X, Save, Copy, Pencil, FolderMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatEuropeanDate } from '@/lib/date-format';
import { importSourceFromUrl } from '@/lib/source-import';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { importSourceFile, SourceFileImportError } from '@/lib/source-file-import';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const SOURCE_LIST_HEIGHT = 600;

interface SourceRowProps {
  source: Source;
  onRemove: (source: Source) => void;
  onToggle: (id: string) => void;
  onOpen: (source: Source) => void;
  manualEntryLabel: string;
  folderLabel: string;
}

function SourceRow({
  source,
  onRemove,
  onToggle,
  onOpen,
  manualEntryLabel,
  folderLabel,
}: SourceRowProps) {
  const { t } = useTranslation();
  const sourceFolder = source.folder || 'General';
  const sourceFolderLabel = sourceFolder === 'General'
    ? t('libraryPage.generalFolder')
    : sourceFolder === 'Auto-saved'
      ? t('aiClient.autoSavedFolder')
      : sourceFolder;


  return (
    <div className="px-1 pb-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(source)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(source);
          }
        }}
        className={`flex h-[84px] cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors motion-list-item hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${source.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={`shrink-0 rounded-md p-1.5 ${source.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {source.type === 'url' ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {source.origin?.startsWith('http') ? (
                <a href={source.origin} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-foreground transition-colors hover:text-primary">
                  {source.title}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="truncate text-sm font-medium">{source.title}</span>
              )}
              <Badge variant="outline" className="shrink-0 py-0 text-[9px]">
                {t(`libraryPage.${source.type}Source`, source.type.toUpperCase())}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatEuropeanDate(source.createdAt)} • {source.origin || manualEntryLabel}</p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <Badge
                variant="secondary"
                className="shrink-0 max-w-[200px] truncate py-0 text-[10px]"
                title={`${folderLabel}: ${sourceFolderLabel}`}
              >
                <Folder className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{sourceFolderLabel}</span>
              </Badge>
              {source.metadata?.semantic?.lastUsedInCase && (
                <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 py-0 text-[10px] text-primary">
                  {t('sourceQuality.usedInCase')}
                </Badge>
              )}
              {source.metadata?.semantic && (
                <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                  {t('sourceQuality.importance', { level: t(`sourceQuality.levels.${source.metadata.semantic.importance}`) })}
                </Badge>
              )}
              {source.metadata?.semantic && (
                <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                  {t('sourceQuality.strength', { level: t(`sourceQuality.levels.${source.metadata.semantic.strength}`) })}
                </Badge>
              )}
              <span className="truncate text-[11px] text-muted-foreground">{source.content}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(source);
            }}
            aria-label={t('libraryPage.deleteSourceLabel', { title: source.title })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Switch
            checked={source.isActive}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => onToggle(source.id)}
            aria-label={t('libraryPage.toggleSourceLabel', { title: source.title })}
          />
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const { t } = useTranslation();
  const getFolderName = (folder: string) => folder === 'General'
    ? t('libraryPage.generalFolder')
    : folder === 'Auto-saved'
      ? t('aiClient.autoSavedFolder')
      : folder;
  const {
    sourceLibrary: allSources,
    sourceFolders,
    addSource,
    createSourceFolder,
    updateSource,
    renameSourceFolder,
    deleteSourceFolder,
    setFolderActive,
    removeSource,
    toggleSource,
    clearLibrary,
  } = useSessionStore();
  const { toast } = useToast();
  // The Library shows only the Current Debate's sources; switching debates switches the Library.
  const currentDebate = useCurrentDebate();
  const openDebateDialog = useDebateStore((state) => state.openDialog);
  const sourceLibrary = currentDebate ? allSources.filter((source) => source.debateId === currentDebate.id) : [];

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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [sortBy, setSortBy] = useState<'smart' | 'mostUsed' | 'importance' | 'strength' | 'newest' | 'oldest' | 'title' | 'folder'>('smart');
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<Pick<Source, 'title' | 'content' | 'type' | 'origin' | 'folder' | 'isActive'>>({
    title: '',
    content: '',
    type: 'text',
    origin: '',
    folder: 'General',
    isActive: true,
  });
  const [importPreview, setImportPreview] = useState<{
    title: string;
    content: string;
    type: Source['type'];
    origin: string;
    wordCount?: number;
    domain?: string;
    excerpt?: string;
    fileType?: string;
    warnings?: string[];
  } | null>(null);

  const handleAdd = async () => {
    if (!newSource.title || !newSource.content) {
      toast({ title: t('common.error'), description: t('libraryPage.errorRequired'), variant: "destructive" });
      return;
    }
    // The Library always shows the Current Debate, even while tools run one-off.
    await addSource({ ...newSource, debateId: currentDebate?.id ?? null });
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
    try {
      const imported = await importSourceFile(file);
      setImportPreview({
        title: imported.title,
        content: imported.content,
        type: 'file',
        origin: imported.origin,
        wordCount: imported.wordCount,
        fileType: imported.fileType.toUpperCase(),
        warnings: imported.warnings,
      });
    } catch (error) {
      const isSourceError = error instanceof SourceFileImportError;
      toast({
        title: isSourceError && error.code === 'unsupported'
          ? t('libraryPage.unsupportedFile', 'Unsupported file')
          : t('libraryPage.importFailed', 'Import failed'),
        description: isSourceError ? error.message : t('libraryPage.fileReadFailed'),
        variant: 'destructive',
      });
    }
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
      debateId: currentDebate?.id ?? null,
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
      toast({ title: t('common.error'), description: t('libraryPage.clearFailed'), variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const activeSourceCount = sourceLibrary.filter(source => source.isActive).length;
  const hasActiveSources = activeSourceCount > 0;
  // Folder names are account-wide; hide the ones only other debates use, but keep new empty ones.
  const otherDebateFolders = new Set(allSources.filter((source) => source.debateId !== currentDebate?.id).map((source) => source.folder || 'General'));
  const thisDebateFolders = sourceLibrary.map(s => s.folder || 'General').filter(Boolean);
  const folders = Array.from(new Set([
    ...(sourceFolders || ['General']).filter((folder) => folder === 'General' || !otherDebateFolders.has(folder) || thisDebateFolders.includes(folder)),
    ...thisDebateFolders,
  ])).sort();
  const folderKey = folders.join('\n');
  useEffect(() => {
    // A folder picked in another debate may not exist here.
    if (selectedFolder !== 'all' && !folderKey.split('\n').includes(selectedFolder)) setSelectedFolder('all');
  }, [folderKey, selectedFolder]);
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
    })
    .slice()
    .sort((a, b) => {
      const aSemantic = a.metadata?.semantic;
      const bSemantic = b.metadata?.semantic;
      switch (sortBy) {
        case 'smart':
          return Number(Boolean(bSemantic?.lastUsedInCase)) - Number(Boolean(aSemantic?.lastUsedInCase)) ||
            (bSemantic?.importance ?? 0) - (aSemantic?.importance ?? 0) ||
            (bSemantic?.strength ?? 0) - (aSemantic?.strength ?? 0) ||
            (b.metadata?.qualityScore ?? 0) - (a.metadata?.qualityScore ?? 0) ||
            b.createdAt - a.createdAt;
        case 'mostUsed':
          return (bSemantic?.useCount ?? 0) - (aSemantic?.useCount ?? 0) || b.createdAt - a.createdAt;
        case 'importance':
          return (bSemantic?.importance ?? 0) - (aSemantic?.importance ?? 0) || b.createdAt - a.createdAt;
        case 'strength':
          return (bSemantic?.strength ?? 0) - (aSemantic?.strength ?? 0) || b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'folder': {
          const folderCmp = (a.folder || 'General').localeCompare(b.folder || 'General');
          return folderCmp !== 0 ? folderCmp : (a.title || '').localeCompare(b.title || '');
        }
        case 'newest':
        default:
          return b.createdAt - a.createdAt;
      }
    });
  const selectedSource = selectedSourceId ? sourceLibrary.find((source) => source.id === selectedSourceId) || null : null;

  useEffect(() => {
    if (!selectedSource) return;
    setSourceDraft({
      title: selectedSource.title,
      content: selectedSource.content,
      type: selectedSource.type,
      origin: selectedSource.origin || '',
      folder: selectedSource.folder || 'General',
      isActive: selectedSource.isActive,
    });
  }, [selectedSource]);
  useEffect(() => {
    setFolderRenameValue(selectedFolder === 'all' ? '' : selectedFolder);
  }, [selectedFolder]);
  const handleCreateFolder = () => {
    const folder = newFolderName.trim();
    if (!folder) return;
    void createSourceFolder(folder);
    setNewSource({ ...newSource, folder });
    setSelectedFolder(folder);
    setNewFolderName('');
    setNewFolderOpen(false);
    toast({
      title: t('libraryPage.folderCreated', 'Folder created'),
      description: t('libraryPage.folderCreatedDesc', 'New sources can now be saved there.'),
    });
  };
  const handleRemoveSource = (source: Source) => {
    void Promise.resolve(removeSource(source.id)).then(() => {
      if (selectedSourceId === source.id) {
        setSelectedSourceId(null);
      }
      toast({ title: t('common.deleted', 'Deleted'), description: t('libraryPage.sourceDeleted', 'Source removed.') });
    });
  };
  const handleRenameFolder = async () => {
    if (selectedFolder === 'all' || selectedFolder === 'General') return;
    const nextName = folderRenameValue.trim();
    if (!nextName || nextName === selectedFolder) return;
    if (folders.includes(nextName) && !window.confirm(t('libraryPage.folderMergeConfirm', 'A folder with this name already exists. Merge sources into it?'))) return;
    await renameSourceFolder(selectedFolder, nextName);
    setSelectedFolder(nextName);
    toast({ title: t('libraryPage.folderRenamed', 'Folder renamed'), description: t('libraryPage.folderRenamedDesc', 'Sources in this folder were moved to the new name.') });
  };
  const handleDeleteSelectedFolder = async () => {
    if (selectedFolder === 'all' || selectedFolder === 'General') return;
    await deleteSourceFolder(selectedFolder, 'move-to-general');
    setSelectedFolder('General');
    toast({ title: t('libraryPage.folderDeleted', 'Folder deleted'), description: t('libraryPage.folderDeletedDesc', 'Sources were moved to General.') });
  };
  const handleSetSelectedFolderActive = async (isActive: boolean) => {
    if (selectedFolder === 'all') return;
    await setFolderActive(selectedFolder, isActive);
    toast({
      title: isActive ? t('libraryPage.folderActivated', 'Folder activated') : t('libraryPage.folderDeactivated', 'Folder deactivated'),
      description: isActive ? t('libraryPage.folderActivatedDesc', 'All sources in this folder are active.') : t('libraryPage.folderDeactivatedDesc', 'Sources stay saved but will not ground AI outputs.'),
    });
  };
  const handleSaveSourceDraft = async () => {
    if (!selectedSource) return;
    if (!sourceDraft.title.trim() || !sourceDraft.content.trim()) {
      toast({ title: t('common.error'), description: t('libraryPage.errorRequired'), variant: "destructive" });
      return;
    }

    await updateSource(selectedSource.id, {
      title: sourceDraft.title,
      content: sourceDraft.content,
      type: sourceDraft.type,
      origin: sourceDraft.origin,
      folder: sourceDraft.folder,
      isActive: sourceDraft.isActive,
    });
    toast({ title: t('libraryPage.sourceUpdated', 'Source updated'), description: t('libraryPage.sourceUpdatedDesc', 'Your source changes were saved.') });
  };
  const handleCopySource = async () => {
    if (!selectedSource) return;
    if (!navigator.clipboard?.writeText) {
      toast({ title: t('common.error', 'Error'), description: t('libraryPage.copyFailed', 'Unable to copy source.'), variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${selectedSource.title}\n\n${selectedSource.content}`);
      toast({ title: t('common.copied', 'Copied'), description: t('libraryPage.sourceCopied', 'Source copied to clipboard.') });
    } catch {
      toast({ title: t('common.error', 'Error'), description: t('libraryPage.copyFailed', 'Unable to copy source.'), variant: 'destructive' });
    }
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('libraryPage.title')}</h1>
            {currentDebate ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="library-debate">
                {t('debate.librarySources', 'Sources for')}{' '}
                <span className="break-words font-medium text-foreground">{currentDebate.motion}</span>{' '}
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openDebateDialog('switch')}>{t('debate.change', 'Change')}</Button>
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm" data-testid="library-debate">
                <span className="text-muted-foreground">{t('debate.libraryNeedsDebate', 'Select or create a debate before adding or importing sources.')}</span>
                <Button size="sm" onClick={() => openDebateDialog('create')}>{t('debate.startDebate', 'Start debate')}</Button>
                <Button size="sm" variant="outline" onClick={() => openDebateDialog('switch')}>{t('debate.switch', 'Switch debate')}</Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!currentDebate} onClick={() => setIsAdding(!isAdding)}>
                <Plus className="h-4 w-4 mr-1" /> {isAdding ? t('libraryPage.cancel') : t('libraryPage.addSource')}
              </Button>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger className="h-9 w-[160px]">
                  <Folder className="h-4 w-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('libraryPage.allFolders', 'All')}</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f} value={f}>{getFolderName(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={newFolderOpen} onOpenChange={setNewFolderOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t('libraryPage.newFolder', 'New folder')}
                  >
                    <FolderPlus className="h-4 w-4 mr-1" />
                    {t('libraryPage.newFolder', 'New folder')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72">
                  <div className="space-y-2">
                    <Label htmlFor="new-folder-input" className="text-sm">{t('libraryPage.newFolder', 'New folder')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="new-folder-input"
                        autoFocus
                        placeholder={t('libraryPage.newFolderPlaceholder', 'Folder name...')}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateFolder();
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                        aria-label={t('libraryPage.createFolder', 'Create folder')}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="h-9 w-[150px]" aria-label={t('libraryPage.sortBy', 'Sort by')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">{t('libraryPage.sortSmart', 'Smart')}</SelectItem>
                  <SelectItem value="mostUsed">{t('libraryPage.sortMostUsed', 'Most used')}</SelectItem>
                  <SelectItem value="importance">{t('libraryPage.sortImportance', 'Importance')}</SelectItem>
                  <SelectItem value="strength">{t('libraryPage.sortStrength', 'Evidence strength')}</SelectItem>
                  <SelectItem value="newest">{t('libraryPage.sortNewest', 'Date added (newest)')}</SelectItem>
                  <SelectItem value="oldest">{t('libraryPage.sortOldest', 'Date added (oldest)')}</SelectItem>
                  <SelectItem value="title">{t('libraryPage.sortTitle', 'Name (A–Z)')}</SelectItem>
                  <SelectItem value="folder">{t('libraryPage.sortFolder', 'Folder')}</SelectItem>
                </SelectContent>
              </Select>
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

        {isAdding && currentDebate && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('libraryPage.addNewTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Button type="button" variant="secondary" onClick={() => void handleImportUrl()} disabled={isImportingUrl} aria-label={t('libraryPage.importUrl')}>
                    {isImportingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('libraryPage.importUrlHelp', 'Auto import creates an editable draft. Review it before saving to your library.')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-file">{t('libraryPage.importFileLabel')}</Label>
                <Button asChild type="button" variant="outline" className="relative w-full justify-start overflow-hidden">
                  <label htmlFor="source-file" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('libraryPage.chooseFile')}
                    <input
                      id="source-file"
                      type="file"
                      accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => void handleFileImport(event.target.files?.[0])}
                    />
                  </label>
                </Button>
              </div>

              {importPreview && (
                <div className="space-y-3 rounded-lg border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('libraryPage.importPreview')}</p>
                      <p className="text-xs text-muted-foreground">
                        {[importPreview.domain || importPreview.fileType || importPreview.origin, importPreview.wordCount ? `${importPreview.wordCount} ${t('libraryPage.words')}` : null].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void handleSavePreview()}>
                      {t('libraryPage.saveImported')}
                    </Button>
                  </div>
                  {importPreview.excerpt && (
                    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{importPreview.excerpt}</p>
                  )}
                  {Boolean(importPreview.warnings?.length) && (
                    <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                      {importPreview.warnings?.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
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
                          <SelectItem key={f} value={f}>{getFolderName(f)}</SelectItem>
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
              <div className="space-y-2">
                <Label>{t('libraryPage.folder', 'Folder')}</Label>
                <Select value={newSource.folder} onValueChange={(f) => setNewSource({ ...newSource, folder: f })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['General', ...folders.filter(f => f !== 'General')].map((f) => (
                      <SelectItem key={f} value={f}>{getFolderName(f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('libraryPage.newFolderHint', 'Need a new folder? Use the "New folder" button up top.')}</p>
              </div>
              <Button onClick={() => void handleAdd()} className="w-full">{t('libraryPage.saveToLibrary')}</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="text-xl">{t('libraryPage.yourKBTitle')}</CardTitle>
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
                      {folder === 'all' ? t('libraryPage.allFolders', 'All folders') : getFolderName(folder)}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedFolder !== 'all' && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t('libraryPage.folderActions', 'Folder actions')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('libraryPage.folderActionsDesc', 'Rename, delete, or change grounding for every source in this folder.')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex gap-2">
                        <Input
                          aria-label={t('libraryPage.renameFolder', 'Rename folder')}
                          className="h-9 min-w-0 sm:w-44"
                          value={folderRenameValue}
                          disabled={selectedFolder === 'General'}
                          onChange={(event) => setFolderRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleRenameFolder();
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          disabled={selectedFolder === 'General' || !folderRenameValue.trim() || folderRenameValue.trim() === selectedFolder}
                          onClick={() => void handleRenameFolder()}
                          aria-label={t('libraryPage.renameFolder', 'Rename folder')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleSetSelectedFolderActive(true)}>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          {t('libraryPage.activateFolder', 'Activate')}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleSetSelectedFolderActive(false)}>
                          <ShieldAlert className="mr-2 h-4 w-4" />
                          {t('libraryPage.deactivateFolder', 'Deactivate')}
                        </Button>
                        {selectedFolder !== 'General' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="ghost" size="sm" className="text-destructive">
                                <FolderMinus className="mr-2 h-4 w-4" />
                                {t('common.delete', 'Delete')}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('libraryPage.deleteFolderTitle', 'Delete folder?')}</AlertDialogTitle>
                                <AlertDialogDescription>{t('libraryPage.deleteFolderDesc', 'Sources in this folder will move to General. The sources themselves will not be deleted.')}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleDeleteSelectedFolder()}>
                                  {t('common.delete', 'Delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
              ) : visibleSources.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <Database className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">{t('libraryPage.noMatchingSources', 'No matching sources')}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                    {t('libraryPage.noMatchingSourcesDesc', 'Try a different search or folder.')}
                  </p>
                </div>
              ) : (
                <div className="scrollbar-thin overflow-y-auto pr-1 stagger-enter" style={{ height: SOURCE_LIST_HEIGHT }}>
                  {visibleSources.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      onRemove={handleRemoveSource}
                      onToggle={toggleSource}
                      onOpen={(item: Source) => setSelectedSourceId(item.id)}
                      manualEntryLabel={t('libraryPage.manualEntry')}
                      folderLabel={t('libraryPage.folder', 'Folder')}
                    />
                  ))}
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
      <Sheet open={Boolean(selectedSource)} onOpenChange={(open) => !open && setSelectedSourceId(null)}>
        <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
          {selectedSource && (
            <>
              <SheetHeader className="border-b px-5 py-4 text-left">
                <div className="flex items-start gap-3 pr-8">
                  <div className={`rounded-md p-2 ${sourceDraft.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {sourceDraft.type === 'url' ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate">{sourceDraft.title || t('libraryPage.untitledSource', 'Untitled source')}</SheetTitle>
                    <SheetDescription className="mt-1">
                      {[getFolderName(sourceDraft.folder || 'General'), formatEuropeanDate(selectedSource.createdAt), `${sourceDraft.content.trim().split(/\s+/).filter(Boolean).length} ${t('libraryPage.words')}`].join(' • ')}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-4">
                  {selectedSource.metadata?.semantic && (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <p className="font-medium">
                        {selectedSource.metadata.semantic.lastUsedInCase
                          ? t('sourceQuality.usedInCase')
                          : t('sourceQuality.semanticAssessment')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('sourceQuality.usageExplanation', {
                          count: selectedSource.metadata.semantic.caseUseCount,
                          importance: t(`sourceQuality.levels.${selectedSource.metadata.semantic.importance}`),
                          strength: t(`sourceQuality.levels.${selectedSource.metadata.semantic.strength}`),
                        })}
                      </p>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="source-detail-title">{t('libraryPage.titleLabel')}</Label>
                    <Input
                      id="source-detail-title"
                      value={sourceDraft.title}
                      onChange={(event) => setSourceDraft({ ...sourceDraft, title: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('libraryPage.folder', 'Folder')}</Label>
                      <Select value={sourceDraft.folder || 'General'} onValueChange={(folder) => setSourceDraft({ ...sourceDraft, folder })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['General', ...folders.filter(f => f !== 'General')].map((folder) => (
                            <SelectItem key={folder} value={folder}>{getFolderName(folder)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('libraryPage.typeLabel', 'Type')}</Label>
                      <Select value={sourceDraft.type} onValueChange={(type) => setSourceDraft({ ...sourceDraft, type: type as Source['type'] })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t('libraryPage.textSource', 'Text')}</SelectItem>
                          <SelectItem value="url">{t('libraryPage.urlSource', 'URL')}</SelectItem>
                          <SelectItem value="file">{t('libraryPage.fileSource', 'File')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="source-detail-origin">{t('libraryPage.originLabel', 'Origin')}</Label>
                    <Input
                      id="source-detail-origin"
                      value={sourceDraft.origin || ''}
                      placeholder={t('libraryPage.originPlaceholder', 'URL, file name, or citation note')}
                      onChange={(event) => setSourceDraft({ ...sourceDraft, origin: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{t('libraryPage.useForGrounding', 'Use for AI grounding')}</p>
                      <p className="text-xs text-muted-foreground">{t('libraryPage.useForGroundingDesc', 'Inactive sources stay saved but are ignored by generation.')}</p>
                    </div>
                    <Switch
                      checked={sourceDraft.isActive}
                      onCheckedChange={(checked) => setSourceDraft({ ...sourceDraft, isActive: checked })}
                      aria-label={t('libraryPage.useForGrounding', 'Use for AI grounding')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="source-detail-content">{t('libraryPage.contentLabel')}</Label>
                    <Textarea
                      id="source-detail-content"
                      className="min-h-[320px] resize-y"
                      value={sourceDraft.content}
                      onChange={(event) => setSourceDraft({ ...sourceDraft, content: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <SheetFooter className="gap-2 border-t px-5 py-4 sm:justify-between sm:space-x-0">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void handleCopySource()}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('common.copy', 'Copy')}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common.delete', 'Delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('libraryPage.deleteSourceTitle', 'Delete source?')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('libraryPage.deleteSourceDesc', 'This removes the source from your synced library.')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRemoveSource(selectedSource)}>
                          {t('common.delete', 'Delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <Button type="button" onClick={() => void handleSaveSourceDraft()}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('common.save', 'Save')}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
