import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Download, ExternalLink, Share2 } from 'lucide-react';
import { formatEuropeanDate } from '@/lib/date-format';

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
    const { t } = useTranslation();
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<SharedItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();


    useEffect(() => {
        const loadSharedItem = async () => {
            if (!code) {
                setError(t('sharedPage.noCode'));
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabase
                    .rpc('get_shared_item', { p_share_code: code })
                    .single();

                if (fetchError || !data) {
                    setError(t('sharedPage.contentNotFound'));
                    setLoading(false);
                    return;
                }

                setItem(data as SharedItem);
            } catch (err) {
                setError(t('sharedPage.loadFailed'));
            } finally {
                setLoading(false);
            }
        };

        loadSharedItem();
    }, [code, t]);

    const handleImport = async () => {
        if (!item) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                toast({
                    title: t('sharedPage.loginRequired'),
                    description: t('sharedPage.loginRequiredDesc'),
                    variant: 'default',
                });
                navigate('/login');
                return;
            }

            toast({
                title: t('sharedPage.importNotAvailable'),
                description: t('sharedPage.importNotAvailableDesc'),
            });
        } catch (err) {
            toast({
                title: 'Error',
                description: t('sharedPage.importFailed'),
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
                            {t('sharedPage.title')}
                        </CardTitle>
                        <CardDescription>{error || t('sharedPage.notFound')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => navigate('/app')} className="w-full">
                            {t('sharedPage.goToApp')}
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
                                    {item.title || t('sharedPage.title')}
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    <Badge variant="secondary" className="mr-2">{item.item_type}</Badge>
                                    {t('sharedPage.sharedOn')} {formatEuropeanDate(item.created_at)}
                                    <span className="text-muted-foreground ml-2">• {item.view_count} {t('sharedPage.views')}</span>
                                </CardDescription>
                            </div>
                            <Button onClick={handleImport} className="gap-2">
                                <Download className="h-4 w-4" />
                                {t('sharedPage.importToAccount')}
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
                    <Button variant="outline" onClick={() => navigate('/app')} className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        {t('sharedPage.openApp')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
