import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_INSTRUCTIONS_LENGTH, MAX_MOTION_LENGTH, type DebateSettings } from '@/lib/stores/debate-store';

export interface DebateFormValues {
  motion: string;
  settings: DebateSettings;
  instructions: string;
}

const FORMATS = ['custom', 'bp', 'policy', 'classroom'] as const;
const ROLES = ['general', 'intro', 'r1', 'r2', 'conc'] as const;
const ROLE_LABEL_KEYS: Record<(typeof ROLES)[number], string> = {
  general: 'debate.roleAny',
  intro: 'generateForm.roleIntro',
  r1: 'generateForm.roleR1',
  r2: 'generateForm.roleR2',
  conc: 'generateForm.roleConc',
};

interface DebateFormProps {
  initial?: Partial<DebateFormValues>;
  submitLabel: string;
  onSubmit: (values: DebateFormValues) => Promise<void>;
  onCancel?: () => void;
  /** Motion is fixed when editing only settings. */
  showDetails?: boolean;
  idPrefix?: string;
}

export function DebateForm({ initial, submitLabel, onSubmit, onCancel, showDetails = true, idPrefix = 'debate' }: DebateFormProps) {
  const { t } = useTranslation();
  const [motion, setMotion] = useState(initial?.motion ?? '');
  const [format, setFormat] = useState(initial?.settings?.format ?? 'custom');
  const [role, setRole] = useState(initial?.settings?.role ?? 'general');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!motion.trim()) {
      setError(t('debate.motionRequired', 'Enter the motion you are preparing.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({ motion: motion.trim(), settings: { format, role }, instructions: instructions.trim() });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('debate.saveFailed', 'Could not save the debate.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-motion`}>{t('debate.motion', 'Motion')}</Label>
        <Textarea
          id={`${idPrefix}-motion`}
          value={motion}
          onChange={(event) => setMotion(event.target.value)}
          maxLength={MAX_MOTION_LENGTH}
          rows={3}
          placeholder={t('debate.motionPlaceholder', 'This House would…')}
          autoFocus
        />
      </div>
      {showDetails && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-format`}>{t('debate.format', 'Format')}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id={`${idPrefix}-format`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((value) => (
                    <SelectItem key={value} value={value}>{t(`debate.formats.${value}`, value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-role`}>{t('debate.role', 'Your role')}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id={`${idPrefix}-role`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((value) => (
                    <SelectItem key={value} value={value}>{t(ROLE_LABEL_KEYS[value], value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-instructions`}>{t('debate.instructions', 'Instructions')}</Label>
            <Textarea
              id={`${idPrefix}-instructions`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={MAX_INSTRUCTIONS_LENGTH}
              rows={3}
              placeholder={t('debate.instructionsPlaceholder', 'Roles, judge expectations, agreed definitions, school conventions, writing preferences…')}
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">{instructions.length}/{MAX_INSTRUCTIONS_LENGTH}</p>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>}
        <Button type="submit" disabled={saving || !motion.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}
