import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, buttonVariants } from '@/components/ui/button';
import { Trash2, Eye, MessageCircle, FileText, Zap, Brain, BookOpen, Dumbbell, Flame, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatEuropeanDateTime } from '@/lib/date-format';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { useDebateStore } from '@/lib/stores/debate-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UnsortedWork } from '@/components/features/debate/UnsortedWork';
import { PageHeader } from '@/components/layout/PageHeader';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { parseSavedCrossfire, SavedCrossfireView } from '@/components/features/crossfire/SavedCrossfireView';

/** History scope value for work that belongs to no debate. */
const OUTSIDE_DEBATES = 'outside';

const HISTORY_TABS = ['cases', 'chats', 'attacks', 'brainstorms', 'factoids', 'sparring', 'crossfire'] as const;
type HistoryTab = (typeof HISTORY_TABS)[number];
const isHistoryTab = (value: string | null): value is HistoryTab => HISTORY_TABS.includes(value as HistoryTab);

// Lists scroll with the page on phones; wide screens get a bounded inner list.
const LIST_CLASS = 'space-y-4 lg:max-h-[500px] lg:overflow-y-auto lg:pr-4';
// Phones wrap the tabs onto more lines instead of a sideways scroll, each one a 44px target.
const TAB_CLASS = 'min-h-11 gap-2 sm:min-h-0';

export default function HistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const debates = useDebateStore((state) => state.debates);
  const currentDebateId = useDebateStore((state) => state.currentDebateId);
  // History defaults to the Current Debate; other debates and one-off work stay reachable.
  const [scopeChoice, setScopeChoice] = useState<string | null>(null);
  const scope = scopeChoice && (scopeChoice === OUTSIDE_DEBATES || debates.some((debate) => debate.id === scopeChoice))
    ? scopeChoice
    : currentDebateId ?? OUTSIDE_DEBATES;
  const inScope = <T extends { debateId?: string | null }>(items: T[]) => items.filter((item) => item.debateId === scope);
  const savedCases = inScope(store.savedCases);
  const savedChats = inScope(store.savedChats);
  const savedAttacks = inScope(store.savedAttacks);
  const savedBrainstorms = inScope(store.savedBrainstorms);
  const savedFactoids = inScope(store.savedFactoids);
  const savedCrossfires = inScope(store.savedCrossfires);
  const sparringSessions = inScope(useSparringStore((state) => state.savedSessions));
  const hydrateSparringSessions = useSparringStore((state) => state.hydrateSavedSessions);
  const loadSparringSession = useSparringStore((state) => state.loadSavedSession);
  const deleteSparringSession = useSparringStore((state) => state.deleteSavedSession);
  const { toast } = useToast();
  // The open tab lives in the URL, so Back from a loaded item returns to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: HistoryTab = isHistoryTab(tabParam) ? tabParam : 'cases';
  const setTab = (value: string) => {
    if (!isHistoryTab(value)) return;
    setSearchParams((params) => {
      params.set('tab', value);
      return params;
    }, { replace: true });
  };
  const [caseToDelete, setCaseToDelete] = useState<{ id: string; title: string } | null>(null);
  const [sparringSessionToDelete, setSparringSessionToDelete] = useState<{ id: string; motion: string } | null>(null);
  const [openCrossfireId, setOpenCrossfireId] = useState<string | null>(null);
  const [crossfireToDelete, setCrossfireToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingCrossfire, setDeletingCrossfire] = useState(false);
  const [crossfireDeleteError, setCrossfireDeleteError] = useState(false);
  const openCrossfire = openCrossfireId ? store.savedCrossfires.find((item) => item.id === openCrossfireId) ?? null : null;

  useEffect(() => {
    void hydrateSparringSessions();
  }, [hydrateSparringSessions]);

  const handleLoadCase = (id: string) => {
    store.loadSavedCase(id);
    navigate('/app/generate');
  };

  const handleLoadChat = (id: string) => {
    store.loadSavedChat(id);
    navigate('/app/ask');
  };

  const handleLoadAttack = (id: string) => {
    store.loadSavedAttack(id);
    navigate('/app/attack');
  };

  const handleLoadBrainstorm = (id: string) => {
    store.loadSavedBrainstorm(id);
    navigate('/app/brainstorm');
  };

  const handleLoadFactoids = (id: string) => {
    store.loadSavedFactoids(id);
    navigate('/app/factoids');
  };

  const confirmDeleteCase = () => {
    if (!caseToDelete) return;
    void store.deleteSavedCase(caseToDelete.id)
      .then(() => {
        toast({ title: t('common.deleted', 'Deleted'), description: t('historyPage.caseDeleted', 'Saved case deleted.') });
      })
      .catch(() => {
        toast({ title: t('common.error', 'Error'), description: t('historyPage.deleteFailed', 'Could not delete saved case.'), variant: 'destructive' });
      });
    setCaseToDelete(null);
  };

  const handleLoadSparringSession = (id: string) => {
    loadSparringSession(id);
    navigate('/app/sparring');
  };

  const confirmDeleteSparringSession = () => {
    if (!sparringSessionToDelete) return;
    void deleteSparringSession(sparringSessionToDelete.id)
      .then(() => {
        toast({ title: t('common.deleted', 'Deleted'), description: t('historyPage.sparringDeleted') });
      })
      .catch(() => {
        toast({ title: t('common.error', 'Error'), description: t('historyPage.sparringDeleteFailed'), variant: 'destructive' });
      });
    setSparringSessionToDelete(null);
  };

  // The dialog stays open while the delete runs and closes only once it lands.
  const confirmDeleteCrossfire = () => {
    if (!crossfireToDelete || deletingCrossfire) return;
    const { id } = crossfireToDelete;
    setDeletingCrossfire(true);
    setCrossfireDeleteError(false);
    store.deleteRecordedResult('crossfire', id)
      .then(() => {
        setCrossfireToDelete(null);
        setOpenCrossfireId((open) => open === id ? null : open);
        toast({ title: t('common.deleted', 'Deleted'), description: t('historyPage.crossfireDeleted', 'Crossfire round deleted.') });
      })
      .catch(() => setCrossfireDeleteError(true))
      .finally(() => setDeletingCrossfire(false));
  };

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 space-y-4">
          <PageHeader className="mb-0" title={t('historyPage.title')} />
          <Select value={scope} onValueChange={setScopeChoice}>
            <SelectTrigger className="w-full sm:max-w-xl" aria-label={t('debate.historyScope', 'Show work from')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {debates.map((debate) => (
                <SelectItem key={debate.id} value={debate.id}>
                  {debate.id === currentDebateId ? `${t('nav.currentDebate', 'Current debate')}: ` : ''}{debate.motion}
                </SelectItem>
              ))}
              <SelectItem value={OUTSIDE_DEBATES}>{t('debate.outsideDebates', 'One-off and unsorted work')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scope === OUTSIDE_DEBATES ? <UnsortedWork /> : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="cases" className={TAB_CLASS}><FileText className="h-4 w-4" /> {t('historyPage.tabCases')}</TabsTrigger>
            <TabsTrigger value="chats" className={TAB_CLASS}><MessageCircle className="h-4 w-4" /> {t('historyPage.tabChats')}</TabsTrigger>
            <TabsTrigger value="attacks" className={TAB_CLASS}><Zap className="h-4 w-4" /> {t('historyPage.tabAttacks')}</TabsTrigger>
            <TabsTrigger value="brainstorms" className={TAB_CLASS}><Brain className="h-4 w-4" /> {t('historyPage.tabBrainstorms')}</TabsTrigger>
            <TabsTrigger value="factoids" className={TAB_CLASS}><BookOpen className="h-4 w-4" /> {t('historyPage.tabFactoids')}</TabsTrigger>
            <TabsTrigger value="sparring" className={TAB_CLASS}><Dumbbell className="h-4 w-4" /> {t('historyPage.tabSparring')}</TabsTrigger>
            <TabsTrigger value="crossfire" className={TAB_CLASS}><Flame className="h-4 w-4" /> {t('historyPage.tabCrossfire', 'Crossfire')}</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.casesTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedCases.length === 0 ? (
                  <EmptyState icon={FileText} title={t('historyPage.emptyCases')} description={t('historyPage.emptyCasesDesc', 'Generated cases you save will appear here.')} actionLabel={t('historyPage.createCase', 'Create a case')} onAction={() => navigate('/app/generate')} />
                ) : (
                  <div>
                    <div className={LIST_CLASS}>
                      {savedCases.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{item.data.metadata?.side ? t(`debate.side.${item.data.metadata.side}`, item.data.metadata.side.toUpperCase()) : t('common.notAvailable')}</Badge>
                              <span>{formatEuropeanDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleLoadCase(item.id)}>
                              <Eye className="h-4 w-4 mr-2" /> {t('historyPage.load')}
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setCaseToDelete({ id: item.id, title: item.title })} aria-label={t('historyPage.deleteCaseLabel', { title: item.title })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chats">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.chatsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedChats.length === 0 ? (
                  <EmptyState icon={MessageCircle} title={t('historyPage.emptyChats')} description={t('historyPage.emptyChatsDesc', 'Saved coaching chats will appear here.')} actionLabel={t('historyPage.startChat', 'Start a chat')} onAction={() => navigate('/app/ask')} />
                ) : (
                  <div className="space-y-4">
                    {savedChats.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5">
                        <div className="space-y-1">
                          <h4 className="font-semibold">{item.title}</h4>
                          <p className="text-xs text-muted-foreground">{t('askChat.messageCount', { count: item.data.length })} •{formatEuropeanDateTime(item.createdAt)}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleLoadChat(item.id)}>
                          <Eye className="h-4 w-4 mr-2" /> {t('historyPage.resume')}
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
                <CardTitle>{t('historyPage.attacksTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedAttacks.length === 0 ? (
                  <EmptyState icon={Zap} title={t('historyPage.emptyAttacks')} description={t('historyPage.emptyAttacksDesc', 'Saved attack analyses will appear here.')} actionLabel={t('historyPage.attackCase', 'Attack a case')} onAction={() => navigate('/app/attack')} />
                ) : (
                  <div>
                    <div className={LIST_CLASS}>
                      {savedAttacks.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatEuropeanDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadAttack(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> {t('historyPage.load')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="brainstorms">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.brainstormsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedBrainstorms.length === 0 ? (
                  <EmptyState icon={Brain} title={t('historyPage.emptyBrainstorms')} description={t('historyPage.emptyBrainstormsDesc', 'Saved ideation sessions will appear here.')} actionLabel={t('historyPage.brainstormIdeas', 'Brainstorm ideas')} onAction={() => navigate('/app/brainstorm')} />
                ) : (
                  <div>
                    <div className={LIST_CLASS}>
                      {savedBrainstorms.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatEuropeanDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadBrainstorm(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> {t('historyPage.load')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="factoids">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.factoidsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedFactoids.length === 0 ? (
                  <EmptyState icon={BookOpen} title={t('historyPage.emptyFactoids')} description={t('historyPage.emptyFactoidsDesc', 'Saved evidence research will appear here.')} actionLabel={t('historyPage.findEvidence', 'Find evidence')} onAction={() => navigate('/app/factoids')} />
                ) : (
                  <div>
                    <div className={LIST_CLASS}>
                      {savedFactoids.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{formatEuropeanDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleLoadFactoids(item.id)}>
                            <Eye className="h-4 w-4 mr-2" /> {t('historyPage.load')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sparring">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.sparringTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {sparringSessions.length === 0 ? (
                  <EmptyState
                    icon={Dumbbell}
                    title={t('historyPage.emptySparring')}
                    description={t('historyPage.emptySparringDesc')}
                    actionLabel={t('historyPage.startSparring')}
                    onAction={() => navigate('/app/sparring')}
                  />
                ) : (
                  <div>
                    <div className={LIST_CLASS}>
                      {sparringSessions.map((session) => (
                        <div key={session.id} className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/5">
                          <div className="min-w-0 space-y-1">
                            <h4 className="truncate font-semibold">{session.motion}</h4>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{t(`sparring.format.${session.format}`, session.format.toUpperCase())}</Badge>
                              <Badge variant="outline">{session.userSide === 'pro' ? t('export.proposition') : t('export.opposition')}</Badge>
                              {session.scorecard && <span>{t('historyPage.score', { user: session.scorecard.userScore, ai: session.scorecard.aiScore })}</span>}
                              <span>{formatEuropeanDateTime(session.updatedAt)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleLoadSparringSession(session.id)}>
                              <Eye className="mr-2 h-4 w-4" /> {t('historyPage.load')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => setSparringSessionToDelete({ id: session.id, motion: session.motion })}
                              aria-label={t('historyPage.deleteSparringAria', { motion: session.motion })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="crossfire">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.crossfireTitle', 'Crossfire rounds')}</CardTitle>
              </CardHeader>
              <CardContent>
                {savedCrossfires.length === 0 ? (
                  <EmptyState
                    icon={Flame}
                    title={t('historyPage.emptyCrossfire', 'No Crossfire rounds yet')}
                    description={t('historyPage.emptyCrossfireDesc', 'Finish a Crossfire round to review its transcript and debrief here.')}
                    actionLabel={t('historyPage.startCrossfire', 'Start Crossfire')}
                    onAction={() => navigate('/app/crossfire')}
                  />
                ) : (
                  <div className={LIST_CLASS}>
                    {savedCrossfires.map((item) => {
                      const turns = parseSavedCrossfire(item.data)?.turns.length;
                      return (
                        <div key={item.id} data-testid="history-crossfire-row" className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/5">
                          <div className="min-w-0 space-y-1">
                            <h4 className="line-clamp-2 wrap-break-word font-semibold">{item.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {turns !== undefined && <>{t('historyPage.crossfireTurns', { count: turns })} • </>}
                              {formatEuropeanDateTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="pointer-coarse:h-11"
                              onClick={() => setOpenCrossfireId(item.id)}
                              aria-label={t('historyPage.openCrossfireAria', { title: item.title, defaultValue: 'Open Crossfire round: {{title}}' })}
                            >
                              <Eye className="mr-2 h-4 w-4" /> {t('historyPage.open', 'Open')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive pointer-coarse:h-11 pointer-coarse:w-11"
                              onClick={() => setCrossfireToDelete({ id: item.id, title: item.title })}
                              aria-label={t('historyPage.deleteCrossfireAria', { title: item.title, defaultValue: 'Delete Crossfire round: {{title}}' })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}
        <Sheet open={Boolean(openCrossfire)} onOpenChange={(open) => !open && setOpenCrossfireId(null)}>
          <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-2xl">
            {openCrossfire && (
              <>
                <SheetHeader className="border-b px-5 py-4 text-left">
                  <SheetTitle className="pr-8 wrap-break-word">{openCrossfire.title}</SheetTitle>
                  <SheetDescription>{t('historyPage.crossfireRound', 'Crossfire round')} • {formatEuropeanDateTime(openCrossfire.createdAt)}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5 py-5" data-testid="saved-crossfire">
                  <SavedCrossfireView output={openCrossfire.data} />
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
        <AlertDialog
          open={Boolean(crossfireToDelete)}
          onOpenChange={(open) => {
            if (open || deletingCrossfire) return;
            setCrossfireToDelete(null);
            setCrossfireDeleteError(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('historyPage.deleteCrossfireTitle', 'Delete Crossfire round?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('historyPage.deleteCrossfireDesc', 'This removes the transcript and debrief from your history.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {crossfireDeleteError && (
              <p role="alert" className="text-sm text-destructive">{t('historyPage.crossfireDeleteFailed', 'Could not delete the Crossfire round.')}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingCrossfire}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                disabled={deletingCrossfire}
                onClick={(event) => {
                  event.preventDefault();
                  confirmDeleteCrossfire();
                }}
              >
                {deletingCrossfire && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('common.delete', 'Delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={Boolean(caseToDelete)} onOpenChange={(open) => !open && setCaseToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('historyPage.deleteCaseTitle', 'Delete saved case?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('historyPage.deleteCaseDesc', 'This removes the saved case from your history.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={confirmDeleteCase}>{t('common.delete', 'Delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={Boolean(sparringSessionToDelete)} onOpenChange={(open) => !open && setSparringSessionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('historyPage.deleteSparringTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('historyPage.deleteSparringDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={confirmDeleteSparringSession}>{t('common.delete', 'Delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
