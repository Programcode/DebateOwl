import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { LivePhase } from '@/lib/ai/client';
import { cn } from '@/lib/utils';
import { ToolRunStatus, useElapsedSeconds, type LiveRunState } from './tool-run';
import type { DraftBlock, DraftSection } from './live-sections';

/** The status line for a phase that writes nothing yet, or the tool's own label. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLivePhaseLabel(phase: LivePhase | undefined, fallback: string): string {
  const { t } = useTranslation();
  if (phase === 'research') return t('tools.live.researching', 'Researching sources…');
  if (phase === 'checking') return t('tools.live.checking', 'Checking which sources the answer used…');
  if (phase === 'writing') return t('tools.live.writing', 'Writing…');
  return fallback;
}

/** A blinking bar at the point the model is writing. */
export function LiveCaret({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="live-caret"
      className={cn('ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse bg-primary motion-reduce:animate-none', className)}
    />
  );
}

function Block({ block, writing }: { block: DraftBlock; writing: boolean }) {
  const caret = writing ? <LiveCaret /> : null;
  if (block.heading) {
    return <p className="pt-2 font-semibold text-foreground first:pt-0">{block.heading}{caret}</p>;
  }
  return (
    <div>
      {/* Result labels read "Reasoning:" inline; as a heading the colon goes. */}
      {block.label && <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{block.label.replace(/[:：]\s*$/, '')}</h4>}
      {block.items ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
          {block.items.map((item, index) => (
            <li key={index}>{item}{writing && index === block.items!.length - 1 ? caret : null}</li>
          ))}
        </ul>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{block.text}{caret}</p>
      )}
    </div>
  );
}

/**
 * A tool's answer while the model writes it: the sections written so far,
 * the caret where text is arriving, and the way out. Before any text, the
 * usual run status shows what the request is doing.
 */
export function LiveToolRun({
  label,
  live,
  sections,
  onCancel,
}: {
  label: string;
  live: LiveRunState;
  sections: DraftSection[];
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const status = useLivePhaseLabel(live.phase, label);
  const elapsed = useElapsedSeconds();
  if (sections.length === 0) return <ToolRunStatus label={status} onCancel={onCancel} />;

  const lastSection = sections.length - 1;
  const lastBlock = sections[lastSection].blocks.length - 1;
  const writing = live.phase === 'writing';
  return (
    <div data-testid="live-draft" className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary [animation-duration:600ms]" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          <span role="status" aria-live="polite">{writing ? t('tools.live.writingLive', 'Writing live') : status}</span>
          {elapsed >= 5 && <span className="ml-2 tabular-nums text-muted-foreground">{t('tools.elapsed', { seconds: elapsed, defaultValue: '{{seconds}}s' })}</span>}
        </p>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
        )}
      </div>
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5" aria-label={section.title}>
          <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
          {section.blocks.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} writing={writing && sectionIndex === lastSection && blockIndex === lastBlock} />
          ))}
        </section>
      ))}
    </div>
  );
}
