import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Share2 } from 'lucide-react';
import { formatEuropeanDate } from '@/lib/date-format';
import { PublicPageShell, useHomePath } from '@/components/layout/PublicPageShell';
import { usePageLabel } from '@/lib/seo/use-page-head';
import { GenerateOutputSchema } from '@/lib/ai/schemas/generate';
import { AttackOutputSchema } from '@/lib/ai/schemas/attack';
import { BrainstormOutputSchema } from '@/lib/ai/schemas/brainstorm';
import { FactoidsOutputSchema } from '@/lib/ai/schemas/factoids';
import { GenerateResults } from '@/components/features/generate/GenerateResults';
import { AttackResults } from '@/components/features/attack/AttackResults';
import { BrainstormResults } from '@/components/features/brainstorm/BrainstormResults';
import { FactoidsResults } from '@/components/features/factoids/FactoidsResults';

interface SharedItem {
    id: string;
    share_code: string;
    item_type: string;
    item_data: unknown;
    title: string;
    created_at: string;
    view_count: number;
}

/**
 * Shared data is public input, so it is checked against the tool's schema before the
 * tool's own result view renders it. Anything else falls back to plain readable text.
 */
function renderSharedResult(item: SharedItem): ReactNode | null {
    switch (item.item_type) {
        case 'case':
        case 'generate': {
            const parsed = GenerateOutputSchema.safeParse(item.item_data);
            return parsed.success ? <GenerateResults result={parsed.data} /> : null;
        }
        case 'attack': {
            const parsed = AttackOutputSchema.safeParse(item.item_data);
            return parsed.success ? <AttackResults result={parsed.data} /> : null;
        }
        case 'brainstorm': {
            const parsed = BrainstormOutputSchema.safeParse(item.item_data);
            return parsed.success ? <BrainstormResults result={parsed.data} /> : null;
        }
        case 'factoids': {
            const parsed = FactoidsOutputSchema.safeParse(item.item_data);
            return parsed.success ? <FactoidsResults result={parsed.data} /> : null;
        }
        default:
            return null;
    }
}

/** Plain text for any shape we don't have a view for: labels and values, never raw JSON. */
function PlainValue({ value }: { value: unknown }): ReactNode {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return <p className="whitespace-pre-wrap wrap-break-word">{String(value)}</p>;
    }
    if (Array.isArray(value)) {
        return (
            <ul className="list-disc space-y-2 pl-5">
                {value.map((entry, index) => <li key={index}><PlainValue value={entry} /></li>)}
            </ul>
        );
    }
    if (typeof value === 'object') {
        return (
            <dl className="space-y-3">
                {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
                    <div key={key}>
                        <dt className="text-sm font-semibold capitalize text-muted-foreground">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
                        <dd><PlainValue value={entry} /></dd>
                    </div>
                ))}
            </dl>
        );
    }
    return null;
}

export default function SharedPage() {
    const { t } = useTranslation();
    const { code } = useParams<{ code: string }>();
    const home = useHomePath();
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<SharedItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const missing = !loading && (!item || error !== null);

    // The route shell titles every share the same. A missing link names itself.
    usePageLabel(missing ? t('sharedPage.notFoundTitle') : null);

    // The response stays HTTP 200; this meta keeps it out of the index.
    useEffect(() => {
        if (!missing) return;
        let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
        const created = !robots;
        if (!robots) {
            robots = document.createElement('meta');
            robots.name = 'robots';
            document.head.appendChild(robots);
        }
        const previousRobots = robots.content;
        robots.content = 'noindex, nofollow';
        return () => {
            if (created) robots.remove();
            else robots.content = previousRobots;
        };
    }, [missing]);

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
                    // A missing or expired code returns no row; .single() would turn that into an HTTP 406.
                    .maybeSingle();

                if (fetchError || !data) {
                    setError(t('sharedPage.contentNotFound'));
                    setLoading(false);
                    return;
                }

                setItem(data as SharedItem);
            } catch {
                setError(t('sharedPage.loadFailed'));
            } finally {
                setLoading(false);
            }
        };

        void loadSharedItem();
    }, [code, t]);

    if (loading) {
        return (
            <PublicPageShell className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('common.loading', 'Loading')} />
            </PublicPageShell>
        );
    }

    if (error || !item) {
        return (
            <PublicPageShell className="max-w-[65ch] text-center">
                <Share2 className="mx-auto mb-4 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <h1 className="text-2xl font-bold tracking-tight">{t('sharedPage.notFoundTitle')}</h1>
                <p className="mt-2 text-muted-foreground">{error || t('sharedPage.notFound')}</p>
                <Button asChild className="mt-6">
                    <Link to={home}>{t('sharedPage.backHome')}</Link>
                </Button>
            </PublicPageShell>
        );
    }

    const result = renderSharedResult(item);

    return (
        <PublicPageShell className="max-w-4xl">
            <header className="mb-6 space-y-2">
                <h1 className="wrap-break-word text-3xl font-bold leading-tight tracking-tight">{item.title || t('sharedPage.title')}</h1>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{item.item_type}</Badge>
                    {t('sharedPage.sharedOn')} {formatEuropeanDate(item.created_at)}
                    <span>• {t('sharedPage.viewCount', { count: item.view_count })}</span>
                </p>
            </header>
            {result ?? (
                <div className="max-w-[65ch] text-base leading-7">
                    <PlainValue value={item.item_data} />
                </div>
            )}
            <div className="mt-8">
                <Button asChild variant="outline">
                    <Link to={home}>{t('sharedPage.openApp')}</Link>
                </Button>
            </div>
        </PublicPageShell>
    );
}
