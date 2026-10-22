import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CUSTOM_LIMITS, roundFormatToCustom, type CustomFormat, type CustomSegment } from '@/lib/free-tools/custom-format';
import { formatFor, type FormatChoice } from './timer-session';

const inputClass = 'h-10 rounded-md border border-input bg-background px-2 text-base';

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

/** Builds a custom round from the current format: add, remove, rename and reorder speeches. */
export function CustomFormatEditor({ choice, onApply }: { choice: FormatChoice; onApply: (choice: FormatChoice) => void }) {
  const { t } = useTranslation('tools');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomFormat>(() => (choice.id === 'custom' ? choice.custom : roundFormatToCustom(formatFor(choice))));

  const begin = () => {
    setDraft(choice.id === 'custom' ? choice.custom : roundFormatToCustom(formatFor(choice)));
    setOpen(true);
  };
  const setSegment = (index: number, change: Partial<CustomSegment>) =>
    setDraft((current) => ({ ...current, segments: current.segments.map((segment, i) => (i === index ? { ...segment, ...change } : segment)) }));
  const move = (index: number, delta: number) => setDraft((current) => {
    const segments = [...current.segments];
    const [moved] = segments.splice(index, 1);
    segments.splice(index + delta, 0, moved);
    return { ...current, segments };
  });
  const remove = (index: number) => setDraft((current) => ({ ...current, segments: current.segments.filter((_, i) => i !== index) }));
  const add = () => setDraft((current) => ({
    ...current,
    segments: [...current.segments, { label: t('custom.newSpeech', { n: current.segments.length + 1 }), seconds: 240, kind: 'speech', side: 'a', poi: false }],
  }));

  const valid = draft.segments.length > 0 && draft.segments.every((segment) => segment.label.trim());

  if (!open) {
    return (
      <div className="border-t border-border p-4 text-center">
        <Button variant="outline" onClick={begin}>{t('custom.open')}</Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 border-t border-border p-4"
      aria-label={t('custom.title')}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onApply({ id: 'custom', custom: { ...draft, name: draft.name.trim() || t('custom.defaultName'), segments: draft.segments.map((segment) => ({ ...segment, label: segment.label.trim() })) } });
        setOpen(false);
      }}
    >
      <h3 className="text-lg font-semibold">{t('custom.title')}</h3>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('custom.name')}
          <input className={`${inputClass} w-64`} value={draft.name} maxLength={CUSTOM_LIMITS.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('custom.prepMinutes')}
          <input
            className={`${inputClass} w-24`}
            type="number"
            min={0}
            max={CUSTOM_LIMITS.maxPrepSeconds / 60}
            step={0.5}
            value={draft.prepSeconds / 60}
            onChange={(event) => setDraft({ ...draft, prepSeconds: clamp(Number(event.target.value) * 60, 0, CUSTOM_LIMITS.maxPrepSeconds) })}
          />
        </label>
      </div>

      <ol className="space-y-2">
        {draft.segments.map((segment, index) => (
          <li key={index} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t('custom.label')}
              <input className={`${inputClass} w-40`} value={segment.label} maxLength={CUSTOM_LIMITS.label} required onChange={(event) => setSegment(index, { label: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t('custom.minutes')}
              <input
                className={`${inputClass} w-20`}
                type="number"
                min={CUSTOM_LIMITS.minSeconds / 60}
                max={CUSTOM_LIMITS.maxSeconds / 60}
                step={0.25}
                value={segment.seconds / 60}
                onChange={(event) => setSegment(index, { seconds: clamp(Number(event.target.value) * 60, CUSTOM_LIMITS.minSeconds, CUSTOM_LIMITS.maxSeconds) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t('custom.kind')}
              <select className={inputClass} value={segment.kind} onChange={(event) => setSegment(index, { kind: event.target.value === 'speech' ? 'speech' : 'cross-examination', poi: false })}>
                <option value="speech">{t('custom.kindSpeech')}</option>
                <option value="cross-examination">{t('custom.kindQuestions')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t('custom.side')}
              <select className={inputClass} value={segment.side} onChange={(event) => setSegment(index, { side: event.target.value === 'b' ? 'b' : event.target.value === 'both' ? 'both' : 'a' })}>
                <option value="a">{t('custom.sideA')}</option>
                <option value="b">{t('custom.sideB')}</option>
                <option value="both">{t('custom.sideBoth')}</option>
              </select>
            </label>
            <label className="flex min-h-10 items-center gap-2 text-xs font-medium">
              <input type="checkbox" className="h-4 w-4" checked={segment.poi} disabled={segment.kind !== 'speech'} onChange={(event) => setSegment(index, { poi: event.target.checked })} />
              {t('custom.poi')}
            </label>
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('custom.moveUp', { label: segment.label })}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={index === draft.segments.length - 1} onClick={() => move(index, 1)} aria-label={t('custom.moveDown', { label: segment.label })}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={draft.segments.length === 1} onClick={() => remove(index)} aria-label={t('custom.remove', { label: segment.label })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t('custom.poiHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={add} disabled={draft.segments.length >= CUSTOM_LIMITS.segments}>
          <Plus className="mr-2 h-4 w-4" />{t('custom.add')}
        </Button>
        <Button type="submit" disabled={!valid}>{t('custom.apply')}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('custom.cancel')}</Button>
      </div>
    </form>
  );
}
