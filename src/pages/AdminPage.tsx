import { useEffect, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, Users, DollarSign, AlertCircle, Shield, Settings2, Loader2, Ban, UserCheck, Ticket, CreditCard, Gift, Megaphone, KeyRound, Copy, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatEuropeanDate, formatEuropeanDateTime } from '@/lib/date-format';
import { captureProductEvent } from '@/lib/observability';
import { AdminAnnouncements } from '@/components/admin/AdminAnnouncements';

interface UsageStats {
    totals: { requests: number; cost: number; successRate: number; unknownCostRequests?: number };
    daily: Array<{ date: string; requests: number; cost: number; errors: number }>;
    byFeature: Record<string, number>;
    byFeatureCost?: Array<{ feature: string; requests: number; cost: number; unknownCostRequests: number }>;
    byModel?: Array<{ provider: string; model: string; requests: number; cost: number; unknownCostRequests: number }>;
    byUser: Array<{ user_id: string; email?: string | null; requests: number; cost: number; unknownCostRequests?: number }>;
}

interface User {
    id: string;
    email: string;
    createdAt: string;
    lastSignIn: string;
    requestCount: number;
    role: string;
    subscriptionTier?: string | null;
    trialEndsAt?: string | null;
    gracePeriodEndsAt?: string | null;
    dailyLimitOverride?: number | null;
}

interface PromoCode {
    id: string;
    code: string;
    type: string;
    config: Record<string, number>;
    max_redemptions: number | null;
    redemptions_count: number;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
}

interface Subscriber {
    user_id: string;
    email: string;
    subscription_tier: string;
    stripe_customer_id: string | null;
    status: string | null;
    current_period_end: string | null;
}

interface DemoAccessCode {
    id: string;
    label: string;
    email: string;
    role: string;
    expiresAt: string | null;
    maxUses: number | null;
    useCount: number;
    lastUsedAt: string | null;
    disabledAt: string | null;
    createdAt: string | null;
}

interface DemoAccessForm {
    label: string;
    expiresAt: string;
    maxUses: string;
    role: string;
}

type DemoAction = 'disable' | 'reset';

const EMPTY_DEMO_FORM: DemoAccessForm = { label: '', expiresAt: '', maxUses: '', role: 'user' };

function normalizeDemoCode(value: unknown): DemoAccessCode | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string') return null;
    const expiresAt = row.expires_at ?? row.expiresAt;
    const maxUses = row.max_uses ?? row.maxUses;
    const lastUsedAt = row.last_used_at ?? row.lastUsedAt;
    const disabledAt = row.disabled_at ?? row.disabledAt;
    const createdAt = row.created_at ?? row.createdAt;
    const useCount = row.use_count ?? row.useCount;
    return {
        id: row.id,
        label: typeof row.label === 'string' ? row.label : 'Unlabelled demo',
        email: typeof row.email === 'string' ? row.email : 'Unknown email',
        role: typeof row.role === 'string' ? row.role : 'user',
        expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
        maxUses: typeof maxUses === 'number' ? maxUses : null,
        useCount: typeof useCount === 'number' ? useCount : 0,
        lastUsedAt: typeof lastUsedAt === 'string' ? lastUsedAt : null,
        disabledAt: typeof disabledAt === 'string' ? disabledAt : null,
        createdAt: typeof createdAt === 'string' ? createdAt : null,
    };
}

function getDemoCodes(data: unknown): DemoAccessCode[] {
    if (!data || typeof data !== 'object') return [];
    const payload = data as Record<string, unknown>;
    const rows = payload.codes ?? payload.demo_codes ?? payload.demoCodes;
    return Array.isArray(rows) ? rows.map(normalizeDemoCode).filter((row): row is DemoAccessCode => row !== null) : [];
}

function getRawDemoCode(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const payload = data as Record<string, unknown>;
    const nested = payload.demoCode ?? payload.demo_code ?? payload.codeRecord;
    const candidates = [
        payload.rawCode,
        payload.raw_code,
        payload.code,
        payload.demo_code,
        nested && typeof nested === 'object' ? (nested as Record<string, unknown>).code : null,
    ];
    return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)?.trim() || null;
}

function getDemoCodeStatus(code: DemoAccessCode) {
    if (code.disabledAt) return 'disabled';
    if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) return 'expired';
    if (code.maxUses !== null && code.useCount >= code.maxUses) return 'exhausted';
    return 'active';
}

function formatDemoDate(value: string | null, includeTime = false) {
    if (!value) return 'Never';
    return includeTime ? formatEuropeanDateTime(value, 'Invalid date') : formatEuropeanDate(value, 'Invalid date');
}

interface DemoAccessPanelProps {
    codes: DemoAccessCode[];
    loading: boolean;
    error: string | null;
    onCreate: (form: DemoAccessForm) => Promise<string | null>;
    onDisable: (id: string) => Promise<void>;
    onReset: (id: string) => Promise<void>;
}

function DemoAccessPanel({ codes, loading, error, onCreate, onDisable, onReset }: DemoAccessPanelProps) {
    const [form, setForm] = useState<DemoAccessForm>(EMPTY_DEMO_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [createdCode, setCreatedCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [pendingAction, setPendingAction] = useState<{ type: DemoAction; code: DemoAccessCode } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const updateForm = (updates: Partial<DemoAccessForm>) => {
        setForm((current) => ({ ...current, ...updates }));
        setFormError(null);
    };

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const label = form.label.trim();
        if (!label) {
            setFormError('Label is required.');
            return;
        }
        const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
        if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
            setFormError('Max uses must be a whole number greater than zero.');
            return;
        }
        let expiresAt: string | null = null;
        if (form.expiresAt) {
            const expiry = new Date(form.expiresAt);
            if (Number.isNaN(expiry.getTime())) {
                setFormError('Expiry must be a valid date and time.');
                return;
            }
            expiresAt = expiry.toISOString();
        }

        setSubmitting(true);
        setFormError(null);
        setCreatedCode(null);
        setCopied(false);
        try {
            const rawCode = await onCreate({ label, expiresAt: expiresAt || '', maxUses: maxUses === null ? '' : String(maxUses), role: form.role });
            if (!rawCode) throw new Error('The server did not return the generated demo code.');
            setCreatedCode(rawCode);
            setForm(EMPTY_DEMO_FORM);
        } catch (createError) {
            setFormError(createError instanceof Error ? createError.message : 'Failed to create demo code.');
        } finally {
            setSubmitting(false);
        }
    };

    const copyCreatedCode = async () => {
        if (!createdCode) return;
        let fallbackInput: HTMLTextAreaElement | null = null;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(createdCode);
            } else {
                fallbackInput = document.createElement('textarea');
                fallbackInput.value = createdCode;
                fallbackInput.setAttribute('readonly', '');
                fallbackInput.style.position = 'fixed';
                fallbackInput.style.opacity = '0';
                document.body.appendChild(fallbackInput);
                fallbackInput.select();
                if (!document.execCommand('copy')) throw new Error('Copy was rejected');
            }
            setCopied(true);
        } catch {
            setFormError('Could not copy the demo code. Select it and copy it manually.');
        } finally {
            fallbackInput?.remove();
        }
    };

    const confirmAction = async () => {
        if (!pendingAction) return;
        setActionLoading(true);
        setActionError(null);
        try {
            if (pendingAction.type === 'disable') await onDisable(pendingAction.code.id);
            else await onReset(pendingAction.code.id);
            setPendingAction(null);
        } catch (actionError) {
            setActionError(actionError instanceof Error ? actionError.message : 'Demo code action failed.');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5" />
                        Create demo code
                    </CardTitle>
                    <CardDescription>Issue a one-time code for a demo account. The raw code appears only after creation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleCreate} noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="demo-label">Label</Label>
                            <Input
                                id="demo-label"
                                value={form.label}
                                onChange={(event) => updateForm({ label: event.target.value })}
                                placeholder="e.g. September school demo"
                                autoComplete="off"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-expires-at">Expiry (optional)</Label>
                            <Input
                                id="demo-expires-at"
                                type="datetime-local"
                                value={form.expiresAt}
                                onChange={(event) => updateForm({ expiresAt: event.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-max-uses">Max uses (optional)</Label>
                            <Input
                                id="demo-max-uses"
                                type="number"
                                min={1}
                                step={1}
                                value={form.maxUses}
                                onChange={(event) => updateForm({ maxUses: event.target.value })}
                                placeholder="Unlimited"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-role">Role (optional)</Label>
                            <Select value={form.role} onValueChange={(role) => updateForm({ role })}>
                                <SelectTrigger id="demo-role" aria-label="Role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="banned">Banned</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1 h-4 w-4" />}
                            {submitting ? 'Creating…' : 'Create demo code'}
                        </Button>
                    </form>
                    {createdCode && (
                        <div className="mt-5 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" role="status" aria-live="polite">
                            <div>
                                <p className="font-medium">Demo code created</p>
                                <p className="text-sm text-muted-foreground">Copy this code now. It will not be shown again.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <code className="rounded bg-background px-2 py-1 font-mono text-sm font-bold tracking-wide">{createdCode}</code>
                                <Button type="button" size="sm" variant="outline" onClick={copyCreatedCode}>
                                    <Copy className="mr-1 h-4 w-4" />
                                    {copied ? 'Copied' : 'Copy code'}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Demo access</CardTitle>
                    <CardDescription>{codes.length} {codes.length === 1 ? 'code' : 'codes'} issued</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading && <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading demo codes…</p>}
                    {error && (
                        <p className="mb-4 text-sm text-destructive" role="alert">Unable to load demo codes: {error}</p>
                    )}
                    {!loading && codes.length === 0 && !error && (
                        <div className="rounded-lg border border-dashed p-8 text-center">
                            <KeyRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                            <p className="font-medium">No demo codes yet</p>
                            <p className="mt-1 text-sm text-muted-foreground">Create a code for your next demo or event.</p>
                        </div>
                    )}
                    {codes.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-left text-sm">
                                <caption className="sr-only">Issued demo access codes</caption>
                                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-3 font-medium">Assigned email</th>
                                        <th className="px-3 py-3 font-medium">Label</th>
                                        <th className="px-3 py-3 font-medium">Role</th>
                                        <th className="px-3 py-3 font-medium">Expiry</th>
                                        <th className="px-3 py-3 font-medium">Uses</th>
                                        <th className="px-3 py-3 font-medium">Last used</th>
                                        <th className="px-3 py-3 font-medium">Status</th>
                                        <th className="px-3 py-3 font-medium"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {codes.map((code) => {
                                        const status = getDemoCodeStatus(code);
                                        const statusVariant = status === 'active' ? 'default' : status === 'disabled' || status === 'expired' ? 'destructive' : 'secondary';
                                        return (
                                            <tr key={code.id}>
                                                <td className="whitespace-nowrap px-3 py-4 font-medium">{code.email}</td>
                                                <td className="max-w-[14rem] px-3 py-4">
                                                    <span className="block truncate" title={code.label}>{code.label}</span>
                                                </td>
                                                <td className="px-3 py-4 capitalize">{code.role}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{formatDemoDate(code.expiresAt, true)}</td>
                                                <td className="whitespace-nowrap px-3 py-4">{code.useCount} / {code.maxUses === null ? 'Unlimited' : code.maxUses}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{formatDemoDate(code.lastUsedAt, true)}</td>
                                                <td className="px-3 py-4"><Badge variant={statusVariant}>{status}</Badge></td>
                                                <td className="px-3 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={status === 'disabled'}
                                                            aria-label={`Disable demo code ${code.label}`}
                                                            onClick={() => { setActionError(null); setPendingAction({ type: 'disable', code }); }}
                                                        >
                                                            Disable
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            aria-label={`Reset use count for ${code.label}`}
                                                            onClick={() => { setActionError(null); setPendingAction({ type: 'reset', code }); }}
                                                        >
                                                            <RotateCcw className="mr-1 h-4 w-4" />
                                                            Reset uses
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={pendingAction !== null} onOpenChange={(open) => { if (!open && !actionLoading) setPendingAction(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{pendingAction?.type === 'disable' ? 'Disable demo code?' : 'Reset use count?'}</DialogTitle>
                        <DialogDescription>
                            {pendingAction?.type === 'disable'
                                ? `People will no longer be able to sign in with ${pendingAction.code.label}.`
                                : `Set ${pendingAction?.code.label || 'this code'} use count back to zero.`}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={actionLoading}>Cancel</Button>
                        <Button type="button" variant={pendingAction?.type === 'disable' ? 'destructive' : 'default'} onClick={confirmAction} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {pendingAction?.type === 'disable' ? 'Disable code' : 'Reset use count'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const COLORS: Record<string, string> = {
  generate: '#3b82f6',
  attack: '#ef4444',
  brainstorm: '#f59e0b',
  factoids: '#10b981',
  ask: '#8b5cf6',
  import_source: '#64748b',
};
const COLORS_FALLBACK = ['#64748b', '#94a3b8', '#475569'];

const FEATURE_LABELS: Record<string, string> = {
  generate: 'Generate',
  attack: 'Attack',
  brainstorm: 'Brainstorm',
  factoids: 'Factoids',
  ask: 'Ask',
  import_source: 'Source Import',
};

function normalizeFeatureName(feature: string) {
  return feature.trim().toLowerCase().replace(/\s+/g, '_');
}

function getFeatureColor(feature: string, index: number) {
  return COLORS[normalizeFeatureName(feature)] || COLORS_FALLBACK[index % COLORS_FALLBACK.length];
}

function getFeatureLabel(feature: string) {
  const normalized = normalizeFeatureName(feature);
  return FEATURE_LABELS[normalized] || feature;
}

function formatKnownCost(cost: number, unknownCostRequests = 0) {
    if (cost > 0 && unknownCostRequests > 0) return `$${cost.toFixed(4)} + ${unknownCostRequests} unknown`;
    if (cost > 0) return `$${cost.toFixed(4)}`;
    if (unknownCostRequests > 0) return 'Unknown';
    return '$0.0000';
}

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [demoCodes, setDemoCodes] = useState<DemoAccessCode[]>([]);
    const [demoCodesLoading, setDemoCodesLoading] = useState(true);
    const [demoCodesError, setDemoCodesError] = useState<string | null>(null);
    const [newPromo, setNewPromo] = useState({ code: '', type: 'extended_trial', configDays: 30, configLimit: 15, maxRedemptions: '' });
    const [giftTarget, setGiftTarget] = useState<User | null>(null);
    const [giftDays, setGiftDays] = useState(30);
    const [giftNotes, setGiftNotes] = useState('');
    const [giftSubmitting, setGiftSubmitting] = useState(false);
    const { toast } = useToast();

    const fetchAdminData = async (action: string) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/admin?action=${action}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const text = await response.text();

        if (!response.ok) {
            let serverMessage: string | undefined;
            try {
                const error = JSON.parse(text);
                serverMessage = typeof error.error === 'string' ? error.error : undefined;
            } catch { /* non-JSON error response */ }
            if (response.status === 401) throw new Error('Not authenticated');
            if (response.status === 403) throw new Error('Admin access required');
            throw new Error(serverMessage || `Request failed: ${response.status}`);
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error('Invalid response from server');
        }
    };

    const postAdminData = async (action: string, body: unknown) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/admin?action=${action}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }
        );

        const text = await response.text();

        if (!response.ok) {
            let serverMessage: string | undefined;
            try {
                const error = JSON.parse(text);
                serverMessage = typeof error.error === 'string' ? error.error : undefined;
            } catch { /* non-JSON error response */ }
            if (response.status === 401) throw new Error('Not authenticated');
            if (response.status === 403) throw new Error('Admin access required');
            throw new Error(serverMessage || `Request failed: ${response.status}`);
        }

        try {
            return JSON.parse(text);
        } catch {
            return { success: true };
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const demoDataRequest: Promise<unknown> = fetchAdminData('demo-codes');
                const demoDataPromise: Promise<{ data: unknown; error: Error | null }> = demoDataRequest
                    .then((data: unknown): { data: unknown; error: Error | null } => ({ data, error: null }))
                    .catch((error: unknown): { data: unknown; error: Error | null } => ({
                        data: null,
                        error: error instanceof Error ? error : new Error('Failed to load demo codes'),
                    }));
                const [statsData, usersData, promoData, subData, demoData] = await Promise.all([
                    fetchAdminData('stats'),
                    fetchAdminData('users'),
                    fetchAdminData('promo-codes').catch(() => ({ codes: [] as PromoCode[] })),
                    fetchAdminData('subscribers').catch(() => ({ subscribers: [] as Subscriber[] })),
                    demoDataPromise,
                ]);
                const loadedUsers = usersData.users || [];
                const emailByUserId = new Map<string, string>();
                loadedUsers.forEach((loadedUser: User) => {
                    if (loadedUser.id && loadedUser.email) emailByUserId.set(loadedUser.id, loadedUser.email);
                });
                const enrichedStats = statsData
                    ? {
                        ...statsData,
                        byUser: (statsData.byUser || []).map((usageUser: UsageStats['byUser'][number]) => ({
                            ...usageUser,
                            email: usageUser.email || emailByUserId.get(usageUser.user_id) || null,
                        })),
                    }
                    : statsData;

                setStats(enrichedStats);
                setUsers(loadedUsers);
                setPromoCodes(promoData.codes || []);
                setSubscribers(subData.subscribers || []);
                setDemoCodes(getDemoCodes(demoData.data));
                setDemoCodesError(demoData.error?.message || null);
                setIsAdmin(true);
            } catch (err) {
                console.error('Admin load error:', err);
                const message = err instanceof Error ? err.message : '';
                if (message.includes('Admin access required') ||
                    message.includes('403') ||
                    message.includes('Not authenticated') ||
                    message.includes('401')) {
                    setIsAdmin(false);
                } else {
                    setIsAdmin(false);
                    toast({ title: 'Error', description: message || 'Failed to load admin data', variant: 'destructive' });
                }
            } finally {
                setDemoCodesLoading(false);
                setLoading(false);
            }
        };
        loadData();
    }, [toast]);

    useEffect(() => {
        if (isAdmin === true) captureProductEvent('tool_opened', { tool: 'admin' });
    }, [isAdmin]);

    const handleSetUserRole = async (userId: string, role: string) => {
        try {
            await postAdminData('set-role', { userId, role });
            toast({ title: 'Success', description: `User role updated to ${role}` });
            setUsers(users.map(u => u.id === userId ? { ...u, role } : u));
        } catch (err) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update role', variant: 'destructive' });
        }
    };

    const openGiftDialog = (user: User) => {
        setGiftTarget(user);
        setGiftDays(30);
        setGiftNotes('');
    };

    const closeGiftDialog = () => {
        setGiftTarget(null);
        setGiftNotes('');
    };

    const handleGiftTrial = async () => {
        if (!giftTarget) return;
        const days = Math.max(1, Math.min(365, Math.floor(giftDays || 30)));
        try {
            setGiftSubmitting(true);
            const result = await postAdminData('grant-trial', {
                userId: giftTarget.id,
                days,
                notes: giftNotes.trim() || undefined,
            });
            toast({ title: 'Trial gifted', description: `${giftTarget.email} now has ${days} days of trial access.` });
            setUsers(prev => prev.map(u => u.id === giftTarget.id
                ? {
                    ...u,
                    subscriptionTier: result?.subscription_tier || 'trial',
                    trialEndsAt: result?.trial_ends_at || u.trialEndsAt,
                    gracePeriodEndsAt: null as string | null,
                    dailyLimitOverride: result?.daily_limit_override ?? u.dailyLimitOverride,
                }
                : u
            ));
            closeGiftDialog();
        } catch (err) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to gift trial', variant: 'destructive' });
        } finally {
            setGiftSubmitting(false);
        }
    };

    const handleCreateDemoCode = async (form: DemoAccessForm) => {
        const result = await postAdminData('create-demo-code', {
            label: form.label,
            expiresAt: form.expiresAt || null,
            maxUses: form.maxUses ? Number(form.maxUses) : null,
            role: form.role || 'user',
        });
        const createdCode = getRawDemoCode(result);
        const createdRow = normalizeDemoCode(
            result && typeof result === 'object'
                ? (result as Record<string, unknown>).demoCode
                    ?? (result as Record<string, unknown>).demo_code
                    ?? (result as Record<string, unknown>).codeRecord
                : null,
        );
        if (createdRow) setDemoCodes((current) => [createdRow, ...current.filter((code) => code.id !== createdRow.id)]);
        setDemoCodesError(null);
        return createdCode;
    };

    const handleDisableDemoCode = async (id: string) => {
        await postAdminData('disable-demo-code', { id });
        setDemoCodes((current) => current.map((code) => code.id === id ? { ...code, disabledAt: new Date().toISOString() } : code));
    };

    const handleResetDemoCode = async (id: string) => {
        await postAdminData('reset-demo-code', { id });
        setDemoCodes((current) => current.map((code) => code.id === id ? { ...code, useCount: 0, lastUsedAt: null } : code));
    };

    if (loading) {
        return (
            <div className="container py-8 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isAdmin === false) {
        return (
            <div className="container py-8 px-4">
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-destructive" />
                            Access Denied
                        </CardTitle>
                        <CardDescription>
                            You don't have admin privileges. Contact an administrator to request access.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const featureData = stats ? Object.entries(stats.byFeature).map(([name, value], index) => ({
        name,
        label: getFeatureLabel(name),
        value,
        color: getFeatureColor(name, index),
    })) : [];

    return (
        <div className="container py-8 px-4">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Settings2 className="h-8 w-8" />
                        Admin Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1">Monitor usage, manage users, and control access</p>
                </div>

                {/* Stats Overview */}
                <div className="grid gap-4 md:grid-cols-4 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.totals.requests.toLocaleString() || 0}</div>
                            <p className="text-xs text-muted-foreground">Last 7 days</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {stats ? formatKnownCost(stats.totals.cost, stats.totals.unknownCostRequests) : '\u2014'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {stats?.totals.unknownCostRequests
                                    ? `${stats.totals.unknownCostRequests} requests missing token data`
                                    : 'Known API costs'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.totals.successRate.toFixed(1) || 100}%</div>
                            <p className="text-xs text-muted-foreground">Request success rate</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.byUser.length || 0}</div>
                            <p className="text-xs text-muted-foreground">Users with requests</p>
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="usage" className="space-y-6">
                    <TabsList className="h-auto flex-wrap justify-start">
                        <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
                        <TabsTrigger value="users">User Management</TabsTrigger>
                        <TabsTrigger value="announcements">
                            <Megaphone className="h-4 w-4 mr-1" />
                            Announcements
                        </TabsTrigger>
                        <TabsTrigger value="demo-access">
                            <KeyRound className="h-4 w-4 mr-1" />
                            Demo access
                        </TabsTrigger>
                        <TabsTrigger value="promo-codes">
                            <Ticket className="h-4 w-4 mr-1" />
                            Promo Codes
                        </TabsTrigger>
                        <TabsTrigger value="subscribers">
                            <CreditCard className="h-4 w-4 mr-1" />
                            Subscribers
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="usage" className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Daily Usage Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Daily Requests</CardTitle>
                                    <CardDescription>Request volume over the last 7 days</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={stats?.daily.slice().reverse() || []}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip />
                                                <Bar dataKey="requests" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Feature Distribution */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Usage by Feature</CardTitle>
                                    <CardDescription>Distribution of requests across features</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={featureData}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    label={({ payload, percent }) => `${payload.label} ${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {featureData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                                        {featureData.map((entry) => (
                                            <div key={entry.name} className="flex items-center gap-2">
                                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                                                <span className="text-muted-foreground">{entry.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Cost by Feature */}
                        {stats?.byFeatureCost && stats.byFeatureCost.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Cost by Feature</CardTitle>
                                    <CardDescription>Known cost per feature over the last 7 days; unknown costs never render as zero</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {stats.byFeatureCost.map((feature) => (
                                            <div key={feature.feature} className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate" title={feature.feature}>{getFeatureLabel(feature.feature)}</div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="secondary">{feature.requests} requests</Badge>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatKnownCost(feature.cost, feature.unknownCostRequests)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Cost by Model */}
                        {stats?.byModel && stats.byModel.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Cost by Model</CardTitle>
                                    <CardDescription>Known cost per model over the last 7 days; unknown-priced models never render as zero</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {stats.byModel.map((m) => (
                                            <div key={`${m.provider}/${m.model}`} className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate" title={m.model}>{m.model}</div>
                                                    <div className="text-xs text-muted-foreground">{m.provider}</div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="secondary">{m.requests} requests</Badge>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatKnownCost(m.cost, m.unknownCostRequests)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Top Users */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Users by Usage</CardTitle>
                                <CardDescription>Users with the most requests in the last 7 days</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {stats?.byUser.map((u, i) => {
                                        const shortId = u.user_id ? `${u.user_id.slice(0, 8)}…` : 'unknown';
                                        const label = u.email || shortId;
                                        return (
                                            <div key={u.user_id} className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                                                        {i + 1}
                                                    </div>
                                                    <span
                                                        className="text-sm font-medium"
                                                        title={u.user_id || undefined}
                                                    >
                                                        {label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <Badge variant="secondary">{u.requests} requests</Badge>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatKnownCost(u.cost, u.unknownCostRequests)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="users" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>User Management</CardTitle>
                                <CardDescription>View and manage user access and roles</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[500px]">
                                    <div className="space-y-4">
                                        {users.map((user) => (
                                            <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                                                <div className="space-y-1">
                                                    <div className="font-medium flex items-center gap-2">
                                                        {user.email}
                                                        {user.role === 'banned' && (
                                                            <Badge variant="destructive" className="text-xs">Banned</Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {user.requestCount} requests • Joined {formatEuropeanDate(user.createdAt)}
                                                    </div>
                                                    {(user.subscriptionTier || user.trialEndsAt || user.gracePeriodEndsAt) && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {user.subscriptionTier && (
                                                                <span className="capitalize">{user.subscriptionTier}</span>
                                                            )}
                                                            {user.trialEndsAt && (
                                                                <> • Trial ends {formatEuropeanDate(user.trialEndsAt)}</>
                                                            )}
                                                            {user.gracePeriodEndsAt && (
                                                                <> • Grace ends {formatEuropeanDate(user.gracePeriodEndsAt)}</>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={user.role === 'admin' ? 'default' : user.role === 'banned' ? 'destructive' : 'secondary'}>
                                                        {user.role}
                                                    </Badge>
                                                    {user.role !== 'banned' && (
                                                        <Button size="sm" variant="outline" onClick={() => openGiftDialog(user)}>
                                                            <Gift className="h-4 w-4 mr-1" />
                                                            Gift trial
                                                        </Button>
                                                    )}
                                                    {user.role === 'banned' ? (
                                                        <Button size="sm" variant="outline" onClick={() => handleSetUserRole(user.id, 'user')}>
                                                            <UserCheck className="h-4 w-4 mr-1" />
                                                            Unban
                                                        </Button>
                                                    ) : user.role !== 'admin' ? (
                                                        <>
                                                            <Button size="sm" variant="outline" onClick={() => handleSetUserRole(user.id, 'admin')}>
                                                                Make Admin
                                                            </Button>
                                                            <Button size="sm" variant="destructive" onClick={() => handleSetUserRole(user.id, 'banned')}>
                                                                <Ban className="h-4 w-4 mr-1" />
                                                                Ban
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button size="sm" variant="outline" onClick={() => handleSetUserRole(user.id, 'user')}>
                                                            Remove Admin
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="announcements" className="space-y-6">
                        <AdminAnnouncements users={users} />
                    </TabsContent>

                    <TabsContent value="demo-access" className="space-y-6">
                        <DemoAccessPanel
                            codes={demoCodes}
                            loading={demoCodesLoading}
                            error={demoCodesError}
                            onCreate={handleCreateDemoCode}
                            onDisable={handleDisableDemoCode}
                            onReset={handleResetDemoCode}
                        />
                    </TabsContent>

                    {/* Promo Codes Tab */}
                    <TabsContent value="promo-codes" className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Create Promo Code */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Ticket className="h-5 w-5" />
                                        Create Promo Code
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Code</Label>
                                        <Input
                                            placeholder="e.g. CIT2026"
                                            value={newPromo.code}
                                            onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                                            className="uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select value={newPromo.type} onValueChange={(v) => setNewPromo({ ...newPromo, type: v })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="extended_trial">Extended Trial</SelectItem>
                                                <SelectItem value="extra_limit">Extra Daily Limit</SelectItem>
                                                <SelectItem value="free_month">Free Month of Pro</SelectItem>
                                                <SelectItem value="lifetime_pro">Lifetime Pro</SelectItem>
                                                <SelectItem value="discount">Checkout Discount</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {(newPromo.type === 'extended_trial' || newPromo.type === 'free_month') && (
                                        <div className="space-y-2">
                                            <Label>Days</Label>
                                            <Input
                                                type="number"
                                                value={newPromo.configDays}
                                                onChange={(e) => setNewPromo({ ...newPromo, configDays: parseInt(e.target.value) || 30 })}
                                            />
                                        </div>
                                    )}
                                    {newPromo.type === 'extra_limit' && (
                                        <div className="space-y-2">
                                            <Label>Daily Limit</Label>
                                            <Input
                                                type="number"
                                                value={newPromo.configLimit}
                                                onChange={(e) => setNewPromo({ ...newPromo, configLimit: parseInt(e.target.value) || 15 })}
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label>Max Redemptions (blank = unlimited)</Label>
                                        <Input
                                            type="number"
                                            placeholder="Unlimited"
                                            value={newPromo.maxRedemptions}
                                            onChange={(e) => setNewPromo({ ...newPromo, maxRedemptions: e.target.value })}
                                        />
                                    </div>
                                    <Button
                                        onClick={async () => {
                                            try {
                                                const config: Record<string, number> = {};
                                                if (newPromo.type === 'extended_trial' || newPromo.type === 'free_month') {
                                                    config.days = newPromo.configDays;
                                                } else if (newPromo.type === 'lifetime_pro') {
                                                    config.limit = 50;
                                                } else if (newPromo.type === 'extra_limit') {
                                                    config.limit = newPromo.configLimit;
                                                }
                                                await postAdminData('create-promo', {
                                                    code: newPromo.code,
                                                    type: newPromo.type,
                                                    config,
                                                    maxRedemptions: newPromo.maxRedemptions ? parseInt(newPromo.maxRedemptions) : null,
                                                });
                                                toast({ title: 'Success', description: `Promo code "${newPromo.code}" created` });
                                                const data = await fetchAdminData('promo-codes');
                                                setPromoCodes(data.codes || []);
                                                setNewPromo({ code: '', type: 'extended_trial', configDays: 30, configLimit: 15, maxRedemptions: '' });
                                            } catch (err) {
                                                toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create code', variant: 'destructive' });
                                            }
                                        }}
                                        disabled={!newPromo.code.trim()}
                                        className="w-full"
                                    >
                                        Create Code
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Active Promo Codes */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Active Codes</CardTitle>
                                    <CardDescription>{promoCodes.length} promo codes</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[400px]">
                                        <div className="space-y-3">
                                            {promoCodes.map((promo) => (
                                                <div key={promo.id} className="flex items-center justify-between p-3 rounded-lg border">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <code className="font-mono font-bold">{promo.code}</code>
                                                            <Badge variant={promo.is_active ? 'default' : 'secondary'}>
                                                                {promo.type.replace('_', ' ')}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Used {promo.redemptions_count}{promo.max_redemptions ? ` / ${promo.max_redemptions}` : ''} times
                                                        </p>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={async () => {
                                                            try {
                                                                await postAdminData('toggle-promo', { id: promo.id, isActive: !promo.is_active });
                                                                const data = await fetchAdminData('promo-codes');
                                                                setPromoCodes(data.codes || []);
                                                            } catch (err) {
                                                                toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
                                                            }
                                                        }}
                                                    >
                                                        {promo.is_active ? 'Disable' : 'Enable'}
                                                    </Button>
                                                </div>
                                            ))}
                                            {promoCodes.length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-8">
                                                    No promo codes yet. Create one to get started.
                                                </p>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Subscribers Tab */}
                    <TabsContent value="subscribers" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CreditCard className="h-5 w-5" />
                                    Subscribers
                                </CardTitle>
                                <CardDescription>{subscribers.length} users with subscription data</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[500px]">
                                    <div className="space-y-3">
                                        {subscribers.map((sub) => (
                                            <div key={sub.user_id} className="flex items-center justify-between p-3 rounded-lg border">
                                                <div>
                                                    <p className="font-medium text-sm">{sub.email}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant={sub.subscription_tier === 'pro' ? 'default' : 'secondary'}>
                                                            {sub.subscription_tier}
                                                        </Badge>
                                                        {sub.status && (
                                                            <Badge variant={sub.status === 'active' ? 'default' : 'destructive'}>
                                                                {sub.status}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {sub.current_period_end && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Renews: {formatEuropeanDate(sub.current_period_end)}
                                                        </p>
                                                    )}
                                                </div>
                                                {sub.stripe_customer_id && (
                                                    <code className="text-xs text-muted-foreground">
                                                        {sub.stripe_customer_id.slice(0, 16)}...
                                                    </code>
                                                )}
                                            </div>
                                        ))}
                                        {subscribers.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-8">
                                                No subscribers yet.
                                            </p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={giftTarget !== null} onOpenChange={(open) => { if (!open) closeGiftDialog(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Gift trial access</DialogTitle>
                        <DialogDescription>
                            {giftTarget ? (
                                <>Grant <span className="font-medium">{giftTarget.email}</span> trial access for a chosen number of days.</>
                            ) : null}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {giftTarget?.trialEndsAt && (
                            <p className="text-xs text-muted-foreground">
                                Current trial ends {formatEuropeanDate(giftTarget.trialEndsAt)}
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="gift-days">Days</Label>
                            <Input
                                id="gift-days"
                                type="number"
                                min={1}
                                max={365}
                                value={giftDays}
                                onChange={(e) => setGiftDays(parseInt(e.target.value, 10) || 0)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gift-notes">Notes (optional)</Label>
                            <Input
                                id="gift-notes"
                                placeholder="e.g. tournament partner, support request"
                                value={giftNotes}
                                onChange={(e) => setGiftNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeGiftDialog} disabled={giftSubmitting}>
                            Cancel
                        </Button>
                        <Button onClick={handleGiftTrial} disabled={giftSubmitting || giftDays < 1 || giftDays > 365}>
                            {giftSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Gift className="h-4 w-4 mr-1" />}
                            Gift {giftDays} days
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
