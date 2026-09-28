// src/components/features/attack/AttackForm.tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Swords, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AttackInputSchema, type AttackInput } from '@/lib/ai/schemas/attack';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

import { useSessionStore } from '@/lib/stores/session-store';
import { ModelSelector } from '@/components/ModelSelector';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { requestSide } from '../../../../supabase/functions/_shared/debate-context';

interface AttackFormProps {
  /** Show which Current Debate material the request will use; off in Workspace. */
  debateContext?: boolean;
  onSubmit: (data: AttackInput) => void;
  isLoading: boolean;
  importedCase?: string;
}

export function AttackForm({ onSubmit, isLoading, importedCase, debateContext = true }: AttackFormProps) {
  const { t } = useTranslation();
  const { attackForm, setAttackForm } = useSessionStore();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const advancedOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (advancedOptionsRef.current) advancedOptionsRef.current.inert = !optionsOpen;
  }, [optionsOpen]);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AttackInput>({
    resolver: zodResolver(AttackInputSchema),
    defaultValues: {
      caseText: importedCase || '',
      aggressiveness: 'ruthless',
      judgeParadigm: 'logic',
      detectFallacies: true,
      analyzeWeighing: true,
      ...attackForm, // Override defaults with persisted state
    },
  });

  // Persist form changes
  useEffect(() => {
    const subscription = watch((value) => {
      setAttackForm(value as Partial<AttackInput>);
    });
    return () => subscription.unsubscribe();
  }, [watch, setAttackForm]);

  // If importedCase provided, update form
  useEffect(() => {
    if (importedCase) {
      setValue('caseText', importedCase);
    }
  }, [importedCase, setValue]);

  const currentValues = watch();

  return (
    <Card className="border-destructive/20">
      <CardHeader className="bg-gradient-to-br from-destructive/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <Swords className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <CardTitle>{t('attackForm.title')}</CardTitle>
            <CardDescription>{t('attackForm.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Case Text Input */}
          <div className="space-y-2">
            <Label htmlFor="caseText" className="text-sm font-medium">
              {t('attackForm.argument')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="caseText"
              {...register('caseText')}
              placeholder={t('attackForm.argumentPlaceholder')}
              className="min-h-[200px] resize-y"
            />
            {errors.caseText && (
              <p className="text-sm text-destructive">{errors.caseText.message}</p>
            )}
          </div>

          {/* Options */}
          <ModelSelector feature="attack" showLabel />

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('attackForm.options')}</Label>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between"
              aria-expanded={optionsOpen}
              aria-controls="attack-options"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                {t('attackForm.moreOptions')}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${optionsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          <div
            ref={advancedOptionsRef}
            id="attack-options"
            className="motion-expand"
            data-open={optionsOpen}
            aria-hidden={!optionsOpen}
          >
            <div className="space-y-4 pt-1">
              {/* Settings Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Aggressiveness */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('attackForm.intensity')}</Label>
                  <Select
                    value={currentValues.aggressiveness}
                    onValueChange={(value) => setValue('aggressiveness', value as AttackInput['aggressiveness'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mild">{t('attackForm.intensityMild')}</SelectItem>
                      <SelectItem value="moderate">{t('attackForm.intensityModerate')}</SelectItem>
                      <SelectItem value="ruthless">{t('attackForm.intensityRuthless')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Judge Paradigm */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('attackForm.paradigm')}</Label>
                  <Select
                    value={currentValues.judgeParadigm}
                    onValueChange={(value) => setValue('judgeParadigm', value as AttackInput['judgeParadigm'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="logic">{t('attackForm.paradigmLogic')}</SelectItem>
                      <SelectItem value="values">{t('attackForm.paradigmValues')}</SelectItem>
                      <SelectItem value="policy">{t('attackForm.paradigmPolicy')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Toggle Options */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{t('attackForm.detectFallacies')}</Label>
                    <p className="text-xs text-muted-foreground">{t('attackForm.detectFallaciesDesc')}</p>
                  </div>
                  <Switch
                    checked={currentValues.detectFallacies}
                    onCheckedChange={(checked) => setValue('detectFallacies', checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{t('attackForm.analyzeWeighing')}</Label>
                    <p className="text-xs text-muted-foreground">{t('attackForm.analyzeWeighingDesc')}</p>
                  </div>
                  <Switch
                    checked={currentValues.analyzeWeighing}
                    onCheckedChange={(checked) => setValue('analyzeWeighing', checked)}
                  />
                </div>
              </div>
            </div>
          </div>


          <DebateContextControl feature="attack" side={requestSide('attack', currentValues)} hidden={!debateContext} />

          {/* Submit Button */}
          <Button type="submit" className="w-full h-12" disabled={isLoading}>
            {isLoading ? (
              <span className="motion-reveal inline-flex items-center">
                <LoadingSpinner size="sm" className="mr-2" />
                {t('attackForm.analyzing')}
              </span>
            ) : (
              <span className="inline-flex items-center">
                <Search className="mr-2 h-4 w-4" />
                {t('attackForm.submit')}
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
