import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BUILT_IN_FORMATS, FORMATS, isBuiltInFormatId, questioningSegments, speakingSegments, type BuiltInFormatId, type RoundSegment } from '@/lib/free-tools/formats';
import { captureProductEvent } from '@/lib/observability';
import { cn } from '@/lib/utils';

type Paper = 'a4' | 'letter';
type Orientation = 'landscape' | 'portrait';

/** Printable area in millimetres, inside a 10 mm margin. */
const PAPER_MM: Record<Paper, { long: number; short: number }> = {
  a4: { long: 297 - 20, short: 210 - 20 },
  letter: { long: 279 - 20, short: 216 - 20 },
};

const SIDE_RULE: Record<RoundSegment['side'], string> = {
  a: 'border-t-sky-600',
  b: 'border-t-rose-600',
  both: 'border-t-slate-500',
};

const inputClass = 'h-10 rounded-md border border-input bg-background px-3 text-base';

export function FlowSheet() {
  const { t } = useTranslation('tools');
  const [formatId, setFormatId] = useState<BuiltInFormatId>('pf');
  const [paper, setPaper] = useState<Paper>('letter');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [strip, setStrip] = useState(true);
  const [header, setHeader] = useState({ motion: '', round: '', judge: '' });

  const format = FORMATS[formatId];
  const columns = speakingSegments(format);
  const questions = questioningSegments(format);
  const size = PAPER_MM[paper];
  const width = orientation === 'landscape' ? size.long : size.short;
  const height = orientation === 'landscape' ? size.short : size.long;

  const print = () => {
    captureProductEvent('free_tool_used', { freeTool: 'debate-flow-sheet', action: 'print', format: formatId });
    window.print();
  };

  const field = (label: string, value: string) => (
    <div className="flex min-w-0 flex-1 items-end gap-1">
      <span className="shrink-0 font-semibold">{label}</span>
      <span className="min-w-0 flex-1 truncate border-b border-slate-400 pb-px">{value || ' '}</span>
    </div>
  );

  return (
    <section aria-label={t('flow.region')} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none">
      {/* Sized to the chosen paper; everything else on the page is hidden when printing. */}
      <style>{`@media print {
  @page { size: ${paper === 'a4' ? 'A4' : 'letter'} ${orientation}; margin: 10mm; }
  html, body { background: #fff !important; }
  .flow-sheet { position: fixed; left: 0; top: 0; width: ${width}mm !important; height: ${height}mm !important; aspect-ratio: auto !important; box-shadow: none !important; }
}`}</style>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('flow.format')}
          <select className={inputClass} value={formatId} onChange={(event) => { if (isBuiltInFormatId(event.target.value)) setFormatId(event.target.value); }}>
            {BUILT_IN_FORMATS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('flow.paper')}
          <select className={inputClass} value={paper} onChange={(event) => setPaper(event.target.value === 'a4' ? 'a4' : 'letter')}>
            <option value="letter">{t('flow.letter')}</option>
            <option value="a4">{t('flow.a4')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('flow.orientation')}
          <select className={inputClass} value={orientation} onChange={(event) => setOrientation(event.target.value === 'portrait' ? 'portrait' : 'landscape')}>
            <option value="landscape">{t('flow.landscape')}</option>
            <option value="portrait">{t('flow.portrait')}</option>
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 self-end text-sm font-medium">
          <input type="checkbox" className="h-4 w-4" checked={strip} onChange={(event) => setStrip(event.target.checked)} />
          {questions.length > 0 ? t('flow.questionStrip') : t('flow.notesStrip')}
        </label>
        {(['motion', 'round', 'judge'] as const).map((key) => (
          <label key={key} className={cn('flex flex-col gap-1 text-sm font-medium', key === 'motion' && 'sm:col-span-2')}>
            {t(`flow.${key}`)}
            <input className={inputClass} value={header[key]} maxLength={key === 'motion' ? 200 : 60} onChange={(event) => setHeader({ ...header, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
        <Button size="lg" onClick={print}><Printer className="mr-2 h-5 w-5" />{t('flow.print')}</Button>
        <span className="text-sm text-muted-foreground">{t('flow.printHint')}</span>
      </div>

      <div className="mt-6 overflow-x-auto print:mt-0 print:overflow-visible">
        <div
          className="flow-sheet mx-auto flex min-w-[640px] flex-col bg-white p-3 text-[10px] leading-tight text-slate-900 shadow-md [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:min-w-0"
          style={{ aspectRatio: `${width} / ${height}`, maxWidth: orientation === 'landscape' ? '100%' : '640px' }}
          data-testid="flow-sheet"
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b-2 border-slate-800 pb-1.5 text-[11px]">
            <span className="font-bold">{format.name}</span>
            {field(t('flow.motionShort'), header.motion)}
            <div className="flex w-full gap-4 sm:w-auto sm:flex-[0_0_40%]">
              {field(t('flow.roundShort'), header.round)}
              {field(t('flow.judgeShort'), header.judge)}
            </div>
          </div>
          <div className="mt-1.5 grid min-h-0 flex-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((segment, index) => (
              <div key={segment.id} className={cn('flex min-w-0 flex-col border-t-4 border-slate-300', SIDE_RULE[segment.side], index > 0 && 'border-l border-l-slate-300')}>
                <div className="px-1 pb-1 pt-0.5">
                  <div className="truncate text-[11px] font-bold">{segment.short}</div>
                  <div className="truncate text-[8px] text-slate-600">
                    {segment.side === 'both' ? '' : format.sideNames[segment.side === 'a' ? 0 : 1]} {segment.seconds / 60} min
                  </div>
                </div>
                <div className="flex-1 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_19px,#e2e8f0_19px,#e2e8f0_20px)]" />
              </div>
            ))}
          </div>
          {strip && (
            <div className="mt-1.5 grid h-[18%] shrink-0 gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, questions.length)}, minmax(0, 1fr))` }}>
              {questions.length > 0 ? questions.map((segment) => (
                <div key={segment.id} className="min-w-0 rounded-sm border border-slate-400 p-1">
                  <div className="truncate font-semibold">{segment.short}: {segment.label}</div>
                </div>
              )) : (
                <div className="rounded-sm border border-slate-400 p-1">
                  <div className="font-semibold">{t('flow.notesBox')}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
