import { useMemo, useState } from 'react';
import { Bot, Flag, Send, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/ui/markdown';
import { Textarea } from '@/components/ui/textarea';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import type { SparringSession, SparringTurnPhase } from '@/lib/ai/schemas/sparring';

interface SparringRoundProps {
  session: SparringSession;
  isThinking: boolean;
  pressurePoints: string[];
  onSubmitSpeech: (content: string, phase: SparringTurnPhase) => Promise<void> | void;
  onFinish: () => Promise<void> | void;
}

export function SparringRound({ session, isThinking, pressurePoints, onSubmitSpeech, onFinish }: SparringRoundProps) {
  const [draft, setDraft] = useState('');
  const userTurns = session.turns.filter((turn) => turn.role === 'user').length;
  const aiTurns = session.turns.filter((turn) => turn.role === 'ai').length;
  const phase: SparringTurnPhase = userTurns === 0 ? 'opening' : 'rebuttal';
  const canSubmit = draft.trim().length >= 20 && !isThinking && userTurns < 2 && userTurns === aiTurns;
  const canFinish = userTurns >= 2 && aiTurns >= 2 && !isThinking;

  const roundLabel = useMemo(() => {
    if (userTurns === 0) return 'Your opening';
    if (userTurns === 1 && aiTurns === 1) return 'Your rebuttal';
    if (userTurns >= 2 && aiTurns >= 2) return 'Round complete';
    return 'Opponent responding';
  }, [userTurns, aiTurns]);

  const submit = async () => {
    if (!canSubmit) return;
    const speech = draft.trim();
    setDraft('');
    await onSubmitSpeech(speech, phase);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{session.setup.side === 'pro' ? 'Pro / Proposition' : 'Con / Opposition'}</Badge>
                <Badge variant="outline" className="capitalize">{session.setup.difficulty}</Badge>
                <Badge variant="secondary">{Math.min(session.turns.length, 4)}/4 speeches</Badge>
              </div>
              <h2 className="mt-3 text-xl font-semibold">{session.setup.motion}</h2>
            </div>
            <div className="text-sm font-medium text-primary">{roundLabel}</div>
          </CardContent>
        </Card>

        <div className="space-y-3" aria-live="polite">
          {session.turns.map((turn) => (
            <Card key={turn.id} className={turn.role === 'user' ? 'ml-auto max-w-[92%] border-primary/30' : 'mr-auto max-w-[92%] border-border/70 bg-card/70'}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {turn.role === 'user' ? <UserRound className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-primary" />}
                  {turn.role === 'user' ? 'You' : 'AI opponent'}
                  <Badge variant="outline" className="ml-auto capitalize text-[10px]">{turn.phase}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {turn.role === 'ai' ? <Markdown>{turn.content}</Markdown> : <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</p>}
              </CardContent>
            </Card>
          ))}

          {isThinking && (
            <Card className="mr-auto max-w-[92%] border-border/70 bg-card/70">
              <CardContent className="pt-6">
                <StreamingIndicator messages={[
                  'Finding the strongest clash...',
                  'Testing your warrants...',
                  'Building the opponent response...',
                ]} />
              </CardContent>
            </Card>
          )}
        </div>

        {userTurns < 2 ? (
          <Card className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{phase === 'opening' ? 'Deliver your opening' : 'Answer the clash'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={isThinking || userTurns !== aiTurns}
                placeholder={phase === 'opening'
                  ? 'Build your case. Give the AI something specific to attack: claim, warrant, impact, and evidence if you have it.'
                  : 'Do not restart your case. Answer the opponent, repair your warrant, and weigh why your side still wins.'}
                className="min-h-44 resize-y"
                maxLength={6000}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">{draft.length}/6000 · Minimum 20 characters</span>
                <Button onClick={submit} disabled={!canSubmit}>
                  <Send className="mr-2 h-4 w-4" />
                  Send {phase}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button size="lg" onClick={onFinish} disabled={!canFinish} className="w-full sm:w-auto">
            <Flag className="mr-2 h-4 w-4" />
            Finish and get scorecard
          </Button>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Round objective</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Opening:</strong> establish a clear warrant chain and impact.</p>
            <p><strong className="text-foreground">Rebuttal:</strong> answer the opponent's actual offense, then compare worlds.</p>
            <p><strong className="text-foreground">Scorecard:</strong> uses only the typed transcript. It will not pretend to judge vocal delivery.</p>
          </CardContent>
        </Card>

        {pressurePoints.length > 0 && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opponent pressure points</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {pressurePoints.map((point) => <li key={point}>• {point}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}
