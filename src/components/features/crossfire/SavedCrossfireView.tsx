import { useTranslation } from 'react-i18next';
import { AlertCircle, MessageSquare, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  CrossfireDebriefSchema,
  CrossfireTranscriptSchema,
  type CrossfireDebrief,
  type CrossfireTurn,
} from '@/lib/crossfire/schemas';
import { cn } from '@/lib/utils';

export interface SavedCrossfire {
  turns: CrossfireTurn[];
  debrief: CrossfireDebrief | null;
  endedReason?: 'manual' | 'timer';
}

/**
 * Reads a recorded Crossfire round at the trust boundary. Older or damaged
 * rows that do not match the current shape come back null, and the debrief
 * alone may be missing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function parseSavedCrossfire(output: unknown): SavedCrossfire | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const record = output as Record<string, unknown>;
  const turns = CrossfireTranscriptSchema.safeParse(record.turns);
  if (!turns.success) return null;
  const debrief = CrossfireDebriefSchema.safeParse(record.debrief);
  const endedReason = record.endedReason === 'manual' || record.endedReason === 'timer' ? record.endedReason : undefined;
  return { turns: turns.data, debrief: debrief.success ? debrief.data : null, ...(endedReason ? { endedReason } : {}) };
}

interface ReferenceItem {
  turnIds: string[];
  claim: string;
}

// The same markup as the live debrief on the Crossfire page, so a reopened
// round reads the way it did when it ended. References jump to the turns below.
function TurnReferences({ turnIds }: { turnIds: string[] }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5" aria-label={t('crossfire.transcriptReferences')}>
      {turnIds.map((turnId) => (
        <a
          key={turnId}
          href={`#crossfire-turn-${turnId}`}
          className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {turnId}
        </a>
      ))}
    </span>
  );
}

function DebriefSection({ title, items, emptyLabel }: { title: string; items: ReferenceItem[]; emptyLabel: string }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item.turnIds.join('-')}-${index}`} className="space-y-2 rounded-lg border border-border/70 bg-card p-4">
              <p className="text-sm leading-relaxed text-foreground">{item.claim}</p>
              <TurnReferences turnIds={item.turnIds} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Debrief({ debrief }: { debrief: CrossfireDebrief }) {
  const { t } = useTranslation();
  const empty = t('crossfire.noGroundedFinding', 'No grounded finding in this transcript.');
  return (
    <div data-testid="saved-crossfire-debrief" className="space-y-6">
      <h3 className="text-lg font-bold tracking-tight">{t('crossfire.debriefTitle')}</h3>
      <div className="grid gap-6">
        <DebriefSection title={t('crossfire.concessionsSecured')} items={debrief.concessionsSecured} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.controlledQuestions')} items={debrief.controlledQuestions} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.weakOrRepetitiveQuestions')} items={debrief.weakOrRepetitiveQuestions} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.evasiveOrIncompleteAnswers')} items={debrief.evasiveOrIncompleteAnswers} emptyLabel={empty} />
        <DebriefSection title={t('crossfire.missedFollowUps')} items={debrief.missedFollowUps} emptyLabel={empty} />
        <section className="space-y-3" aria-label={t('crossfire.betterFollowUpQuestions')}>
          <h3 className="text-base font-semibold">{t('crossfire.betterFollowUpQuestions')}</h3>
          {debrief.betterFollowUpQuestions.length === 0 ? (
            <p className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="space-y-2">
              {debrief.betterFollowUpQuestions.map((item, index) => (
                <li key={`${item.turnIds.join('-')}-${index}`} className="space-y-2 rounded-lg border border-border/70 bg-card p-4">
                  <p className="font-medium text-foreground">{item.question}</p>
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                  <TurnReferences turnIds={item.turnIds} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-5" aria-label={t('crossfire.strongestExchange')}>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{t('crossfire.strongestExchange')}</h3>
        </div>
        {debrief.strongestExchange ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{debrief.strongestExchange.claim}</p>
            <TurnReferences turnIds={debrief.strongestExchange.turnIds} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </section>
    </div>
  );
}

function Transcript({ turns }: { turns: CrossfireTurn[] }) {
  const { t } = useTranslation();
  return (
    <section data-testid="saved-crossfire-transcript" aria-label={t('crossfire.transcript')} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{t('crossfire.transcript')}</h3>
      </div>
      <div className="space-y-3">
        {turns.map((turn) => (
          <article
            key={turn.id}
            id={`crossfire-turn-${turn.id}`}
            className={cn(
              'scroll-mt-4 rounded-lg border p-4',
              turn.speaker === 'user' ? 'ml-auto max-w-[92%] border-primary/25 bg-primary/5' : 'mr-auto max-w-[92%] border-border bg-card',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{turn.id}</span>
              <span>{turn.kind === 'question' ? t('crossfire.question') : t('crossfire.answer')}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{turn.text}</p>
            {turn.kind === 'answer' && turn.signal ? (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('crossfire.liveSignals')}>
                <Badge variant="outline">{t(`crossfire.signalQuality.${turn.signal.answerQuality}`)}</Badge>
                <Badge variant="outline">{t(`crossfire.signalConcession.${turn.signal.concession}`)}</Badge>
                {turn.signal.followUpOpportunity > 0.70 ? <Badge variant="secondary">{t('crossfire.signalFollowUp')}</Badge> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/** A finished Crossfire round from History: the debrief, then the transcript it cites. */
export function SavedCrossfireView({ output }: { output: unknown }) {
  const { t } = useTranslation();
  const round = parseSavedCrossfire(output);
  if (!round) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground" role="status">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t('historyPage.crossfireUnreadable', 'This round was saved in an older format and cannot be shown.')}
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {round.debrief ? <Debrief debrief={round.debrief} /> : (
        <p className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">{t('historyPage.crossfireNoDebrief', 'This round has no debrief.')}</p>
      )}
      <Transcript turns={round.turns} />
    </div>
  );
}
