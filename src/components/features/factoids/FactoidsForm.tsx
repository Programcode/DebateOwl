// src/components/features/factoids/FactoidsForm.tsx
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FactoidsInputSchema, type FactoidsInput } from '@/lib/ai/schemas/factoids';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

import { useSessionStore } from '@/lib/stores/session-store';
import { useEffect } from 'react';
import { ModelSelector } from '@/components/ModelSelector';

interface FactoidsFormProps {
  onSubmit: (data: FactoidsInput) => void;
  isLoading: boolean;
}

export function FactoidsForm({ onSubmit, isLoading }: FactoidsFormProps) {
  const { t } = useTranslation();
  const { factoidsForm, setFactoidsForm } = useSessionStore();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FactoidsInput>({
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

  return (
    <Card className="border-secondary/30">
      <CardHeader className="bg-gradient-to-br from-secondary/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/20">
            <BookOpen className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <CardTitle>{t('factoidsForm.title')}</CardTitle>
            <CardDescription>{t('factoidsForm.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
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
                  <SelectValue />
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
                <Label className="text-sm font-medium">{t('factoidsForm.sourceCount', 'Sources')}</Label>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {currentValues.sourceCount || 5}
                </span>
              </div>
              <Slider
                value={[currentValues.sourceCount || 5]}
                min={3}
                max={15}
                step={1}
                onValueChange={([value]) => setValue('sourceCount', value, { shouldDirty: true })}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
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
              <Label htmlFor="timeframe" className="text-sm font-medium">{t('factoidsForm.timeframe')}</Label>
              <Input
                id="timeframe"
                {...register('timeframe')}
                placeholder={t('factoidsForm.timeframePlaceholder')}
              />
            </div>
          </div>

          <ModelSelector feature="factoids" showLabel />


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
