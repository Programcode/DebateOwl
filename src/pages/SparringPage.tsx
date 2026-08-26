import { useMemo, useState } from 'react';
import { History, Swords } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SparringSetup } from '@/components/features/sparring/SparringSetup';
import { SparringRound } from '@/components/features/sparring/SparringRound';
import { SparringScorecard } from '@/components/features/sparring/SparringScorecard';
import { LimitReachedModal, ModelRestrictedModal, PricingModal } from '@/components/features/subscription';
import { AnimatedSection } from '@/components/ui/animated-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StreamingIndicator } from '@/components/ui/streaming-indicator';
import { askChat } from '@/lib/ai/client';
import { requestSparringOpponent, requestSparringScorecard } from '@/lib/ai/sparring-client';
import type { SparringSetup as SparringSetupType, SparringTurn, SparringTurnPhase } from '@/lib/ai/schemas/sparring';
import { getUserFacingAIError } from '@/lib/ai/error-display';
import { captureProductEvent } from '@/lib/observability';
import { exportSparringToDocx, exportSparringToPdf } from '@/lib/sparring-export';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { getSparringSession, useSparringStore } from '@/lib/stores/sparring-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { useToast } from '@/hooks/use-toast';

function transcriptText(turns: SparringTurn[]) {
  return turns.map((turn, index) => `${index + 1}. ${turn.role === 'user' ? 'You' : 'AI opponent'} (${turn.phase}): ${turn.content}`).join('\n\n');
}

function userAdvocacyText(turns: SparringTurn[]) {
  return turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => `${turn.phase.toUpperCase()}:\n${turn.content}`)
    .join('\n\n');
}

export default function SparringPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const subError = useSubscriptionError();
  const config = useSettingsStore((state) => state.getFeatureConfig('sparring'));
  const askConfig = useSettingsStore((state) => state.getFeatureConfig('ask'));
  const sessions = useSparringStore((state) => state.sessions);
  const activeSessionId = useSparringStore((state) => state.activeSessionId);
  const startSession = useSparringStore((state) => state.startSession);
  const addTurn = useSparringStore((state) => state.addTurn);
  const completeSession = useSparringStore((state) => state.completeSession);
  const setActiveSession = useSparringStore((state) => state.setActiveSession);
  const activeSourceCount = useSessionStore((state) => state.sourceLibrary.filter((source) => source.isActive).length);
  const {
    addAskMessage,
    setAskLoading,
    askMessages,
    setAttackForm,
    setBrainstormForm,
    setFactoidsForm,
  } = useSessionStore();
  const [isThinking, setIsThinking] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [pressurePoints, setPressurePoints] = useState<string[]>([]);

  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );
  const recentCompleted = sessions.filter((item) => item.status === 'complete').slice(0, 5);

  const handleAIError = (error: unknown, title: string) => {
    console.error(title, error);
    if (!subError.handleSubscriptionError(error)) {
      toast({ title, description: getUserFacingAIError(error), variant: 'destructive' });
    }
  };

  const handleStart = (setup: SparringSetupType) => {
    const created = startSession(setup);
    setPressurePoints([]);
    captureProductEvent('sparring_started', {
      difficulty: setup.difficulty,
      side: setup.side,
      active_sources: activeSourceCount,
    });
    setActiveSession(created.id);
  };

  const handleSubmitSpeech = async (content: string, phase: SparringTurnPhase) => {
    if (!session || isThinking) return;
    addTurn(session.id, { role: 'user', phase, content });
    captureProductEvent(phase === 'opening' ? 'sparring_opening_submitted' : 'sparring_turn_completed', {
      phase,
      speaker: 'user',
      speech_length: content.length,
      difficulty: session.setup.difficulty,
    });

    const updated = getSparringSession(session.id);
    if (!updated) return;

    setIsThinking(true);
    try {
      const opponent = await requestSparringOpponent(updated, content, config);
      addTurn(session.id, { role: 'ai', phase, content: opponent.speech });
      setPressurePoints(opponent.pressurePoints);
      captureProductEvent('sparring_turn_completed', {
        phase,
        speaker: 'ai',
        pressure_points: opponent.pressurePoints.length,
      });
    } catch (error) {
      handleAIError(error, 'Opponent response failed');
    } finally {
      setIsThinking(false);
    }
  };

  const handleRetryOpponent = async () => {
    if (!session || isThinking) return;
    const current = getSparringSession(session.id);
    if (!current) return;
    const userTurns = current.turns.filter((turn) => turn.role === 'user');
    const aiTurns = current.turns.filter((turn) => turn.role === 'ai');
    if (userTurns.length !== aiTurns.length + 1) return;
    const latestUserTurn = [...current.turns].reverse().find((turn) => turn.role === 'user');
    if (!latestUserTurn) return;

    setIsThinking(true);
    try {
      const opponent = await requestSparringOpponent(current, latestUserTurn.content, config);
      addTurn(current.id, { role: 'ai', phase: latestUserTurn.phase, content: opponent.speech });
      setPressurePoints(opponent.pressurePoints);
      captureProductEvent('sparring_turn_completed', {
        phase: latestUserTurn.phase,
        speaker: 'ai',
        retry: true,
        pressure_points: opponent.pressurePoints.length,
      });
    } catch (error) {
      handleAIError(error, 'Opponent retry failed');
    } finally {
      setIsThinking(false);
    }
  };

  const handleFinish = async () => {
    if (!session || isScoring) return;
    const current = getSparringSession(session.id);
    if (!current || current.turns.filter((turn) => turn.role === 'user').length < 2 || current.turns.filter((turn) => turn.role === 'ai').length < 2) return;

    setIsScoring(true);
    try {
      const scorecard = await requestSparringScorecard(current, config);
      completeSession(current.id, scorecard);
      captureProductEvent('sparring_completed', {
        difficulty: current.setup.difficulty,
        turns: current.turns.length,
        verdict: scorecard.verdict,
      });
      captureProductEvent('sparring_scorecard_viewed', {
        verdict: scorecard.verdict,
        difficulty: current.setup.difficulty,
      });
    } catch (error) {
      handleAIError(error, 'Scorecard failed');
    } finally {
      setIsScoring(false);
    }
  };

  const handleRematch = () => {
    if (!session) return;
    const next = startSession(session.setup);
    setPressurePoints([]);
    captureProductEvent('sparring_restarted', { same_motion: true, difficulty: session.setup.difficulty });
    setActiveSession(next.id);
  };

  const handleDiscuss = async () => {
    if (!session?.scorecard) return;
    const prompt = `I just finished a DebateLab sparring round and want to improve it.\n\nMotion: ${session.setup.motion}\nMy side: ${session.setup.side}\nVerdict: ${session.scorecard.verdict}\nBiggest improvement: ${session.scorecard.biggestImprovement}\nNext drill: ${session.scorecard.nextDrill}\n\nTranscript:\n${transcriptText(session.turns)}\n\nHelp me turn this feedback into a concrete improvement plan. Focus on the actual transcript.`;

    addAskMessage({ role: 'user', content: prompt });
    navigate('/app/ask');
    captureProductEvent('sparring_feedback_action_used', { action: 'discuss_in_ask' });
    setAskLoading(true);
    try {
      const history = [...askMessages, { role: 'user' as const, content: prompt }].map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));
      const result = await askChat(prompt, history, 'general', askConfig);
      addAskMessage({ role: 'assistant', content: result.response, output: result });
    } catch (error) {
      if (!subError.handleSubscriptionError(error)) {
        toast({ title: 'Coach follow-up failed', description: getUserFacingAIError(error), variant: 'destructive' });
      }
    } finally {
      setAskLoading(false);
    }
  };

  const handleAttackRound = () => {
    if (!session) return;
    setAttackForm({
      caseText: `Motion: ${session.setup.motion}\nSide: ${session.setup.side}\n\n${userAdvocacyText(session.turns)}`,
      aggressiveness: 'ruthless',
      judgeParadigm: 'logic',
      detectFallacies: true,
      analyzeWeighing: true,
    });
    captureProductEvent('sparring_feedback_action_used', { action: 'attack_round' });
    navigate('/app/attack');
  };

  const handleBrainstormMissed = () => {
    if (!session) return;
    setBrainstormForm({
      motion: session.setup.motion,
      side: session.setup.side,
      outputMode: 'topfive',
      context: `Use this completed practice round to find better arguments, extensions, and responses for my side.\n\nTranscript:\n${transcriptText(session.turns)}\n\nScorecard missed opportunities:\n${session.scorecard?.missedArguments.join('\n') || 'None listed.'}`,
    });
    captureProductEvent('sparring_feedback_action_used', { action: 'brainstorm_missed' });
    navigate('/app/brainstorm');
  };

  const handleVerifyOpening = () => {
    if (!session) return;
    const opening = session.turns.find((turn) => turn.role === 'user' && turn.phase === 'opening');
    if (!opening) return;
    setFactoidsForm({
      claim: opening.content,
      direction: 'for',
      region: 'Global',
      sourceType: 'any',
      timeframe: 'Recent (last 5 years)',
      sourceCount: 5,
    });
    captureProductEvent('sparring_feedback_action_used', { action: 'verify_opening' });
    navigate('/app/factoids');
  };

  const handleExportDocx = async () => {
    if (!session) return;
    const ok = await exportSparringToDocx(session);
    captureProductEvent('sparring_feedback_action_used', { action: 'export_docx', success: ok });
    toast({
      title: ok ? 'Word export ready' : 'Word export failed',
      description: ok ? 'The round transcript and scorecard were exported.' : 'Could not create the Word document.',
      variant: ok ? 'success' : 'destructive',
    });
  };

  const handleExportPdf = async () => {
    if (!session) return;
    const ok = await exportSparringToPdf(session);
    captureProductEvent('sparring_feedback_action_used', { action: 'export_pdf', success: ok });
    toast({
      title: ok ? 'PDF export ready' : 'PDF export failed',
      description: ok ? 'The round transcript and scorecard were exported.' : 'Could not create the PDF.',
      variant: ok ? 'success' : 'destructive',
    });
  };

  const handleNewRound = () => {
    setPressurePoints([]);
    setActiveSession(null);
  };

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Swords className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Sparring</h1>
              <p className="mt-1 text-muted-foreground">Research. Build. Practice. Diagnose. Improve.</p>
            </div>
          </div>
        </AnimatedSection>

        {isScoring && session ? (
          <AnimatedSection>
            <Card className="min-h-[420px] border-primary/20 bg-primary/5">
              <CardContent className="flex min-h-[420px] items-center justify-center pt-6">
                <StreamingIndicator messages={[
                  'Replaying the clash...',
                  'Checking warrants against the transcript...',
                  'Comparing impacts and weighing...',
                  'Building your next drill...',
                ]} />
              </CardContent>
            </Card>
          </AnimatedSection>
        ) : session?.status === 'complete' && session.scorecard ? (
          <AnimatedSection>
            <SparringScorecard
              session={session}
              scorecard={session.scorecard}
              onRematch={handleRematch}
              onDiscuss={handleDiscuss}
              onAttackRound={handleAttackRound}
              onBrainstormMissed={handleBrainstormMissed}
              onVerifyOpening={handleVerifyOpening}
              onNewRound={handleNewRound}
              onExportDocx={handleExportDocx}
              onExportPdf={handleExportPdf}
            />
          </AnimatedSection>
        ) : session ? (
          <AnimatedSection>
            <SparringRound
              session={session}
              isThinking={isThinking}
              pressurePoints={pressurePoints}
              onSubmitSpeech={handleSubmitSpeech}
              onRetryOpponent={handleRetryOpponent}
              onFinish={handleFinish}
            />
          </AnimatedSection>
        ) : (
          <>
            <AnimatedSection>
              <SparringSetup onStart={handleStart} />
            </AnimatedSection>

            {recentCompleted.length > 0 && (
              <AnimatedSection delay={100} className="mt-8">
                <Card className="border-border/70 bg-card/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" />Recent sparring rounds</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {recentCompleted.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setActiveSession(item.id)}
                        className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-accent/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.setup.motion}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                        <Badge variant="outline" className="shrink-0 capitalize">{item.scorecard?.verdict.replace('-', ' ')}</Badge>
                      </button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => navigate('/app/history')}>Open full history</Button>
                  </CardContent>
                </Card>
              </AnimatedSection>
            )}
          </>
        )}
      </div>

      <LimitReachedModal
        open={subError.limitModalOpen}
        onOpenChange={subError.setLimitModalOpen}
        variant={subError.limitModalVariant}
        limit={subError.limitModalLimit}
        current={subError.limitModalCurrent}
        onUpgrade={() => { subError.setLimitModalOpen(false); subError.setPricingModalOpen(true); }}
      />
      <ModelRestrictedModal
        open={subError.modelModalOpen}
        onOpenChange={subError.setModelModalOpen}
        onUpgrade={() => { subError.setModelModalOpen(false); subError.setPricingModalOpen(true); }}
      />
      <PricingModal open={subError.pricingModalOpen} onOpenChange={subError.setPricingModalOpen} />
    </div>
  );
}
