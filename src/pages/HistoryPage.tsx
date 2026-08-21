import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/lib/stores/session-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Trash2, Eye, MessageCircle, FileText, Zap, Brain, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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

export default function HistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const { toast } = useToast();
  const [caseToDelete, setCaseToDelete] = useState<{ id: string; title: string } | null>(null);

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

  return (
    <div className="container py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('historyPage.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('historyPage.subtitle')}
          </p>
        </div>

        <Tabs defaultValue="cases" className="space-y-6">
          <TabsList>
            <TabsTrigger value="cases" className="gap-2"><FileText className="h-4 w-4" /> {t('historyPage.tabCases')}</TabsTrigger>
            <TabsTrigger value="chats" className="gap-2"><MessageCircle className="h-4 w-4" /> {t('historyPage.tabChats')}</TabsTrigger>
            <TabsTrigger value="attacks" className="gap-2"><Zap className="h-4 w-4" /> {t('historyPage.tabAttacks')}</TabsTrigger>
            <TabsTrigger value="brainstorms" className="gap-2"><Brain className="h-4 w-4" /> {t('historyPage.tabBrainstorms')}</TabsTrigger>
            <TabsTrigger value="factoids" className="gap-2"><BookOpen className="h-4 w-4" /> {t('historyPage.tabFactoids')}</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.casesTitle')}</CardTitle>
                <CardDescription>{t('historyPage.casesDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {(store.autosavedCases?.length ?? 0) > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">{t('historyPage.autosaved', 'Autosaved')}</p>
                    <div className="space-y-3">
                      {(store.autosavedCases || []).map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-muted/30">
                          <div className="space-y-1">
                            <h4 className="font-medium text-sm">{item.title}</h4>
                            <span className="text-xs text-muted-foreground">{formatEuropeanDateTime(item.createdAt)}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { store.setGenerateResult(item.data); navigate('/app/generate'); }}>
                            <Eye className="h-4 w-4 mr-1" /> {t('historyPage.load')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {store.savedCases.length === 0 && (store.autosavedCases?.length ?? 0) === 0 ? (
                  <EmptyState icon={FileText} title={t('historyPage.emptyCases')} description={t('historyPage.emptyCasesDesc', 'Generated cases you save will appear here.')} actionLabel={t('historyPage.createCase', 'Create a case')} onAction={() => navigate('/app/generate')} />
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4 stagger-enter">
                      {store.savedCases.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors motion-list-item">
                          <div className="space-y-1">
                            <h4 className="font-semibold">{item.title}</h4>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{item.data.metadata?.side?.toUpperCase() || 'N/A'}</Badge>
                              <span>{formatEuropeanDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleLoadCase(item.id)}>
                              <Eye className="h-4 w-4 mr-2" /> {t('historyPage.load')}
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setCaseToDelete({ id: item.id, title: item.title })} aria-label={`Delete ${item.title}`}>
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
                <CardTitle>{t('historyPage.chatsTitle')}</CardTitle>
                <CardDescription>{t('historyPage.chatsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedChats.length === 0 ? (
                  <EmptyState icon={MessageCircle} title={t('historyPage.emptyChats')} description={t('historyPage.emptyChatsDesc', 'Saved coaching chats will appear here.')} actionLabel={t('historyPage.startChat', 'Start a chat')} onAction={() => navigate('/app/ask')} />
                ) : (
                  <div className="space-y-4">
                    {store.savedChats.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5">
                        <div className="space-y-1">
                          <h4 className="font-semibold">{item.title}</h4>
                          <p className="text-xs text-muted-foreground">{item.data.length} {t('historyPage.messages')} • {formatEuropeanDateTime(item.createdAt)}</p>
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
                <CardDescription>{t('historyPage.attacksDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedAttacks.length === 0 ? (
                  <EmptyState icon={Zap} title={t('historyPage.emptyAttacks')} description={t('historyPage.emptyAttacksDesc', 'Saved attack analyses will appear here.')} actionLabel={t('historyPage.attackCase', 'Attack a case')} onAction={() => navigate('/app/attack')} />
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedAttacks.map((item) => (
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
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="brainstorms">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.brainstormsTitle')}</CardTitle>
                <CardDescription>{t('historyPage.brainstormsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedBrainstorms.length === 0 ? (
                  <EmptyState icon={Brain} title={t('historyPage.emptyBrainstorms')} description={t('historyPage.emptyBrainstormsDesc', 'Saved ideation sessions will appear here.')} actionLabel={t('historyPage.brainstormIdeas', 'Brainstorm ideas')} onAction={() => navigate('/app/brainstorm')} />
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedBrainstorms.map((item) => (
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
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="factoids">
            <Card>
              <CardHeader>
                <CardTitle>{t('historyPage.factoidsTitle')}</CardTitle>
                <CardDescription>{t('historyPage.factoidsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {store.savedFactoids.length === 0 ? (
                  <EmptyState icon={BookOpen} title={t('historyPage.emptyFactoids')} description={t('historyPage.emptyFactoidsDesc', 'Saved evidence research will appear here.')} actionLabel={t('historyPage.findEvidence', 'Find evidence')} onAction={() => navigate('/app/factoids')} />
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {store.savedFactoids.map((item) => (
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
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
              <AlertDialogAction onClick={confirmDeleteCase}>{t('common.delete', 'Delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
