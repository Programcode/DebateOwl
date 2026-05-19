import { useEffect, useState } from 'react';
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
import { Activity, Users, DollarSign, AlertCircle, Shield, Settings2, Loader2, Ban, UserCheck, Ticket, CreditCard } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatEuropeanDate } from '@/lib/date-format';

interface UsageStats {
    totals: { requests: number; cost: number; successRate: number };
    daily: Array<{ date: string; requests: number; cost: number; errors: number }>;
    byFeature: Record<string, number>;
    byUser: Array<{ user_id: string; email?: string | null; requests: number; cost: number }>;
}

interface User {
    id: string;
    email: string;
    createdAt: string;
    lastSignIn: string;
    requestCount: number;
    role: string;
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

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [newPromo, setNewPromo] = useState({ code: '', type: 'extended_trial', configDays: 30, configLimit: 15, maxRedemptions: '' });
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
            try {
                const error = JSON.parse(text);
                throw new Error(error.error || 'Request failed');
            } catch {
                if (response.status === 401) throw new Error('Not authenticated');
                if (response.status === 403) throw new Error('Admin access required');
                throw new Error(`Request failed: ${response.status}`);
            }
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
            try {
                const error = JSON.parse(text);
                throw new Error(error.error || 'Request failed');
            } catch {
                if (response.status === 401) throw new Error('Not authenticated');
                if (response.status === 403) throw new Error('Admin access required');
                throw new Error(`Request failed: ${response.status}`);
            }
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
                const [statsData, usersData, promoData, subData] = await Promise.all([
                    fetchAdminData('stats'),
                    fetchAdminData('users'),
                    fetchAdminData('promo-codes').catch(() => ({ codes: [] as PromoCode[] })),
                    fetchAdminData('subscribers').catch(() => ({ subscribers: [] as Subscriber[] })),
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
                setLoading(false);
            }
        };
        loadData();
    }, [toast]);

    const handleSetUserRole = async (userId: string, role: string) => {
        try {
            await postAdminData('set-role', { userId, role });
            toast({ title: 'Success', description: `User role updated to ${role}` });
            setUsers(users.map(u => u.id === userId ? { ...u, role } : u));
        } catch (err) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update role', variant: 'destructive' });
        }
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

    const featureData = stats ? Object.entries(stats.byFeature).map(([name, value]) => ({ name, value })) : [];

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
                            <div className="text-2xl font-bold">${stats?.totals.cost.toFixed(4) || '0.00'}</div>
                            <p className="text-xs text-muted-foreground">Estimated API costs</p>
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
                    <TabsList className="flex-wrap">
                        <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
                        <TabsTrigger value="users">User Management</TabsTrigger>
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
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {featureData.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Top Users */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Users by Usage</CardTitle>
                                <CardDescription>Users with the most requests in the last 7 days</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {stats?.byUser.map((u, i) => (
                                        <div key={u.user_id} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                                                    {i + 1}
                                                </div>
                                                <span className="text-sm font-medium">{u.email || 'Unknown user'}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Badge variant="secondary">{u.requests} requests</Badge>
                                                <span className="text-sm text-muted-foreground">${u.cost.toFixed(4)}</span>
                                            </div>
                                        </div>
                                    ))}
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
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={user.role === 'admin' ? 'default' : user.role === 'banned' ? 'destructive' : 'secondary'}>
                                                        {user.role}
                                                    </Badge>
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
        </div>
    );
}
