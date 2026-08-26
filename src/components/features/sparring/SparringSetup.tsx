import { useMemo, useState } from 'react';
import { BookOpenCheck, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelector } from '@/components/ModelSelector';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/lib/stores/session-store';
import { SparringSetupSchema, type SparringDifficulty, type SparringSetup } from '@/lib/ai/schemas/sparring';

interface SparringSetupProps {
  onStart: (setup: SparringSetup) => void;
  isStarting?: boolean;
  defaultMotion?: string;
}

const difficulties: Array<{
  id: SparringDifficulty;
  label: string;
  description: string;
  icon: typeof Shield;
}> = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Clear clash and forgiving pressure. Good for drilling fundamentals.',
    icon: Shield,
  },
  {
    id: 'competitive',
    label: 'Competitive',
    description: 'A competent tournament opponent that directly engages your case.',
    icon: Swords,
  },
  {
    id: 'brutal',
    label: 'Brutal',
    description: 'Elimination-round pressure. Dropped warrants and weak weighing get punished.',
    icon: Zap,
  },
];

export function SparringSetup({ onStart, isStarting = false, defaultMotion = '' }: SparringSetupProps) {
  const [motion, setMotion] = useState(defaultMotion);
  const [side, setSide] = useState<'pro' | 'con'>('pro');
  const [difficulty, setDifficulty] = useState<SparringDifficulty>('competitive');
  const [useActiveSources, setUseActiveSources] = useState(true);
  const activeSourceCount = useSessionStore((state) => state.sourceLibrary.filter((source) => source.isActive).length);

  const validation = useMemo(() => SparringSetupSchema.safeParse({ motion, side, difficulty, useActiveSources }), [motion, side, difficulty, useActiveSources]);

  const handleStart = () => {
    if (!validation.success) return;
    onStart(validation.data);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="border-border/70 bg-card/70">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Set up a round</CardTitle>
              <CardDescription>Start small: two speeches from you, two from the AI, then an evidence-backed scorecard.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sparring-motion">Motion</Label>
            <Textarea
              id="sparring-motion"
              value={motion}
              onChange={(event) => setMotion(event.target.value)}
              placeholder="This House would ban targeted advertising to minors."
              className="min-h-28 resize-y"
              maxLength={1200}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{!validation.success && motion.length > 0 ? 'Use a complete motion so the opponent has something specific to clash with.' : 'Use the exact tournament wording when you have it.'}</span>
              <span>{motion.length}/1200</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Your side</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['pro', 'con'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={side === value ? 'default' : 'outline'}
                  onClick={() => setSide(value)}
                  aria-pressed={side === value}
                >
                  {value === 'pro' ? 'Pro / Proposition' : 'Con / Opposition'}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Opponent difficulty</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {difficulties.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setDifficulty(item.id)}
                  aria-pressed={difficulty === item.id}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    difficulty === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border/70 bg-background/40 hover:border-primary/40',
                  )}
                >
                  <item.icon className="mb-3 h-5 w-5 text-primary" />
                  <div className="font-medium">{item.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Round intelligence</CardTitle>
            <CardDescription>Choose the model independently from Ask.</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelSelector feature="sparring" showLabel />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70">
          <CardContent className="flex items-start justify-between gap-4 pt-6">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <BookOpenCheck className="h-4 w-4 text-primary" />
                Use active sources
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {activeSourceCount > 0
                  ? `${activeSourceCount} active ${activeSourceCount === 1 ? 'source is' : 'sources are'} available as grounding context.`
                  : 'No active sources are currently selected. The opponent will avoid inventing evidence.'}
              </p>
            </div>
            <Switch checked={useActiveSources} onCheckedChange={setUseActiveSources} aria-label="Use active sources for sparring" />
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" disabled={!validation.success || isStarting} onClick={handleStart}>
          <Swords className="mr-2 h-4 w-4" />
          Start sparring
        </Button>
      </div>
    </div>
  );
}
