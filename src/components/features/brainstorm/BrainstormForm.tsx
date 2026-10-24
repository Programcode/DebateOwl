import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lightbulb, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { BrainstormInputSchema, type BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

import { useDebateMotionPrefill } from '@/components/features/debate/CurrentDebateStrip';
import { useSessionStore } from '@/lib/stores/session-store';
import { useEffect } from 'react';
import { ModelSelector } from '@/components/ModelSelector';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { requestSide } from '../../../../supabase/functions/_shared/debate-context';

interface BrainstormFormProps {
  onSubmit: (data: BrainstormInput) => void;
  isLoading: boolean;
  /** Fill the motion from the Current Debate. */
  debatePrefill?: boolean;
}

export function BrainstormForm({ onSubmit, isLoading, debatePrefill = true }: BrainstormFormProps) {
  const { t } = useTranslation();
  const { brainstormForm, setBrainstormForm } = useSessionStore();

  const { register, handleSubmit, setValue, getValues, watch, formState: { errors } } = useForm<BrainstormInput>({
    resolver: zodResolver(BrainstormInputSchema),
    defaultValues: {
      motion: '',
      side: 'both',
      context: '',
      outputMode: 'topfive',
      ...brainstormForm, // Override with persisted state
    },
  });

  // Persist form changes
  useEffect(() => {
    const subscription = watch((value) => {
      setBrainstormForm(value as Partial<BrainstormInput>);
    });
    return () => subscription.unsubscribe();
  }, [watch, setBrainstormForm]);

  useDebateMotionPrefill(() => getValues('motion'), (motion) => setValue('motion', motion, { shouldValidate: true }), !debatePrefill);

  const currentValues = watch();

  return (
    <Card className="border-amber-500/20">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Motion Input */}
          <div className="space-y-2">
            <Label htmlFor="motion" className="text-sm font-medium">
              {t('brainstormForm.motion')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="motion"
              {...register('motion')}
              placeholder={t('brainstormForm.motionPlaceholder')}
              className="h-12"
            />
            {errors.motion && (
              <p className="text-sm text-destructive">{t(errors.motion.message ?? '')}</p>
            )}
          </div>

          {/* Settings Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('brainstormForm.side')}</Label>
              <Select
                value={currentValues.side}
                onValueChange={(value) => setValue('side', value as BrainstormInput['side'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{t('brainstormForm.sideBoth')}</SelectItem>
                  <SelectItem value="pro">{t('brainstormForm.sidePro')}</SelectItem>
                  <SelectItem value="con">{t('brainstormForm.sideCon')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Output Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('brainstormForm.outputFormat')}</Label>
              <Select
                value={currentValues.outputMode}
                onValueChange={(value) => setValue('outputMode', value as BrainstormInput['outputMode'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="topfive">{t('brainstormForm.outputTop5')}</SelectItem>
                  <SelectItem value="mindmap">{t('brainstormForm.outputMindmap')}</SelectItem>
                  <SelectItem value="buckets">{t('brainstormForm.outputBuckets')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ModelSelector feature="brainstorm" showLabel />

          {/* Context */}
          <div className="space-y-2">
            <Label htmlFor="context" className="text-sm font-medium">
              {t('brainstormForm.existing')}
            </Label>
            <Textarea
              id="context"
              {...register('context')}
              placeholder={t('brainstormForm.existingPlaceholder')}
              className="min-h-[100px] resize-y"
            />
          </div>

          <DebateContextControl feature="brainstorm" side={requestSide('brainstorm', currentValues)} hidden={!debatePrefill} />

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {t('brainstormForm.generating')}
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                {t('brainstormForm.submit')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
