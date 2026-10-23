import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Clock,
  Crosshair,
  Database,
  Dumbbell,
  GitBranch,
  Lightbulb,
  MessageCircle,
  Sparkles,
  Swords,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useRoutePrefetch } from '@/hooks/use-route-prefetch';
import { cn } from '@/lib/utils';

export type Tool = {
  key: string;
  href: string;
  icon: LucideIcon;
};

// One tool list, labelled with the same nav.* strings the tool pages use as their h1.
export const PREPARE_TOOLS = [
  { key: 'generate', href: '/app/generate', icon: Sparkles },
  { key: 'brainstorm', href: '/app/brainstorm', icon: Lightbulb },
  { key: 'factoids', href: '/app/factoids', icon: BookOpen },
  { key: 'flowchart', href: '/app/flowchart', icon: GitBranch },
] satisfies readonly Tool[];

export const PRACTICE_TOOLS = [
  { key: 'attack', href: '/app/attack', icon: Swords },
  { key: 'ask', href: '/app/ask', icon: MessageCircle },
  { key: 'crossfire', href: '/app/crossfire', icon: Crosshair },
  { key: 'sparring', href: '/app/sparring', icon: Dumbbell },
] satisfies readonly Tool[];

export const UTILITY_TOOLS = [
  { key: 'library', href: '/app/library', icon: Database },
  { key: 'timer', href: '/app/timer', icon: Timer },
  { key: 'history', href: '/app/history', icon: Clock },
] satisfies readonly Tool[];

// Copy that states how many modes there are reads these, so it cannot drift from the lists.
export const PREP_MODE_COUNT = PREPARE_TOOLS.length + PRACTICE_TOOLS.length;
export const UTILITY_COUNT = UTILITY_TOOLS.length;

/**
 * A link to a tool. `row` shows the description (Tools page lists); `tile` shows only
 * the label (the debate dashboard and the utility strip).
 */
export function ToolLink({ tool, variant, tourId }: { tool: Tool; variant: 'row' | 'tile'; tourId?: string }) {
  const { t } = useTranslation();
  const Icon = tool.icon;
  const prefetchHandlers = useRoutePrefetch(tool.href);

  if (variant === 'tile') {
    return (
      <Link
        to={tool.href}
        {...prefetchHandlers}
        data-tour={tourId}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors',
          'hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">{t(`nav.${tool.key}`)}</span>
      </Link>
    );
  }

  return (
    <Link
      to={tool.href}
      {...prefetchHandlers}
      data-tour={tourId}
      className="group flex items-center gap-3 rounded-md border-b border-border/60 px-3 py-3 transition-colors last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{t(`nav.${tool.key}`)}</span>
        <span className="block text-xs leading-5 text-muted-foreground sm:text-sm">{t(`home.${tool.key}Desc`, '')}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
    </Link>
  );
}
