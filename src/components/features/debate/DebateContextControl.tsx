import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { useDebateContextPlan } from '@/lib/debate/context-state';
import type { ContextOutputItem, ContextSourceItem, DebateContextPlan } from '@/lib/debate/context';
import { useCurrentDebate, useDebateStore } from '@/lib/stores/debate-store';
import { outputKey, useDebateContextStore, type DebateContextUsage } from '@/lib/stores/debate-context-store';
import type { DebateContextFeature, DebateContextSide } from '../../../../supabase/functions/_shared/debate-context';

interface DebateContextControlProps {
  feature: DebateContextFeature;
  side: DebateContextSide;
  /** False when this request will not read Library sources, as in Crossfire with Source Library off. */
  includeSources?: boolean;
  /** The debate the request will use when it is not the Current Debate, such as a reopened chat. */
  debateId?: string | null;
  hidden?: boolean;
  className?: string;
}

function listFormat(language: string, parts: string[]): string {
  try {
    return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(parts);
  } catch {
    return parts.join(', ');
  }
}

/**
 * The compact line directly above a feature's primary button that says which
 * Current Debate material the next request will send, with a Review sheet to
 * change it for that request.
 */
export function DebateContextControl({ feature, side, includeSources = true, debateId: debateIdOverride, hidden = false, className = '' }: DebateContextControlProps) {
  const { t, i18n } = useTranslation();
  const debate = useCurrentDebate();
  const oneOff = useDebateStore((state) => state.oneOff);
  const debateId = debateIdOverride !== undefined ? debateIdOverride : (oneOff ? null : debate?.id ?? null);
  const plan = useDebateContextPlan(feature, side, debateId, { includeSources });
  const pinsLoaded = useDebateContextStore((state) => (debateId ? state.pinsLoaded[debateId] : true));
  const loadPins = useDebateContextStore((state) => state.loadPins);
  const usage = useDebateContextStore((state) => state.lastUsage[feature]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (debateId && !pinsLoaded) void loadPins(debateId);
  }, [debateId, loadPins, pinsLoaded]);

  const summary = useMemo(() => {
    if (!plan) return null;
    const sentSources = plan.sources.filter((source) => source.included && !source.overLimit).length;
    const sentOutputs = plan.outputs.filter((output) => output.included && !output.overLimit && !output.empty);
    const parts = [
      sentSources > 0 && t('debateContext.sourceCount', { count: sentSources }),
      sentOutputs.length > 0 && t('debateContext.resultCount', { count: sentOutputs.length }),
    ].filter((part): part is string => Boolean(part));
    const names = sentOutputs.map((output) => output.side === 'pro' || output.side === 'con'
      ? t('debateContext.resultName', { kind: t(`debate.kinds.${output.ref.kind}`), side: t(`debate.side.${output.side}`) })
      : t(`debate.kinds.${output.ref.kind}`));
    const leftOut = plan.sources.filter((source) => source.omittedForSize || source.overLimit).length
      + plan.outputs.filter((output) => output.omittedForSize || output.overLimit).length;
    return {
      text: parts.length > 0
        ? t('debateContext.using', { list: listFormat(i18n.resolvedLanguage ?? 'en', parts) })
        : t('debateContext.usingMotionOnly'),
      names: names.join(', '),
      leftOut,
    };
  }, [i18n.resolvedLanguage, plan, t]);

  if (hidden) return null;
  const base = `flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm ${className}`;

  if (!debateId || !plan || !summary) {
    return (
      <p className={`${base} border-dashed border-border bg-muted/40 text-muted-foreground`} data-testid="debate-context-control">
        {oneOff && debateIdOverride === undefined
          ? t('debateContext.oneOff', 'One-off mode: no Current Debate material will be used or saved.')
          : t('debateContext.noDebate', 'No Current Debate, so no debate material will be used.')}
      </p>
    );
  }

  return (
    <div className={`${base} border-primary/20 bg-primary/5`} data-testid="debate-context-control">
      <p className="min-w-0 flex-1 basis-56">
        <span className="font-medium text-foreground">{summary.text}</span>
        {summary.names && <span className="text-muted-foreground">: {summary.names}</span>}
        {summary.leftOut > 0 && (
          <span className="block text-xs text-muted-foreground">{t('debateContext.leftOut', { count: summary.leftOut })}</span>
        )}
      </p>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t('debateContext.review', 'Review')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <DebateContextReview plan={plan} motion={debate?.id === debateId ? debate.motion : undefined} usage={usage} pinsReady={Boolean(pinsLoaded)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DebateContextReview({ plan, motion, usage, pinsReady }: { plan: DebateContextPlan; motion?: string; usage?: DebateContextUsage; pinsReady: boolean }) {
  const { t } = useTranslation();
  const setSourceChoice = useDebateContextStore((state) => state.setSourceChoice);
  const setOutputChoice = useDebateContextStore((state) => state.setOutputChoice);
  const resetOverride = useDebateContextStore((state) => state.resetOverride);
  const togglePin = useDebateContextStore((state) => state.togglePin);
  const hasOverride = useDebateContextStore((state) => Boolean(state.overrides[plan.feature]));

  const onPin = async (output: ContextOutputItem) => {
    try {
      await togglePin(plan.debateId, output.ref, plan.pinnedCount);
    } catch (error) {
      toast({
        title: error instanceof Error && error.message === 'pin_limit'
          ? t('debateContext.pinLimit', 'You can pin up to 3 results in a debate.')
          : t('debateContext.pinFailed', 'Could not save the pin. Try again.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
        <SheetTitle>{t('debateContext.reviewTitle', 'What this request will use')}</SheetTitle>
        <SheetDescription>
          {t('debateContext.reviewDesc', 'Changes here apply to your next request only. Pinned results stay included until you unpin them.')}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-5 py-4">
        <section aria-labelledby="debate-context-debate" className="space-y-1 text-sm">
          <h3 id="debate-context-debate" className="font-medium">{t('debateContext.debateHeading', 'Debate')}</h3>
          {motion && <p className="break-words text-foreground">{motion}</p>}
          <p className="text-muted-foreground">
            {plan.policy.instructions
              ? t('debateContext.instructionsUsed', 'Your debate settings and instructions are included.')
              : t('debateContext.instructionsNotUsed', 'Your debate settings are included. Free-form instructions are not used here, so they cannot change how this exchange is run.')}
          </p>
        </section>

        <section aria-labelledby="debate-context-sources" className="space-y-2">
          <h3 id="debate-context-sources" className="text-sm font-medium">{t('debateContext.sourcesHeading', 'Library sources')}</h3>
          {!plan.policy.sources ? (
            <p className="text-sm text-muted-foreground">
              {plan.feature === 'sparring'
                ? t('debateContext.sparringNoSources', 'Live sparring rounds use only the transcript, the motion, and your debate settings.')
                : t('debateContext.sourcesOff', 'Source Library is off for this request.')}
            </p>
          ) : plan.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('debateContext.noSources', 'This debate has no Library sources yet.')}</p>
          ) : (
            <ul className="space-y-1">
              {plan.sources.map((source) => (
                <SourceRow key={source.id} source={source} onChange={(include) => setSourceChoice(plan.feature, plan.debateId, source.id, include)} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="debate-context-results" className="space-y-2">
          <h3 id="debate-context-results" className="text-sm font-medium">{t('debateContext.resultsHeading', 'Saved results')}</h3>
          {!plan.policy.outputs ? (
            <p className="text-sm text-muted-foreground">{t('debateContext.sparringNoResults', 'Saved results stay out of live rounds so the opponent and judge respond only to what is said.')}</p>
          ) : plan.outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('debateContext.noResults', 'Nothing saved in this debate yet.')}</p>
          ) : (
            <ul className="space-y-1">
              {plan.outputs.map((output) => (
                <OutputRow
                  key={outputKey(output.ref)}
                  output={output}
                  onChange={(include) => setOutputChoice(plan.feature, plan.debateId, output.ref, include)}
                  onPin={() => void onPin(output)}
                  pinDisabled={!pinsReady}
                />
              ))}
            </ul>
          )}
        </section>

        {usage && usage.debateId === plan.debateId && <LastRequest usage={usage} />}

        {hasOverride && (
          <Button type="button" variant="outline" size="sm" onClick={() => resetOverride(plan.feature)}>
            {t('debateContext.resetChoices', 'Use the automatic selection')}
          </Button>
        )}
      </div>
    </>
  );
}

function statusNote(item: { overLimit: boolean; omittedForSize: boolean; shortened?: boolean; empty?: boolean }, t: ReturnType<typeof useTranslation>['t']): string | null {
  if (item.overLimit) return t('debateContext.overLimit', 'Over the per-request limit, so it will not be sent.');
  if (item.omittedForSize) return t('debateContext.tooLarge', 'Too large to fit with the rest, so it will be left out.');
  if (item.empty) return t('debateContext.empty', 'Nothing usable yet.');
  if (item.shortened) return t('debateContext.shortened', 'Shortened to fit.');
  return null;
}

function SourceRow({ source, onChange }: { source: ContextSourceItem; onChange: (include: boolean) => void }) {
  const { t } = useTranslation();
  const id = `debate-context-source-${source.id}`;
  const note = source.included ? statusNote(source, t) : (!source.active ? t('debateContext.inactive', 'Turned off in your Library.') : null);
  return (
    <li className="flex items-start gap-3 rounded-md px-1 py-1.5">
      <Checkbox id={id} checked={source.included} onCheckedChange={(checked) => onChange(checked === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
        <span className="block break-words">{source.title}</span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </label>
    </li>
  );
}

function OutputRow({ output, onChange, onPin, pinDisabled }: { output: ContextOutputItem; onChange: (include: boolean) => void; onPin: () => void; pinDisabled: boolean }) {
  const { t } = useTranslation();
  const id = `debate-context-output-${output.ref.kind}-${output.ref.id}`;
  const note = output.included ? statusNote(output, t) : null;
  const kind = t(`debate.kinds.${output.ref.kind}`);
  return (
    <li className="flex items-start gap-3 rounded-md px-1 py-1.5">
      <Checkbox id={id} checked={output.included} onCheckedChange={(checked) => onChange(checked === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
        <span className="block break-words">{output.title || kind}</span>
        <span className="block text-xs text-muted-foreground">
          {output.side ? t('debateContext.resultMeta', { kind, side: t(`debate.side.${output.side}`) }) : kind}
          {output.pinned && `, ${t('debateContext.pinned', 'pinned')}`}
        </span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </label>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        aria-pressed={output.pinned}
        aria-label={output.pinned
          ? t('debateContext.unpinAria', { title: output.title || kind })
          : t('debateContext.pinAria', { title: output.title || kind })}
        onClick={onPin}
        disabled={pinDisabled}
      >
        {output.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </Button>
    </li>
  );
}

function LastRequest({ usage }: { usage: DebateContextUsage }) {
  const { t } = useTranslation();
  const leftOut = usage.sourcesOmittedForSize + usage.outputsOmittedForSize.length;
  const unavailable = usage.sourcesUnavailable + usage.outputsUnavailable;
  return (
    <section aria-labelledby="debate-context-last" className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <h3 id="debate-context-last" className="font-medium">{t('debateContext.lastHeading', 'Your last request here')}</h3>
      <p className="text-muted-foreground">
        {t('debateContext.lastUsed', {
          sources: t('debateContext.sourceCount', { count: usage.sourcesUsed }),
          results: t('debateContext.resultCount', { count: usage.outputsUsed.length }),
        })}
      </p>
      {leftOut > 0 && <p className="text-muted-foreground">{t('debateContext.lastLeftOut', { count: leftOut })}</p>}
      {usage.sourcesShortened > 0 && <p className="text-muted-foreground">{t('debateContext.lastShortened', { count: usage.sourcesShortened })}</p>}
      {unavailable > 0 && <p className="text-muted-foreground">{t('debateContext.lastUnavailable', { count: unavailable })}</p>}
    </section>
  );
}
