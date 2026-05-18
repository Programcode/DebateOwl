import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Swords,
  Lightbulb,
  BookOpen,
  MessageCircle,
  Database,
  Timer,
  GitBranch,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const modeKeys = [
  { key: 'generate', icon: Sparkles, href: '/app/generate' },
  { key: 'attack', icon: Swords, href: '/app/attack' },
  { key: 'brainstorm', icon: Lightbulb, href: '/app/brainstorm' },
  { key: 'factoids', icon: BookOpen, href: '/app/factoids' },
  { key: 'ask', icon: MessageCircle, href: '/app/ask' },
  { key: 'library', icon: Database, href: '/app/library' },
  { key: 'timer', icon: Timer, href: '/app/timer' },
  { key: 'flowchart', icon: GitBranch, href: '/app/flowchart' },
  { key: 'history', icon: Clock, href: '/app/history' },
];

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto flex min-h-[72vh] max-w-5xl flex-col justify-center">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{t('home.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('home.subtitle')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {modeKeys.map((mode) => (
            <Link key={mode.key} to={mode.href} className="group">
              <Card
                className={cn(
                  'h-full border-border/70 bg-card/60 transition-all',
                  'hover:border-primary/40 hover:bg-card'
                )}
              >
                <CardHeader>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <CardTitle className="text-lg">{t(`home.${mode.key}`)}</CardTitle>
                  <CardDescription>{t(`home.${mode.key}Desc`)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
