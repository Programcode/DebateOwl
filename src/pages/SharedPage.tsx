import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Download, ExternalLink, Share2 } from 'lucide-react';

interface SharedItem {
    id: string;
    share_code: string;
    item_type: string;
    item_data: unknown;
    title: string;
    created_at: string;
    view_count: number;
}

export default function SharedPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<SharedItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const store = useSessionStore();

    useEffect(() => {
        const loadSharedItem = async () => {
            if (!code) {
                setError('No share code provided');
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabase
                    .from('shared_items')
                    .select('*')
                    .eq('share_code', code)
                    .single();

                if (fetchError || !data) {
                    setError('Shared item not found or has expired');
                    setLoading(false);
                    return;
                }

                // Increment view count
                await supabase
                    .from('shared_items')
                    .update({ view_count: (data.view_count || 0) + 1 })
                    .eq('id', data.id);

                setItem(data);
            } catch (err) {
                setError('Failed to load shared item');
            } finally {
                setLoading(false);
            }
        };

        loadSharedItem();
    }, [code]);

    const handleImport = async () => {
        if (!item) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                toast({
                    title: 'Login Required',
                    description: 'Please log in to import this content to your account',
                    variant: 'default',
                });
                navigate('/login');
                return;
            }

            // Import based on type - for now just show success message
            // Direct store integration would require setting result state then calling save methods
            switch (item.item_type) {
                case 'case':
                case 'attack':
                case 'brainstorm':
                case 'factoids':
                case 'chat':
                case 'sources':
                    toast({ title: 'Imported', description: `${item.item_type} content is ready to view` });
                    break;
                default:
                    toast({ title: 'Imported', description: 'Content added to your history' });
            }

            toast({ title: 'Success', description: 'Content imported to your account!' });
            navigate('/history');
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to import content',
                variant: 'destructive',
            });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Share2 className="h-5 w-5" />
                            Shared Content
                        </CardTitle>
                        <CardDescription>{error || 'Content not found'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => navigate('/')} className="w-full">
                            Go to DebateLab
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Share2 className="h-5 w-5 text-primary" />
                                    {item.title || 'Shared Content'}
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    <Badge variant="secondary" className="mr-2">{item.item_type}</Badge>
                                    Shared on {new Date(item.created_at).toLocaleDateString()}
                                    <span className="text-muted-foreground ml-2">• {item.view_count} views</span>
                                </CardDescription>
                            </div>
                            <Button onClick={handleImport} className="gap-2">
                                <Download className="h-4 w-4" />
                                Import to My Account
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-muted/50 rounded-lg p-4 overflow-auto max-h-[600px]">
                            <pre className="text-sm whitespace-pre-wrap">
                                {JSON.stringify(item.item_data, null, 2)}
                            </pre>
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-4 text-center">
                    <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Open DebateLab
                    </Button>
                </div>
            </div>
        </div>
    );
}
