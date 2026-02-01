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
import { Activity, Users, DollarSign, AlertCircle, Shield, Settings2, Loader2 } from 'lucide-react';

interface UsageStats {
    totals: { requests: number; cost: number; successRate: number };
    daily: Array<{ date: string; requests: number; cost: number; errors: number }>;
    byFeature: Record<string, number>;
    byUser: Array<{ user_id: string; requests: number; cost: number }>;
}

interface User {
    id: string;
    email: string;
    createdAt: string;
    lastSignIn: string;
    requestCount: number;
    limits: Array<{ limit_type: string; limit_value: number }>;
    role: string;
}

interface RateLimit {
    id: string;
    user_id: string | null;
    limit_type: string;
    limit_value: number;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [limits, setLimits] = useState<RateLimit[]>([]);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [newLimit, setNewLimit] = useState({ type: 'daily_requests', value: 100 });
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

        // Get response text first to handle HTML error pages
        const text = await response.text();

        if (!response.ok) {
            // Try to parse as JSON, fallback to text-based error
            try {
                const error = JSON.parse(text);
                throw new Error(error.error || 'Request failed');
            } catch {
                // HTML error page or other non-JSON response
                if (response.status === 401) throw new Error('Not authenticated');
                if (response.status === 403) throw new Error('Admin access required');
                throw new Error(`Request failed: ${response.status}`);
            }
        }

        // Parse successful response as JSON
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

        // Get response text first to handle HTML error pages
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
            return { success: true }; // Some POST actions may not return JSON
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [statsData, usersData, limitsData] = await Promise.all([
                    fetchAdminData('stats'),
                    fetchAdminData('users'),
                    fetchAdminData('limits'),
                ]);
                setStats(statsData);
                setUsers(usersData.users || []);
                setLimits(limitsData.limits || []);
                setIsAdmin(true);
            } catch (err) {
                console.error('Admin load error:', err);
                const message = err instanceof Error ? err.message : '';
                // Check for any access denial error
                if (message.includes('Admin access required') ||
                    message.includes('403') ||
                    message.includes('Not authenticated') ||
                    message.includes('401')) {
                    setIsAdmin(false);
                } else {
                    setIsAdmin(false); // Default to denying access on any error
                    toast({ title: 'Error', description: message || 'Failed to load admin data', variant: 'destructive' });
                }
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [toast]);

    const handleSetGlobalLimit = async () => {
        try {
            await postAdminData('set-limit', {
                limitType: newLimit.type,
                limitValue: newLimit.value,
            });
            toast({ title: 'Success', description: 'Global limit updated' });
            const limitsData = await fetchAdminData('limits');
            setLimits(limitsData.limits || []);
        } catch (err) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to set limit', variant: 'destructive' });
        }
    };

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
                    <p className="text-muted-foreground mt-1">Monitor usage, manage limits, and control access</p>
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
                    <TabsList>
                        <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
                        <TabsTrigger value="users">User Management</TabsTrigger>
                        <TabsTrigger value="limits">Rate Limits</TabsTrigger>
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
                                                <span className="font-mono text-sm">{u.user_id.slice(0, 8)}...</span>
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
                                <CardDescription>View and manage user access</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[500px]">
                                    <div className="space-y-4">
                                        {users.map((user) => (
                                            <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                                                <div className="space-y-1">
                                                    <div className="font-medium">{user.email}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {user.requestCount} requests • Joined {new Date(user.createdAt).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                                        {user.role}
                                                    </Badge>
                                                    {user.role !== 'admin' && (
                                                        <Button size="sm" variant="outline" onClick={() => handleSetUserRole(user.id, 'admin')}>
                                                            Make Admin
                                                        </Button>
                                                    )}
                                                    {user.role === 'admin' && (
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

                    <TabsContent value="limits" className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Set Global Limit */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Set Global Limit</CardTitle>
                                    <CardDescription>Apply rate limits to all users</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Limit Type</Label>
                                        <select
                                            className="w-full p-2 border rounded-md bg-background"
                                            value={newLimit.type}
                                            onChange={(e) => setNewLimit({ ...newLimit, type: e.target.value })}
                                        >
                                            <option value="daily_requests">Daily Requests</option>
                                            <option value="daily_tokens">Daily Tokens</option>
                                            <option value="per_minute">Requests per Minute</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Limit Value</Label>
                                        <Input
                                            type="number"
                                            value={newLimit.value}
                                            onChange={(e) => setNewLimit({ ...newLimit, value: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <Button onClick={handleSetGlobalLimit} className="w-full">
                                        Set Global Limit
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Current Limits */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Active Limits</CardTitle>
                                    <CardDescription>Currently configured rate limits</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {limits.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No limits configured</p>
                                        ) : (
                                            limits.map((limit) => (
                                                <div key={limit.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-medium">{limit.limit_type.replace('_', ' ')}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {limit.user_id ? `User: ${limit.user_id.slice(0, 8)}...` : 'Global'}
                                                        </div>
                                                    </div>
                                                    <Badge variant="secondary">{limit.limit_value}</Badge>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
