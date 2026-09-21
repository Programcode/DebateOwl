import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Loader2, Megaphone, Search, Trash2 } from 'lucide-react';
import {
  createAnnouncement,
  deactivateAnnouncement,
  deleteAnnouncement,
  listAdminAnnouncements,
  type AdminAnnouncement,
  type AnnouncementTargetType,
} from '@/lib/announcements';
import { formatEuropeanDateTime } from '@/lib/date-format';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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

export interface AnnouncementTargetUser {
  id: string;
  email: string;
  role: string;
}

interface AdminAnnouncementsProps {
  users: AnnouncementTargetUser[];
}

function isTargetType(value: string): value is AnnouncementTargetType {
  return value === 'all' || value === 'users';
}

function getStatus(announcement: AdminAnnouncement) {
  const now = Date.now();
  if (announcement.deactivatedAt) return 'deactivated';
  if (new Date(announcement.startsAt).getTime() > now) return 'scheduled';
  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() <= now) return 'expired';
  return 'active';
}

export function AdminAnnouncements({ users }: AdminAnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminAnnouncement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<AnnouncementTargetType>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [userSearch, setUserSearch] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setAnnouncements(await listAdminAnnouncements(controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          title: t('admin.announcements.loadFailed'),
          description: error instanceof Error ? error.message : t('admin.announcements.tryAgain'),
          variant: 'destructive',
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [t, toast]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => user.email.toLowerCase().includes(query));
  }, [userSearch, users]);

  const toggleUser = (userId: string, checked: boolean) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    if (targetType === 'users' && selectedUserIds.size === 0) {
      toast({
        title: t('admin.announcements.selectUser'),
        description: t('admin.announcements.recipientRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const announcement = await createAnnouncement({
        title,
        body,
        targetType,
        targetUserIds: targetType === 'users' ? [...selectedUserIds] : undefined,
        startsAt: startsAt || undefined,
        expiresAt: expiresAt || undefined,
      });
      setAnnouncements((current) => [announcement, ...current]);
      setTitle('');
      setBody('');
      setTargetType('all');
      setSelectedUserIds(new Set());
      setStartsAt('');
      setExpiresAt('');
      toast({ title: t('admin.announcements.created'), description: t('admin.announcements.createdDescription') });
    } catch (error) {
      toast({
        title: t('admin.announcements.createFailed'),
        description: error instanceof Error ? error.message : t('admin.announcements.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteAnnouncement(deleteTarget.id);
      setAnnouncements((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: t('admin.announcements.deleted') });
    } catch (error) {
      toast({
        title: t('admin.announcements.deleteFailed'),
        description: error instanceof Error ? error.message : t('admin.announcements.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      setDeactivating(true);
      const announcement = await deactivateAnnouncement(deactivateTarget.id);
      setAnnouncements((current) => current.map((item) => (
        item.id === announcement.id ? announcement : item
      )));
      setDeactivateTarget(null);
      toast({ title: t('admin.announcements.deactivated') });
    } catch (error) {
      toast({
        title: t('admin.announcements.deactivateFailed'),
        description: error instanceof Error ? error.message : t('admin.announcements.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
            {t('admin.announcements.compose')}
          </CardTitle>
          <CardDescription>{t('admin.announcements.composeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">{t('admin.announcements.title')}</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder={t('admin.announcements.titlePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('admin.announcements.characterCount', { count: title.length, max: 160 })}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-body">{t('admin.announcements.message')}</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
              rows={6}
              placeholder={t('admin.announcements.messagePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('admin.announcements.characterCount', { count: body.length, max: 5000 })}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-audience">{t('admin.announcements.audience')}</Label>
            <Select
              value={targetType}
              onValueChange={(value) => {
                if (isTargetType(value)) setTargetType(value);
              }}
            >
              <SelectTrigger id="announcement-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.announcements.allUsers')}</SelectItem>
                <SelectItem value="users">{t('admin.announcements.selectedUsers')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === 'users' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>{t('admin.announcements.recipients')}</Label>
                <span className="text-xs text-muted-foreground">{t('admin.announcements.selectedCount', { count: selectedUserIds.size })}</span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="pl-9"
                  placeholder={t('admin.announcements.searchByEmail')}
                  aria-label={t('admin.announcements.searchRecipients')}
                />
              </div>
              <ScrollArea className="h-52 rounded-lg border">
                <div className="space-y-1 p-2">
                  {filteredUsers.map((user) => (
                    <label
                      key={user.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                    >
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onCheckedChange={(checked) => toggleUser(user.id, checked === true)}
                        aria-label={t('admin.announcements.selectRecipient', { email: user.email })}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{user.email}</span>
                      <Badge variant="secondary">{t(`admin.users.roles.${user.role}`, user.role)}</Badge>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t('admin.announcements.noMatchingUsers')}</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-start">{t('admin.announcements.starts')}</Label>
              <Input
                id="announcement-start"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('admin.announcements.startsHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-expiry">{t('admin.announcements.expires')}</Label>
              <Input
                id="announcement-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('admin.announcements.expiresHint')}</p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !body.trim()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('admin.announcements.create')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.announcements.history')}</CardTitle>
          <CardDescription>{t('admin.announcements.historyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              {t('admin.announcements.loading')}
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-12 text-center">
              <Megaphone className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">{t('admin.announcements.none')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('admin.announcements.noneDescription')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{announcement.title}</h3>
                        <Badge variant={getStatus(announcement) === 'active' ? 'default' : 'secondary'}>
                          {t(`admin.announcements.status.${getStatus(announcement)}`)}
                        </Badge>
                        <Badge variant="outline">
                          {announcement.targetType === 'all'
                            ? t('admin.announcements.allUsers')
                            : t('admin.announcements.userCount', { count: announcement.targetUserIds?.length ?? 0 })}
                        </Badge>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {announcement.body}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t('admin.announcements.startsAt', { date: formatEuropeanDateTime(announcement.startsAt) })}</span>
                        {announcement.expiresAt && <span>{t('admin.announcements.expiresAt', { date: formatEuropeanDateTime(announcement.expiresAt) })}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 self-start">
                      {(getStatus(announcement) === 'active' || getStatus(announcement) === 'scheduled') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t('admin.announcements.deactivateAria', { title: announcement.title })}
                          onClick={() => setDeactivateTarget(announcement)}
                        >
                          <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t('admin.announcements.deactivate')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={t('admin.announcements.deleteAria', { title: announcement.title })}
                        onClick={() => setDeleteTarget(announcement)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t('admin.announcements.delete')}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deactivating) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.announcements.deactivateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.announcements.deactivateDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>{t('admin.announcements.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeactivate();
              }}
              disabled={deactivating}
            >
              {deactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('admin.announcements.deactivateAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.announcements.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.announcements.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('admin.announcements.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('admin.announcements.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
