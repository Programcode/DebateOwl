// src/components/features/factoids/FactoidsForm.tsx
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { FactoidsInputSchema, type FactoidsInput } from '@/lib/ai/schemas/factoids';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

import { useSessionStore } from '@/lib/stores/session-store';
import { useEffect } from 'react';
import { ModelSelector } from '@/components/ModelSelector';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { requestSide } from '../../../../supabase/functions/_shared/debate-context';

interface FactoidsFormProps {
  /** Show which Current Debate material the request will use; off in Workspace. */
  debateContext?: boolean;
  onSubmit: (data: FactoidsInput) => void;
  isLoading: boolean;
}

export function FactoidsForm({ onSubmit, isLoading, debateContext = true }: FactoidsFormProps) {
  const { t } = useTranslation();
  const { factoidsForm, setFactoidsForm } = useSessionStore();

  // The schema coerces and defaults fields, so the form's input type differs from what submit receives.
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<z.input<typeof FactoidsInputSchema>, unknown, FactoidsInput>({
    resolver: zodResolver(FactoidsInputSchema),
    defaultValues: {
      claim: '',
      direction: 'for',
      region: '',
      timeframe: '',
      sourceType: 'any',
      sourceCount: 5,
      ...factoidsForm, // Override with persisted state
    },
  });

  // Persist form changes
  useEffect(() => {
    const subscription = watch((value) => {
      setFactoidsForm(value as Partial<FactoidsInput>);
    });
    return () => subscription.unsubscribe();
  }, [watch, setFactoidsForm]);

  const currentValues = watch();
  const sourceCount = Number(currentValues.sourceCount) || 5;

  return (
    <Card className="border-secondary/30">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Claim Input */}
          <div className="space-y-2">
            <Label htmlFor="claim" className="text-sm font-medium">
              {t('factoidsForm.claim')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="claim"
              {...register('claim')}
              placeholder={t('factoidsForm.claimPlaceholder')}
              className="h-12"
            />
            {errors.claim && (
              <p className="text-sm text-destructive">{errors.claim.message}</p>
            )}
          </div>

          {/* Settings Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('factoidsForm.direction', 'Position')}</Label>
              <Select
                value={currentValues.direction}
                onValueChange={(value) => setValue('direction', value as FactoidsInput['direction'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="for">{t('factoidsForm.directionFor', 'In favor')}</SelectItem>
                  <SelectItem value="against">{t('factoidsForm.directionAgainst', 'Against')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Evidence Strength */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('factoidsForm.sourceType')}</Label>
              <Select
                value={currentValues.sourceType}
                onValueChange={(value) => setValue('sourceType', value as FactoidsInput['sourceType'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('factoidsForm.sourceAny')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('factoidsForm.sourceAny')}</SelectItem>
                  <SelectItem value="academic">{t('factoidsForm.sourceAcademic')}</SelectItem>
                  <SelectItem value="government">{t('factoidsForm.sourceGovernment')}</SelectItem>
                  <SelectItem value="news">{t('factoidsForm.sourceNews')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="factoid-source-count" className="text-sm font-medium">{t('factoidsForm.sourceCount', 'Sources')}</Label>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {sourceCount}
                </span>
              </div>
              <Slider
                id="factoid-source-count"
                value={[sourceCount]}
                min={3}
                max={15}
                step={1}
                onValueChange={([value]) => setValue('sourceCount', value, { shouldDirty: true })}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>3</span>
                <span>15</span>
              </div>
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label htmlFor="region" className="text-sm font-medium">{t('factoidsForm.region')}</Label>
              <Input
                id="region"
                {...register('region')}
                placeholder={t('factoidsForm.regionPlaceholder')}
              />
              {errors.region && (
                <p className="text-sm text-destructive">{errors.region.message}</p>
              )}
            </div>

            {/* Timeframe */}
            <div className="space-y-2">
              <Label htmlFor="timeframe" className="block h-5 text-sm font-medium leading-5">{t('factoidsForm.timeframe')}</Label>
              <Input
                id="timeframe"
                {...register('timeframe')}
                placeholder={t('factoidsForm.timeframePlaceholder')}
              />
            </div>

            <ModelSelector feature="factoids" showLabel />
          </div>


          <DebateContextControl feature="factoids" side={requestSide('factoids', currentValues)} hidden={!debateContext} />

          {/* Submit Button */}
          <Button type="submit" className="w-full h-12" disabled={isLoading}>
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {t('factoidsForm.finding')}
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                {t('factoidsForm.submit')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
