import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatEuropeanDate, formatEuropeanDateTime, formatNumber } from '@/lib/date-format';
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
    email: string;
    expiresAt: string;
    maxUses: string;
}

type DemoAction = 'disable' | 'reset';

const EMPTY_DEMO_FORM: DemoAccessForm = { label: '', email: '', expiresAt: '', maxUses: '' };

function normalizeDemoCode(value: unknown): DemoAccessCode | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string') return null;
    return {
        id: row.id,
        label: typeof row.label === 'string' ? row.label : '',
        email: typeof row.email === 'string' ? row.email : '',
        role: typeof row.role === 'string' ? row.role : 'user',
        expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
        maxUses: typeof row.max_uses === 'number' ? row.max_uses : null,
        useCount: typeof row.use_count === 'number' ? row.use_count : 0,
        lastUsedAt: typeof row.last_used_at === 'string' ? row.last_used_at : null,
        disabledAt: typeof row.disabled_at === 'string' ? row.disabled_at : null,
        createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    };
}

function getDemoCodes(data: unknown): DemoAccessCode[] {
    if (!data || typeof data !== 'object') return [];
    const payload = data as Record<string, unknown>;
    const rows = payload.codes;
    return Array.isArray(rows) ? rows.map(normalizeDemoCode).filter((row): row is DemoAccessCode => row !== null) : [];
}

function getRawDemoCode(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const payload = data as Record<string, unknown>;
    return typeof payload.code === 'string' && payload.code.trim() ? payload.code.trim() : null;
}

function getDemoCodeStatus(code: DemoAccessCode) {
    if (code.disabledAt) return 'disabled';
    if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) return 'expired';
    if (code.maxUses !== null && code.useCount >= code.maxUses) return 'exhausted';
    return 'active';
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
    const { t } = useTranslation();
    const [form, setForm] = useState<DemoAccessForm>(EMPTY_DEMO_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [createdCode, setCreatedCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [pendingAction, setPendingAction] = useState<{ type: DemoAction; code: DemoAccessCode } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const formatDemoDate = (value: string | null) => value
        ? formatEuropeanDateTime(value, t('admin.invalidDate'))
        : t('admin.never');

    const updateForm = (updates: Partial<DemoAccessForm>) => {
        setForm((current) => ({ ...current, ...updates }));
        setFormError(null);
    };

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const label = form.label.trim();
        if (!label) {
            setFormError(t('admin.labelRequired'));
            return;
        }
        const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
        if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
            setFormError(t('admin.maxUsesInvalid'));
            return;
        }
        let expiresAt: string | null = null;
        if (form.expiresAt) {
            const expiry = new Date(form.expiresAt);
            if (Number.isNaN(expiry.getTime())) {
                setFormError(t('admin.expiryInvalid'));
                return;
            }
            expiresAt = expiry.toISOString();
        }

        setSubmitting(true);
        setFormError(null);
        setCreatedCode(null);
        setCopied(false);
        try {
            const rawCode = await onCreate({ ...form, label, expiresAt: expiresAt || '', maxUses: maxUses === null ? '' : String(maxUses) });
            if (!rawCode) throw new Error(t('admin.serverCodeMissing'));
            setCreatedCode(rawCode);
            setForm(EMPTY_DEMO_FORM);
        } catch (createError) {
            setFormError(createError instanceof Error ? createError.message : t('admin.createFailed'));
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
            setFormError(t('admin.copyFailed'));
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
            setActionError(actionError instanceof Error ? actionError.message : t('admin.actionFailed'));
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
                        {t('admin.createDemoCode')}
                    </CardTitle>
                    <CardDescription>{t('admin.createDemoCodeDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleCreate} noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="demo-label">{t('admin.label')}</Label>
                            <Input
                                id="demo-label"
                                value={form.label}
                                onChange={(event) => updateForm({ label: event.target.value })}
                                placeholder={t('admin.labelPlaceholder')}
                                autoComplete="off"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-email">{t('admin.emailOptional')}</Label>
                            <Input
                                id="demo-email"
                                type="email"
                                maxLength={254}
                                value={form.email}
                                onChange={(event) => updateForm({ email: event.target.value })}
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-expires-at">{t('admin.expiryOptional')}</Label>
                            <Input
                                id="demo-expires-at"
                                type="datetime-local"
                                value={form.expiresAt}
                                onChange={(event) => updateForm({ expiresAt: event.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="demo-max-uses">{t('admin.maxUsesOptional')}</Label>
                            <Input
                                id="demo-max-uses"
                                type="number"
                                min={1}
                                step={1}
                                value={form.maxUses}
                                onChange={(event) => updateForm({ maxUses: event.target.value })}
                                placeholder={t('admin.unlimited')}
                            />
                        </div>
                        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1 h-4 w-4" />}
                            {submitting ? t('admin.creating') : t('admin.createDemoCode')}
                        </Button>
                    </form>
                    {createdCode && (
                        <div className="mt-5 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" role="status" aria-live="polite">
                            <div>
                                <p className="font-medium">{t('admin.created')}</p>
                                <p className="text-sm text-muted-foreground">{t('admin.copyNow')}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <code className="rounded bg-background px-2 py-1 font-mono text-sm font-bold tracking-wide">{createdCode}</code>
                                <Button type="button" size="sm" variant="outline" onClick={copyCreatedCode}>
                                    <Copy className="mr-1 h-4 w-4" />
                                    {copied ? t('admin.copied') : t('admin.copyCode')}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('admin.demoAccess')}</CardTitle>
                    <CardDescription>{t('admin.codesIssued', { count: codes.length })}</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading && <p className="py-8 text-center text-sm text-muted-foreground" role="status">{t('admin.loading')}</p>}
                    {error && (
                        <p className="mb-4 text-sm text-destructive" role="alert">{t('admin.loadFailed', { error })}</p>
                    )}
                    {!loading && codes.length === 0 && !error && (
                        <div className="rounded-lg border border-dashed p-8 text-center">
                            <KeyRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                            <p className="font-medium">{t('admin.noneTitle')}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{t('admin.noneDescription')}</p>
                        </div>
                    )}
                    {codes.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-left text-sm">
                                <caption className="sr-only">{t('admin.tableCaption')}</caption>
                                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-3 font-medium">{t('admin.assignedEmail')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.label')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.role')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.expiry')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.uses')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.lastUsed')}</th>
                                        <th className="px-3 py-3 font-medium">{t('admin.status')}</th>
                                        <th className="px-3 py-3 font-medium"><span className="sr-only">{t('admin.actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {codes.map((code) => {
                                        const status = getDemoCodeStatus(code);
                                        const statusVariant = status === 'active' ? 'default' : status === 'disabled' || status === 'expired' ? 'destructive' : 'secondary';
                                        const displayLabel = code.label || t('admin.unlabelledDemo');
                                        return (
                                            <tr key={code.id}>
                                                <td className="whitespace-nowrap px-3 py-4 font-medium">{code.email || t('admin.unknownEmail')}</td>
                                                <td className="max-w-[14rem] px-3 py-4">
                                                    <span className="block truncate" title={displayLabel}>{displayLabel}</span>
                                                </td>
                                                <td className="px-3 py-4 capitalize">{t(`admin.users.roles.${code.role}`, code.role)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{formatDemoDate(code.expiresAt)}</td>
                                                <td className="whitespace-nowrap px-3 py-4">{code.useCount} / {code.maxUses === null ? t('admin.unlimited') : code.maxUses}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{formatDemoDate(code.lastUsedAt)}</td>
                                                <td className="px-3 py-4"><Badge variant={statusVariant}>{t(`admin.${status}`)}</Badge></td>
                                                <td className="px-3 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={status === 'disabled'}
                                                            aria-label={t('admin.disableAriaLabel', { label: displayLabel })}
                                                            onClick={() => { setActionError(null); setPendingAction({ type: 'disable', code }); }}
                                                        >
                                                            {t('admin.disable')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            aria-label={t('admin.resetAriaLabel', { label: displayLabel })}
                                                            onClick={() => { setActionError(null); setPendingAction({ type: 'reset', code }); }}
                                                        >
                                                            <RotateCcw className="mr-1 h-4 w-4" />
                                                            {t('admin.resetUses')}
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
                        <DialogTitle>{pendingAction?.type === 'disable' ? t('admin.disableTitle') : t('admin.resetTitle')}</DialogTitle>
                        <DialogDescription>
                            {pendingAction?.type === 'disable'
                                ? t('admin.disableDescription', { label: pendingAction.code.label || t('admin.thisCode') })
                                : t('admin.resetDescription', { label: pendingAction?.code.label || t('admin.thisCode') })}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={actionLoading}>{t('admin.cancel')}</Button>
                        <Button type="button" variant={pendingAction?.type === 'disable' ? 'destructive' : 'default'} onClick={confirmAction} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {pendingAction?.type === 'disable' ? t('admin.disableCode') : t('admin.resetUseCount')}
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

function normalizeFeatureName(feature: string) {
  return feature.trim().toLowerCase().replace(/\s+/g, '_');
}

function getFeatureColor(feature: string, index: number) {
  return COLORS[normalizeFeatureName(feature)] || COLORS_FALLBACK[index % COLORS_FALLBACK.length];
}

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersHasMore, setUsersHasMore] = useState(false);
    const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [demoCodes, setDemoCodes] = useState<DemoAccessCode[]>([]);
    const [demoCodesLoading, setDemoCodesLoading] = useState(true);
    const [demoCodesError, setDemoCodesError] = useState<string | null>(null);
    const [newPromo, setNewPromo] = useState({ code: '', type: 'extended_trial', configDays: 30, configLimit: 15, maxRedemptions: '' });
    const [giftTarget, setGiftTarget] = useState<User | null>(null);
    // Role changes are consequential and silent to the affected user, so each one asks first.
    const [roleChange, setRoleChange] = useState<{ user: User; role: 'admin' | 'banned' | 'user' } | null>(null);
    const [roleSaving, setRoleSaving] = useState(false);
    const [giftDays, setGiftDays] = useState(30);
    const [giftNotes, setGiftNotes] = useState('');
    const [giftSubmitting, setGiftSubmitting] = useState(false);
    const { toast } = useToast();
    const { t } = useTranslation();
    const formatKnownCost = (cost: number, unknownCostRequests = 0) => {
        if (cost > 0 && unknownCostRequests > 0) {
            return t('admin.dashboard.knownPlusUnknownCost', { cost: cost.toFixed(4), count: unknownCostRequests });
        }
        if (cost > 0) return `$${cost.toFixed(4)}`;
        if (unknownCostRequests > 0) return t('admin.dashboard.unknownCost');
        return '$0.0000';
    };

    const fetchAdminData = useCallback(async (action: string, params?: Record<string, string>) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error(t('admin.errors.notAuthenticated'));

        const query = new URLSearchParams({ action, ...params });
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/admin?${query}`,
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
            if (response.status === 401) throw new Error(t('admin.errors.notAuthenticated'));
            if (response.status === 403) throw new Error(t('admin.errors.accessRequired'));
            throw new Error(serverMessage || t('admin.errors.requestFailed', { status: response.status }));
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(t('admin.errors.invalidResponse'));
        }
    }, [t]);

    const postAdminData = useCallback(async (action: string, body: unknown) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error(t('admin.errors.notAuthenticated'));

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
            if (response.status === 401) throw new Error(t('admin.errors.notAuthenticated'));
            if (response.status === 403) throw new Error(t('admin.errors.accessRequired'));
            throw new Error(serverMessage || t('admin.errors.requestFailed', { status: response.status }));
        }

        try {
            return JSON.parse(text);
        } catch {
            return { success: true };
        }
    }, [t]);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const demoDataRequest: Promise<unknown> = fetchAdminData('demo-codes');
                const demoDataPromise: Promise<{ data: unknown; error: Error | null }> = demoDataRequest
                    .then((data: unknown): { data: unknown; error: Error | null } => ({ data, error: null }))
                    .catch((error: unknown): { data: unknown; error: Error | null } => ({
                        data: null,
                        error: error instanceof Error ? error : new Error(t('admin.errors.demoCodesFailed')),
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
                setUsersPage(typeof usersData.page === 'number' ? usersData.page : 1);
                setUsersHasMore(Boolean(usersData.hasMore));
                setPromoCodes(promoData.codes || []);
                setSubscribers(subData.subscribers || []);
                setDemoCodes(getDemoCodes(demoData.data));
                setDemoCodesError(demoData.error?.message || null);
                setIsAdmin(true);
            } catch (err) {
                console.error('Admin load error:', err);
                const message = err instanceof Error ? err.message : '';
                if (message.includes(t('admin.errors.accessRequired')) ||
                    message.includes('403') ||
                    message.includes(t('admin.errors.notAuthenticated')) ||
                    message.includes('401')) {
                    setIsAdmin(false);
                } else {
                    setIsAdmin(false);
                    toast({ title: t('admin.error'), description: message || t('admin.errors.loadFailed'), variant: 'destructive' });
                }
            } finally {
                setDemoCodesLoading(false);
                setLoading(false);
            }
        };
        void loadData();
    }, [fetchAdminData, t, toast]);

    useEffect(() => {
        if (isAdmin === true) captureProductEvent('tool_opened', { tool: 'admin' });
    }, [isAdmin]);

    const loadMoreUsers = async () => {
        if (loadingMoreUsers) return;
        setLoadingMoreUsers(true);
        try {
            const nextPage = usersPage + 1;
            const data = await fetchAdminData('users', { page: String(nextPage), perPage: '50' });
            const incoming = (data.users || []) as User[];
            setUsers((current) => {
                const seen = new Set(current.map((listed) => listed.id));
                return [...current, ...incoming.filter((listed) => !seen.has(listed.id))];
            });
            setUsersPage(typeof data.page === 'number' ? data.page : nextPage);
            setUsersHasMore(Boolean(data.hasMore));
        } catch (err) {
            toast({
                title: t('admin.error'),
                description: err instanceof Error ? err.message : t('admin.users.loadMoreFailed'),
                variant: 'destructive',
            });
        } finally {
            setLoadingMoreUsers(false);
        }
    };

    /** Resolves true once the role is saved; failures are reported here and leave the caller's dialog open. */
    const handleSetUserRole = async (userId: string, role: string) => {
        try {
            await postAdminData('set-role', { userId, role });
            toast({ title: t('admin.success'), description: t('admin.users.roleUpdated', { role: t(`admin.users.roles.${role}`, role) }) });
            setUsers((current) => current.map(u => u.id === userId ? { ...u, role } : u));
            return true;
        } catch (err) {
            toast({ title: t('admin.error'), description: err instanceof Error ? err.message : t('admin.users.roleUpdateFailed'), variant: 'destructive' });
            return false;
        }
    };

    const confirmRoleChange = async () => {
        if (!roleChange || roleSaving) return;
        setRoleSaving(true);
        const saved = await handleSetUserRole(roleChange.user.id, roleChange.role);
        setRoleSaving(false);
        if (saved) setRoleChange(null);
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
            toast({ title: t('admin.giftTrial.gifted'), description: t('admin.giftTrial.giftedDescription', { email: giftTarget.email, count: days }) });
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
            toast({ title: t('admin.error'), description: err instanceof Error ? err.message : t('admin.giftTrial.failed'), variant: 'destructive' });
        } finally {
            setGiftSubmitting(false);
        }
    };

    const handleCreateDemoCode = async (form: DemoAccessForm) => {
        const result = await postAdminData('create-demo-code', {
            label: form.label,
            email: form.email.trim() || null,
            expiresAt: form.expiresAt || null,
            maxUses: form.maxUses ? Number(form.maxUses) : null,
        });
        const createdCode = getRawDemoCode(result);
        const createdRow = normalizeDemoCode(result && typeof result === 'object'
            ? (result as Record<string, unknown>).demoCode
            : null);
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
                            {t('admin.dashboard.accessDenied')}
                        </CardTitle>
                        <CardDescription>
                            {t('admin.dashboard.accessDeniedDescription')}
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const featureData = stats ? Object.entries(stats.byFeature).map(([name, value], index) => ({
        name,
        label: t(`admin.dashboard.features.${normalizeFeatureName(name)}`, name),
        value,
        color: getFeatureColor(name, index),
    })) : [];

    return (
        <div className="container py-8 px-4">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Settings2 className="h-8 w-8" />
                        {t('admin.dashboard.title')}
                    </h1>
                    <p className="text-muted-foreground mt-1">{t('admin.dashboard.description')}</p>
                </div>

                {/* Stats Overview */}
                <div className="grid gap-4 md:grid-cols-4 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{t('admin.dashboard.totalRequests')}</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats ? formatNumber(stats.totals.requests) : 0}</div>
                            <p className="text-xs text-muted-foreground">{t('admin.dashboard.lastSevenDays')}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{t('admin.dashboard.totalCost')}</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {stats ? formatKnownCost(stats.totals.cost, stats.totals.unknownCostRequests) : '\u2014'}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {stats?.totals.unknownCostRequests
                                    ? t('admin.dashboard.requestsWithUnknownCost', { count: stats.totals.unknownCostRequests })
                                    : t('admin.dashboard.knownApiCosts')}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{t('admin.dashboard.successRate')}</CardTitle>
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.totals.successRate.toFixed(1) || 100}%</div>
                            <p className="text-xs text-muted-foreground">{t('admin.dashboard.successRateDescription')}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{t('admin.dashboard.activeUsers')}</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.byUser.length || 0}</div>
                            <p className="text-xs text-muted-foreground">{t('admin.dashboard.usersWithRequests')}</p>
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="usage" className="space-y-6">
                    <TabsList className="h-auto flex-wrap justify-start">
                        <TabsTrigger value="usage">{t('admin.dashboard.usageTab')}</TabsTrigger>
                        <TabsTrigger value="users">{t('admin.dashboard.usersTab')}</TabsTrigger>
                        <TabsTrigger value="announcements">
                            <Megaphone className="h-4 w-4 mr-1" />
                            {t('admin.dashboard.announcementsTab')}
                        </TabsTrigger>
                        <TabsTrigger value="demo-access">
                            <KeyRound className="h-4 w-4 mr-1" />
                            {t('admin.demoAccess')}
                        </TabsTrigger>
                        <TabsTrigger value="promo-codes">
                            <Ticket className="h-4 w-4 mr-1" />
                            {t('admin.dashboard.promosTab')}
                        </TabsTrigger>
                        <TabsTrigger value="subscribers">
                            <CreditCard className="h-4 w-4 mr-1" />
                            {t('admin.dashboard.subscribersTab')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="usage" className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Daily Usage Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('admin.dashboard.dailyRequests')}</CardTitle>
                                    <CardDescription>{t('admin.dashboard.dailyRequestsDescription')}</CardDescription>
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
                                    <CardTitle>{t('admin.dashboard.usageByFeature')}</CardTitle>
                                    <CardDescription>{t('admin.dashboard.usageByFeatureDescription')}</CardDescription>
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
                                    <CardTitle>{t('admin.dashboard.costByFeature')}</CardTitle>
                                    <CardDescription>{t('admin.dashboard.costByFeatureDescription')}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {stats.byFeatureCost.map((feature) => (
                                            <div key={feature.feature} className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate" title={feature.feature}>{t(`admin.dashboard.features.${normalizeFeatureName(feature.feature)}`, feature.feature)}</div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="secondary">{t('admin.dashboard.requestCount', { count: feature.requests })}</Badge>
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
                                    <CardTitle>{t('admin.dashboard.costByModel')}</CardTitle>
                                    <CardDescription>{t('admin.dashboard.costByModelDescription')}</CardDescription>
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
                                                    <Badge variant="secondary">{t('admin.dashboard.requestCount', { count: m.requests })}</Badge>
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
                                <CardTitle>{t('admin.dashboard.topUsers')}</CardTitle>
                                <CardDescription>{t('admin.dashboard.topUsersDescription')}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {stats?.byUser.map((u, i) => {
                                        const shortId = u.user_id ? `${u.user_id.slice(0, 8)}…` : t('admin.dashboard.unknownUser');
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
                                                    <Badge variant="secondary">{t('admin.dashboard.requestCount', { count: u.requests })}</Badge>
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
                                <CardTitle>{t('admin.users.title')}</CardTitle>
                                <CardDescription>{t('admin.users.description')}</CardDescription>
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
                                                            <Badge variant="destructive" className="text-xs">{t('admin.users.banned')}</Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {t('admin.users.activity', { count: user.requestCount, date: formatEuropeanDate(user.createdAt) })}
                                                    </div>
                                                    {(user.subscriptionTier || user.trialEndsAt || user.gracePeriodEndsAt) && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {user.subscriptionTier && (
                                                                <span className="capitalize">{t(`admin.subscribers.tiers.${user.subscriptionTier}`, user.subscriptionTier)}</span>
                                                            )}
                                                            {user.trialEndsAt && (
                                                                <> {t('admin.users.trialEnds', { date: formatEuropeanDate(user.trialEndsAt) })}</>
                                                            )}
                                                            {user.gracePeriodEndsAt && (
                                                                <> {t('admin.users.graceEnds', { date: formatEuropeanDate(user.gracePeriodEndsAt) })}</>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={user.role === 'admin' ? 'default' : user.role === 'banned' ? 'destructive' : 'secondary'}>
                                                        {t(`admin.users.roles.${user.role}`, user.role)}
                                                    </Badge>
                                                    {user.role !== 'banned' && (
                                                        <Button size="sm" variant="outline" onClick={() => openGiftDialog(user)}>
                                                            <Gift className="h-4 w-4 mr-1" />
                                                            {t('admin.users.giftTrial')}
                                                        </Button>
                                                    )}
                                                    {user.role === 'banned' ? (
                                                        <Button size="sm" variant="outline" onClick={() => setRoleChange({ user, role: 'user' })}>
                                                            <UserCheck className="h-4 w-4 mr-1" />
                                                            {t('admin.users.unban')}
                                                        </Button>
                                                    ) : user.role !== 'admin' ? (
                                                        <>
                                                            <Button size="sm" variant="outline" onClick={() => setRoleChange({ user, role: 'admin' })}>
                                                                {t('admin.users.makeAdmin')}
                                                            </Button>
                                                            <Button size="sm" variant="destructive" onClick={() => setRoleChange({ user, role: 'banned' })}>
                                                                <Ban className="h-4 w-4 mr-1" />
                                                                {t('admin.users.ban')}
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button size="sm" variant="outline" onClick={() => setRoleChange({ user, role: 'user' })}>
                                                            {t('admin.users.removeAdmin')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                                {usersHasMore && (
                                    <div className="mt-4 flex justify-center">
                                        <Button variant="outline" onClick={() => void loadMoreUsers()} disabled={loadingMoreUsers}>
                                            {loadingMoreUsers && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            {loadingMoreUsers ? t('admin.users.loadingMore') : t('admin.users.loadMore')}
                                        </Button>
                                    </div>
                                )}
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
                                        {t('admin.promos.createTitle')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>{t('admin.promos.code')}</Label>
                                        <Input
                                            placeholder={t('admin.promos.codePlaceholder')}
                                            value={newPromo.code}
                                            onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                                            className="uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t('admin.promos.type')}</Label>
                                        <Select value={newPromo.type} onValueChange={(v) => setNewPromo({ ...newPromo, type: v })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="extended_trial">{t('admin.promos.types.extended_trial')}</SelectItem>
                                                <SelectItem value="extra_limit">{t('admin.promos.types.extra_limit')}</SelectItem>
                                                <SelectItem value="free_month">{t('admin.promos.types.free_month')}</SelectItem>
                                                <SelectItem value="lifetime_pro">{t('admin.promos.types.lifetime_pro')}</SelectItem>
                                                <SelectItem value="discount">{t('admin.promos.types.discount')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {(newPromo.type === 'extended_trial' || newPromo.type === 'free_month') && (
                                        <div className="space-y-2">
                                            <Label>{t('admin.promos.days')}</Label>
                                            <Input
                                                type="number"
                                                value={newPromo.configDays}
                                                onChange={(e) => setNewPromo({ ...newPromo, configDays: parseInt(e.target.value) || 30 })}
                                            />
                                        </div>
                                    )}
                                    {newPromo.type === 'extra_limit' && (
                                        <div className="space-y-2">
                                            <Label>{t('admin.promos.dailyLimit')}</Label>
                                            <Input
                                                type="number"
                                                value={newPromo.configLimit}
                                                onChange={(e) => setNewPromo({ ...newPromo, configLimit: parseInt(e.target.value) || 15 })}
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label>{t('admin.promos.maxRedemptions')}</Label>
                                        <Input
                                            type="number"
                                            placeholder={t('admin.unlimited')}
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
                                                toast({ title: t('admin.success'), description: t('admin.promos.created', { code: newPromo.code }) });
                                                const data = await fetchAdminData('promo-codes');
                                                setPromoCodes(data.codes || []);
                                                setNewPromo({ code: '', type: 'extended_trial', configDays: 30, configLimit: 15, maxRedemptions: '' });
                                            } catch (err) {
                                                toast({ title: t('admin.error'), description: err instanceof Error ? err.message : t('admin.promos.createFailed'), variant: 'destructive' });
                                            }
                                        }}
                                        disabled={!newPromo.code.trim()}
                                        className="w-full"
                                    >
                                        {t('admin.promos.createAction')}
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Active Promo Codes */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('admin.promos.activeCodes')}</CardTitle>
                                    <CardDescription>{t('admin.promos.codeCount', { count: promoCodes.length })}</CardDescription>
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
                                                                {t(`admin.promos.types.${promo.type}`, promo.type.replace('_', ' '))}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {t('admin.promos.redemptionCount', {
                                                                count: promo.redemptions_count,
                                                                limit: promo.max_redemptions ? ` / ${promo.max_redemptions}` : '',
                                                            })}
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
                                                                toast({ title: t('admin.error'), description: err instanceof Error ? err.message : t('admin.promos.toggleFailed'), variant: 'destructive' });
                                                            }
                                                        }}
                                                    >
                                                        {promo.is_active ? t('admin.promos.disable') : t('admin.promos.enable')}
                                                    </Button>
                                                </div>
                                            ))}
                                            {promoCodes.length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-8">
                                                    {t('admin.promos.none')}
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
                                    {t('admin.subscribers.title')}
                                </CardTitle>
                                <CardDescription>{t('admin.subscribers.userCount', { count: subscribers.length })}</CardDescription>
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
                                                            {t(`admin.subscribers.tiers.${sub.subscription_tier}`, sub.subscription_tier)}
                                                        </Badge>
                                                        {sub.status && (
                                                            <Badge variant={sub.status === 'active' ? 'default' : 'destructive'}>
                                                                {t(`admin.subscribers.status.${sub.status}`, sub.status)}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {sub.current_period_end && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {t('admin.subscribers.renews', { date: formatEuropeanDate(sub.current_period_end) })}
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
                                                {t('admin.subscribers.none')}
                                            </p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={roleChange !== null} onOpenChange={(open) => { if (!open && !roleSaving) setRoleChange(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {roleChange?.role === 'admin'
                                ? t('admin.users.confirmMakeAdmin', { email: roleChange.user.email })
                                : roleChange?.role === 'banned'
                                    ? t('admin.users.confirmBan', { email: roleChange.user.email })
                                    : roleChange?.user.role === 'banned'
                                        ? t('admin.users.confirmUnban', { email: roleChange?.user.email })
                                        : t('admin.users.confirmRemoveAdmin', { email: roleChange?.user.email })}
                        </DialogTitle>
                        <DialogDescription>
                            {roleChange?.role === 'admin'
                                ? t('admin.users.confirmMakeAdminDesc')
                                : roleChange?.role === 'banned'
                                    ? t('admin.users.confirmBanDesc')
                                    : t('admin.users.confirmRoleDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setRoleChange(null)} disabled={roleSaving}>{t('admin.cancel')}</Button>
                        <Button type="button" variant={roleChange?.role === 'banned' ? 'destructive' : 'default'} onClick={() => void confirmRoleChange()} disabled={roleSaving}>
                            {roleSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {roleChange?.role === 'admin'
                                ? t('admin.users.makeAdmin')
                                : roleChange?.role === 'banned'
                                    ? t('admin.users.ban')
                                    : roleChange?.user.role === 'banned' ? t('admin.users.unban') : t('admin.users.removeAdmin')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={giftTarget !== null} onOpenChange={(open) => { if (!open) closeGiftDialog(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('admin.giftTrial.title')}</DialogTitle>
                        <DialogDescription>
                            {giftTarget ? (
                                <>{t('admin.giftTrial.description', { email: giftTarget.email })}</>
                            ) : null}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {giftTarget?.trialEndsAt && (
                            <p className="text-xs text-muted-foreground">
                                {t('admin.giftTrial.currentEnds', { date: formatEuropeanDate(giftTarget.trialEndsAt) })}
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="gift-days">{t('admin.giftTrial.days')}</Label>
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
                            <Label htmlFor="gift-notes">{t('admin.giftTrial.notes')}</Label>
                            <Input
                                id="gift-notes"
                                placeholder={t('admin.giftTrial.notesPlaceholder')}
                                value={giftNotes}
                                onChange={(e) => setGiftNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeGiftDialog} disabled={giftSubmitting}>
                            {t('admin.giftTrial.cancel')}
                        </Button>
                        <Button onClick={handleGiftTrial} disabled={giftSubmitting || giftDays < 1 || giftDays > 365}>
                            {giftSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Gift className="h-4 w-4 mr-1" />}
                            {t('admin.giftTrial.action', { count: giftDays })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
