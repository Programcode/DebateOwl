import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DebateRequiredError, useSessionStore, type Source } from '@/lib/stores/session-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
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
      {/* The row is clickable for pointers; the title button is the keyboard and screen-reader target. */}
      <div
        onClick={() => onOpen(source)}
        className={`flex min-h-[84px] cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors motion-list-item hover:border-primary/40 hover:bg-accent/40 ${source.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={`shrink-0 rounded-md p-1.5 ${source.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {source.type === 'url' ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            {/* On a phone the title gets two lines of its own; one truncated line left a few letters. */}
            <div className="flex items-start gap-1.5 sm:items-center">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(source);
                }}
                className="line-clamp-2 min-w-0 break-words rounded-sm text-left text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:line-clamp-1"
              >
                {source.title}
              </button>
              {source.origin?.startsWith('http') && (
                <a
                  href={source.origin}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5 shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-primary sm:mt-0"
                  aria-label={t('libraryPage.openOrigin', { title: source.title, defaultValue: 'Open {{title}} in a new tab' })}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              {/* The row icon already shows the type; on a phone the title needs the room. */}
              <Badge variant="outline" className="hidden shrink-0 py-0 sm:inline-flex">
                {t(`libraryPage.${source.type}Source`, source.type.toUpperCase())}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{formatEuropeanDate(source.createdAt)} • {source.origin || manualEntryLabel}</p>
            {/* Badges wrap on narrow rows; the text preview only fits beside them on wider screens. */}
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="max-w-[200px] shrink-0 truncate py-0 font-medium"
                title={`${folderLabel}: ${sourceFolderLabel}`}
              >
                <Folder className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{sourceFolderLabel}</span>
              </Badge>
              {source.metadata?.semantic?.lastUsedInCase && (
                <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 py-0 font-medium text-primary">
                  {t('sourceQuality.usedInCase')}
                </Badge>
              )}
              {source.metadata?.semantic && (
                <Badge variant="outline" className="shrink-0 py-0 font-medium">
                  {t('sourceQuality.importance', { level: t(`sourceQuality.levels.${source.metadata.semantic.importance}`) })}
                </Badge>
              )}
              {source.metadata?.semantic && (
                <Badge variant="outline" className="shrink-0 py-0 font-medium">
                  {t('sourceQuality.strength', { level: t(`sourceQuality.levels.${source.metadata.semantic.strength}`) })}
                </Badge>
              )}
              <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:inline">{source.content}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive pointer-coarse:h-11 pointer-coarse:w-11"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(source);
            }}
            aria-label={t('libraryPage.deleteSourceLabel', { title: source.title })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={(event) => event.stopPropagation()}>
            {/* On touch the switch's own tap area grows to 44px tall, like the Checkbox's. */}
            <Switch
              className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
              checked={source.isActive}
              onCheckedChange={() => onToggle(source.id)}
              aria-label={t('libraryPage.toggleSourceLabel', { title: source.title })}
            />
          </div>
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
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [addErrors, setAddErrors] = useState<{ title?: string; content?: string }>({});
  const [draftErrors, setDraftErrors] = useState<{ title?: string; content?: string }>({});
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState(false);
  const addTitleRef = useRef<HTMLInputElement>(null);
  const addContentRef = useRef<HTMLTextAreaElement>(null);
  const draftTitleRef = useRef<HTMLInputElement>(null);
  const draftContentRef = useRef<HTMLTextAreaElement>(null);
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

  // Required fields are checked inline: the message sits under the field and focus moves to it.
  const requiredErrors = (title: string, content: string) => ({
    title: title.trim() ? undefined : t('libraryPage.titleRequired', 'Add a title.'),
    content: content.trim() ? undefined : t('libraryPage.contentRequired', 'Add the source text.'),
  });

  const handleAdd = async () => {
    const errors = requiredErrors(newSource.title, newSource.content);
    setAddErrors(errors);
    if (errors.title) return addTitleRef.current?.focus();
    if (errors.content) return addContentRef.current?.focus();
    // The Library always shows the Current Debate, even while tools run one-off.
    try {
      await addSource({ ...newSource, debateId: currentDebate?.id ?? null });
    } catch (error) {
      toast({
        title: t('libraryPage.saveFailed', 'Could not save this source.'),
        description: error instanceof DebateRequiredError
          ? t('debate.sourceNeedsDebate', 'Start or select a debate before saving sources.')
          : undefined,
        variant: 'destructive',
      });
      return;
    }
    setNewSource({ title: '', content: '', type: 'text', origin: '', folder: newSource.folder });
    setIsAdding(false);
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

  const handleFileImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setIsImportingFile(true);
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
    } finally {
      setIsImportingFile(false);
      // Reset so picking the same file again fires a change.
      input.value = '';
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
    setDraftErrors({});
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
  };
  // A source can be put back exactly, so deleting acts at once and offers Undo instead of asking first.
  const handleRemoveSource = (source: Source) => {
    if (selectedSourceId === source.id) setSelectedSourceId(null);
    void Promise.resolve(removeSource(source.id)).then(() => {
      toast({
        title: t('libraryPage.sourceDeletedTitle', { title: source.title, defaultValue: 'Deleted {{title}}' }),
        action: {
          label: t('common.undo', 'Undo'),
          onClick: () => {
            void addSource({
              id: source.id,
              createdAt: source.createdAt,
              title: source.title,
              content: source.content,
              type: source.type,
              origin: source.origin,
              folder: source.folder,
              isActive: source.isActive,
              metadata: source.metadata,
              debateId: source.debateId ?? null,
            }).catch(() => toast({ title: t('libraryPage.restoreFailed', 'Could not restore the source'), variant: 'destructive' }));
          },
        },
      });
    }).catch(() => {
      toast({ title: t('common.error', 'Error'), description: t('libraryPage.deleteFailed', 'Could not delete the source.'), variant: 'destructive' });
    });
  };
  const renameFolderTo = async (from: string, nextName: string) => {
    await renameSourceFolder(from, nextName);
    setSelectedFolder(nextName);
    toast({ title: t('libraryPage.folderRenamed', 'Folder renamed'), description: t('libraryPage.folderRenamedDesc', 'Sources in this folder were moved to the new name.') });
  };
  const handleRenameFolder = async () => {
    if (selectedFolder === 'all' || selectedFolder === 'General') return;
    const nextName = folderRenameValue.trim();
    if (!nextName || nextName === selectedFolder) return;
    // Merging into an existing folder can't be split again, so it asks first.
    if (folders.includes(nextName)) {
      setMergeTarget(nextName);
      return;
    }
    await renameFolderTo(selectedFolder, nextName);
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
  };
  const handleSaveSourceDraft = async () => {
    if (!selectedSource) return;
    const errors = requiredErrors(sourceDraft.title, sourceDraft.content);
    setDraftErrors(errors);
    if (errors.title) return draftTitleRef.current?.focus();
    if (errors.content) return draftContentRef.current?.focus();

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
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">{t('libraryPage.title')}</h1>
            {currentDebate ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground" data-testid="library-debate">
                  {t('debate.librarySources', 'Sources for')}{' '}
                  <span className="break-words font-medium text-foreground">{currentDebate.motion}</span>{' '}
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openDebateDialog('switch')}>{t('debate.change', 'Change')}</Button>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('libraryPage.summary', { total: sourceLibrary.length, active: activeSourceCount, folders: folders.length, defaultValue: '{{total}} sources · {{active}} active · {{folders}} folders' })}
                </p>
              </>
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
                <SelectTrigger className="h-9 w-[180px]" aria-label={t('libraryPage.sortBy', 'Sort by')}>
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
                <Button variant="ghost" size="sm" className="text-destructive" disabled={isClearing}>
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
                  <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={() => void handleClearLibrary()}>
                    {t('libraryPage.clearAll')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
              {/* One folder for whatever this form saves, imported or typed. */}
              <div className="space-y-2">
                <Label htmlFor="new-source-folder">{t('libraryPage.folder', 'Folder')}</Label>
                <Select value={newSource.folder} onValueChange={(f) => setNewSource({ ...newSource, folder: f })}>
                  <SelectTrigger id="new-source-folder">
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
                {/* The real input is invisible, so the label shows its focus ring. */}
                <Button asChild type="button" variant="outline" className="relative w-full justify-start overflow-hidden has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                  <label htmlFor="source-file" className="cursor-pointer" aria-busy={isImportingFile}>
                    {isImportingFile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isImportingFile ? t('libraryPage.readingFile', 'Reading file…') : t('libraryPage.chooseFile')}
                    <input
                      id="source-file"
                      type="file"
                      disabled={isImportingFile}
                      accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => void handleFileImport(event.currentTarget)}
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
                <Label htmlFor="new-source-title">{t('libraryPage.titleLabel')}</Label>
                <Input
                  id="new-source-title"
                  ref={addTitleRef}
                  placeholder={t('libraryPage.titlePlaceholder')}
                  value={newSource.title}
                  aria-invalid={Boolean(addErrors.title)}
                  aria-describedby={addErrors.title ? 'new-source-title-error' : undefined}
                  onChange={(e) => {
                    setNewSource({ ...newSource, title: e.target.value });
                    if (addErrors.title) setAddErrors({ ...addErrors, title: undefined });
                  }}
                />
                {addErrors.title && <p id="new-source-title-error" role="alert" className="text-sm text-destructive">{addErrors.title}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-source-content">{t('libraryPage.contentLabel')}</Label>
                <Textarea
                  id="new-source-content"
                  ref={addContentRef}
                  placeholder={t('libraryPage.contentPlaceholder')}
                  className="min-h-[120px]"
                  value={newSource.content}
                  aria-invalid={Boolean(addErrors.content)}
                  aria-describedby={addErrors.content ? 'new-source-content-error' : undefined}
                  onChange={(e) => {
                    setNewSource({ ...newSource, content: e.target.value });
                    if (addErrors.content) setAddErrors({ ...addErrors, content: undefined });
                  }}
                />
                {addErrors.content && <p id="new-source-content-error" role="alert" className="text-sm text-destructive">{addErrors.content}</p>}
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
                <CardTitle>{t('libraryPage.yourKBTitle')}</CardTitle>
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
                <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label={t('libraryPage.folder', 'Folder')}>
                  {['all', ...folders].map((folder) => (
                    <Button
                      key={folder}
                      type="button"
                      variant={selectedFolder === folder ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={selectedFolder === folder}
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
                // Phones scroll the page; only wide screens get a bounded inner list.
                <div className="lg:max-h-[600px] lg:overflow-y-auto lg:pr-1">
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
      <AlertDialog open={mergeTarget !== null} onOpenChange={(open) => { if (!open && !merging) { setMergeTarget(null); setMergeError(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('libraryPage.mergeFolderTitle', { name: mergeTarget ?? '', defaultValue: 'Merge into {{name}}?' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('libraryPage.folderMergeConfirm', 'A folder with this name already exists. Merge sources into it?')}</AlertDialogDescription>
          </AlertDialogHeader>
          {mergeError && (
            <p role="alert" className="text-sm text-destructive">{t('libraryPage.mergeFailed', 'Could not merge the folders. Try again.')}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={merging}
              onClick={(event) => {
                // Stays open while the write is pending and closes only once it lands.
                event.preventDefault();
                if (!mergeTarget) return;
                setMerging(true);
                setMergeError(false);
                renameFolderTo(selectedFolder, mergeTarget)
                  .then(() => setMergeTarget(null))
                  .catch(() => setMergeError(true))
                  .finally(() => setMerging(false));
              }}
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('libraryPage.mergeFolders', 'Merge folders')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                      ref={draftTitleRef}
                      value={sourceDraft.title}
                      aria-invalid={Boolean(draftErrors.title)}
                      aria-describedby={draftErrors.title ? 'source-detail-title-error' : undefined}
                      onChange={(event) => {
                        setSourceDraft({ ...sourceDraft, title: event.target.value });
                        if (draftErrors.title) setDraftErrors({ ...draftErrors, title: undefined });
                      }}
                    />
                    {draftErrors.title && <p id="source-detail-title-error" role="alert" className="text-sm text-destructive">{draftErrors.title}</p>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="source-detail-folder">{t('libraryPage.folder', 'Folder')}</Label>
                      <Select value={sourceDraft.folder || 'General'} onValueChange={(folder) => setSourceDraft({ ...sourceDraft, folder })}>
                        <SelectTrigger id="source-detail-folder">
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
                      <Label htmlFor="source-detail-type">{t('libraryPage.typeLabel', 'Type')}</Label>
                      <Select value={sourceDraft.type} onValueChange={(type) => setSourceDraft({ ...sourceDraft, type: type as Source['type'] })}>
                        <SelectTrigger id="source-detail-type">
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
                      ref={draftContentRef}
                      className="min-h-[320px] resize-y"
                      value={sourceDraft.content}
                      aria-invalid={Boolean(draftErrors.content)}
                      aria-describedby={draftErrors.content ? 'source-detail-content-error' : undefined}
                      onChange={(event) => {
                        setSourceDraft({ ...sourceDraft, content: event.target.value });
                        if (draftErrors.content) setDraftErrors({ ...draftErrors, content: undefined });
                      }}
                    />
                    {draftErrors.content && <p id="source-detail-content-error" role="alert" className="text-sm text-destructive">{draftErrors.content}</p>}
                  </div>
                </div>
              </div>
              <SheetFooter className="gap-2 border-t px-5 py-4 sm:justify-between sm:space-x-0">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void handleCopySource()}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('common.copy', 'Copy')}
                  </Button>
                  <Button type="button" variant="ghost" className="text-destructive" onClick={() => handleRemoveSource(selectedSource)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('common.delete', 'Delete')}
                  </Button>
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
