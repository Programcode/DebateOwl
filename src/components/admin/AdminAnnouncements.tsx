import { useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone, Search, Trash2 } from 'lucide-react';
import {
  createAnnouncement,
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
  if (new Date(announcement.startsAt).getTime() > now) return 'Scheduled';
  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() <= now) return 'Expired';
  return 'Active';
}

export function AdminAnnouncements({ users }: AdminAnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<AnnouncementTargetType>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [userSearch, setUserSearch] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setAnnouncements(await listAdminAnnouncements(controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          title: 'Could not load announcements',
          description: error instanceof Error ? error.message : 'Try again.',
          variant: 'destructive',
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [toast]);

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
        title: 'Select at least one user',
        description: 'Targeted announcements need a recipient.',
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
      toast({ title: 'Announcement created', description: 'Users will see it when it becomes active.' });
    } catch (error) {
      toast({
        title: 'Could not create announcement',
        description: error instanceof Error ? error.message : 'Try again.',
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
      toast({ title: 'Announcement deleted' });
    } catch (error) {
      toast({
        title: 'Could not delete announcement',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
            Compose announcement
          </CardTitle>
          <CardDescription>Send a dismissible message to everyone or selected users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="Scheduled maintenance"
            />
            <p className="text-xs text-muted-foreground">{title.length}/160 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
              rows={6}
              placeholder="Tell users what changed and what they need to know."
            />
            <p className="text-xs text-muted-foreground">{body.length}/5000 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-audience">Audience</Label>
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
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="users">Selected users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === 'users' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Recipients</Label>
                <span className="text-xs text-muted-foreground">{selectedUserIds.size} selected</span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search by email"
                  aria-label="Search announcement recipients"
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
                        aria-label={`Select ${user.email}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{user.email}</span>
                      <Badge variant="secondary">{user.role}</Badge>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">No users match that search.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-start">Starts</Label>
              <Input
                id="announcement-start"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to start immediately.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-expiry">Expires</Label>
              <Input
                id="announcement-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to keep it active.</p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !body.trim()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Create announcement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Announcement history</CardTitle>
          <CardDescription>Review scheduled, active, and expired messages.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              Loading announcements
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-12 text-center">
              <Megaphone className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">No announcements yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create the first message from the form.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{announcement.title}</h3>
                        <Badge variant={getStatus(announcement) === 'Active' ? 'default' : 'secondary'}>
                          {getStatus(announcement)}
                        </Badge>
                        <Badge variant="outline">
                          {announcement.targetType === 'all'
                            ? 'All users'
                            : `${announcement.targetUserIds?.length ?? 0} users`}
                        </Badge>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {announcement.body}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Starts {formatEuropeanDateTime(announcement.startsAt)}</span>
                        {announcement.expiresAt && <span>Expires {formatEuropeanDateTime(announcement.expiresAt)}</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start text-destructive hover:text-destructive"
                      aria-label={`Delete announcement: ${announcement.title}`}
                      onClick={() => setDeleteTarget(announcement)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the message for every user and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete announcement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
