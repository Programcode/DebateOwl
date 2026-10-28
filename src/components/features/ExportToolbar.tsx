import { Children, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTranslation } from 'react-i18next';
import { FileText, FileDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';
import { cn } from '@/lib/utils';

interface ExportToolbarProps {
  onPdf: () => void;
  onDocx: () => void;
  onGoogleDocs: () => void;
  isExportingGDocs?: boolean;
  onDiscuss?: () => void;
  discussLabel?: string;
  /** Buttons that appear on the export row, between the EXPORT tag and PDF/DOCX/Google Docs (e.g. Clipboard). */
  extraExports?: ReactNode;
  /** Buttons that appear on the top row (Save, Discuss, Flowcharts, Undo, etc.). */
  secondaryActions?: ReactNode;
  /**
   * Rows that wrap fill evenly. On a phone both rows stretch into pairs and the EXPORT tag takes its
   * own line; wider, a row that needs two lines splits its buttons evenly (3+2, 3+3) and stretches them.
   */
  evenRows?: boolean;
}

// On a phone each button grows from half the row, so two share a line and a
// label too long for half takes the whole line; nothing is left ragged. Buttons
// set their own touch min-width, which would let a long label shrink into half
// a row, so the width of the label wins.
const EVEN_ROW = 'max-sm:[&>*]:grow max-sm:[&>*]:basis-[calc(50%-0.25rem)] [&>*]:whitespace-nowrap [&>*]:min-w-fit!';

const WIDE = '(min-width: 40rem)';

type Split = { lines: number[][]; spread: number; widest: number };

// Every way to cut the items into consecutive lines that each fit. The best split uses the fewest
// lines, then keeps their counts closest (3+2 over 4+1), then the narrowest widest line.
function balancedSplit(widths: number[], room: number, gap: number): number[][] {
  let best: Split | null = null;
  const cuts = 1 << (widths.length - 1);
  for (let mask = 0; mask < cuts; mask++) {
    const lines: number[][] = [[0]];
    for (let i = 1; i < widths.length; i++) {
      if (mask & (1 << (i - 1))) lines.push([i]);
      else lines[lines.length - 1].push(i);
    }
    const lengths = lines.map((line) => line.reduce((sum, i) => sum + widths[i], 0) + gap * (line.length - 1));
    if (lengths.some((length) => length > room)) continue;
    const counts = lines.map((line) => line.length);
    const split = { lines, spread: Math.max(...counts) - Math.min(...counts), widest: Math.max(...lengths) };
    if (!best || split.lines.length < best.lines.length
      || (split.lines.length === best.lines.length && (split.spread < best.spread
        || (split.spread === best.spread && split.widest < best.widest)))) best = split;
  }
  return best?.lines ?? widths.map((_, i) => [i]);
}

// From 640px up, a row that fits stays one natural line. One that wraps is cut into balanced lines,
// and each line's items grow in proportion to their labels until the line is full. An item marked
// data-row-fixed (the EXPORT tag) keeps its own width. Phones keep the CSS pairs above.
function useBalancedRow(ref: RefObject<HTMLDivElement>, enabled: boolean) {
  useLayoutEffect(() => {
    const row = ref.current;
    if (!enabled || !row || typeof ResizeObserver === 'undefined') return;
    const items = () => Array.from(row.children) as HTMLElement[];
    const reset = () => items().forEach((item) => { item.style.flexBasis = ''; item.style.flexGrow = ''; });
    const wide = window.matchMedia(WIDE);
    let live = true;
    const layout = () => {
      if (!live) return;
      reset();
      const room = row.clientWidth;
      const all = items();
      if (!wide.matches || room === 0 || all.length < 2) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = all.map((item) => item.getBoundingClientRect().width);
      const lines = balancedSplit(widths, room, gap);
      if (lines.length < 2) return;
      for (const line of lines) {
        const fixed = line.filter((i) => all[i].dataset.rowFixed !== undefined);
        const fixedWidth = fixed.reduce((sum, i) => sum + widths[i], 0);
        const growing = line.filter((i) => !fixed.includes(i));
        const labels = growing.reduce((sum, i) => sum + widths[i], 0);
        const free = room - gap * (line.length - 1) - fixedWidth;
        for (const i of line) {
          // Half a pixel short of full, so rounding never pushes the next line's first item up.
          const basis = fixed.includes(i) ? widths[i] : (free * widths[i]) / labels - 0.5;
          all[i].style.flexBasis = `${basis}px`;
          all[i].style.flexGrow = fixed.includes(i) ? '0' : '1';
        }
      }
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(row);
    wide.addEventListener('change', layout);
    void document.fonts?.ready.then(layout);
    return () => { live = false; observer.disconnect(); wide.removeEventListener('change', layout); reset(); };
  });
}

// Unified export bar used by every feature's results view.
// Two explicit rows, both left-aligned:
//   Row 1 (top):    secondary actions — Save, Discuss, Flowcharts, Undo
//   Row 2 (bottom): EXPORT tag, extra export buttons (e.g. Clipboard), PDF, DOCX, Google Docs
// Layout chosen by user 2026-05-27; see feedback-exports memory.
export function ExportToolbar({
  onPdf,
  onDocx,
  onGoogleDocs,
  isExportingGDocs = false,
  onDiscuss,
  discussLabel,
  extraExports,
  secondaryActions,
  evenRows = false,
}: ExportToolbarProps) {
  const { t } = useTranslation();
  const topRow = useRef<HTMLDivElement>(null);
  const exportRow = useRef<HTMLDivElement>(null);
  useBalancedRow(topRow, evenRows);
  useBalancedRow(exportRow, evenRows);

  const hasSecondaryActions = Children.toArray(secondaryActions).filter(Boolean).length > 0;
  const hasTopRow = hasSecondaryActions || !!onDiscuss;
  const exportTag = (
    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
      {t('common.export', 'Export')}
    </span>
  );

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {hasTopRow && (
        <div ref={topRow} className={cn('flex w-full flex-wrap items-center justify-start gap-2', evenRows && EVEN_ROW)}>
          {secondaryActions}
          {onDiscuss && (
            <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDiscuss}>
              <MessageSquare className="mr-2 h-4 w-4" />
              {discussLabel || t('common.discuss', 'Discuss')}
            </Button>
          )}
        </div>
      )}
      <div ref={exportRow} className={cn('flex w-full flex-wrap items-center justify-start gap-2', evenRows && EVEN_ROW)}>
        {evenRows ? <div data-row-fixed className="flex max-sm:basis-full!">{exportTag}</div> : exportTag}
        {extraExports}
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onPdf}>
          <FileText className="mr-2 h-4 w-4" />
          {t('common.pdf', 'PDF')}
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDocx}>
          <FileDown className="mr-2 h-4 w-4" />
          {t('common.docx', 'DOCX')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={onGoogleDocs}
          disabled={isExportingGDocs}
        >
          {isExportingGDocs ? (
            <LoadingSpinner size="sm" className="mr-2" />
          ) : (
            <GoogleDocsIcon className="mr-2 h-4 w-4" />
          )}
          {t('common.googleDocs', 'Google Docs')}
        </Button>
      </div>
    </div>
  );
}
