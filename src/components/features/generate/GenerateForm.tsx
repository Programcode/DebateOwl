// src/components/features/generate/GenerateForm.tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Mic, MicOff, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { GenerateInputSchema, type GenerateInput } from '@/lib/ai/schemas/generate';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ListeningIndicator } from '@/components/features/voice/ListeningIndicator';
import { useDebateMotionPrefill } from '@/components/features/debate/CurrentDebateStrip';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { ModelSelector } from '@/components/ModelSelector';
import { DebateContextControl } from '@/components/features/debate/DebateContextControl';
import { requestSide } from '../../../../supabase/functions/_shared/debate-context';


interface GenerateFormProps {
  onSubmit: (data: GenerateInput) => void;
  isLoading: boolean;
  /** Fill the motion from the Current Debate. */
  debatePrefill?: boolean;
}

function OptionSelect<V extends string>({ value, onValueChange, options, triggerClassName }: {
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string }[];
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as V)}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GenerateForm({ onSubmit, isLoading, debatePrefill = true }: GenerateFormProps) {
  const { t } = useTranslation();
  const { generateForm, setGenerateForm } = useSessionStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (advancedOptionsRef.current) advancedOptionsRef.current.inert = !advancedOpen;
  }, [advancedOpen]);

  const { register, handleSubmit, setValue, getValues, watch, formState: { errors } } = useForm<GenerateInput>({
    resolver: zodResolver(GenerateInputSchema),
    defaultValues: {
      motion: '',
      side: 'pro',
      format: 'custom',
      role: 'r1',
      length: 'standard',
      audience: 'intermediate',
      tone: 'formal',
      ...generateForm, // Override defaults with persisted state
    },
  });

  // Persist form changes
  useEffect(() => {
    const subscription = watch((value) => {
      setGenerateForm(value as Partial<GenerateInput>);
    });
    return () => subscription.unsubscribe();
  }, [watch, setGenerateForm]);

  useDebateMotionPrefill(() => getValues('motion'), (motion) => setValue('motion', motion, { shouldValidate: true }), !debatePrefill);

  // Voice input integration
  const { isListening, transcript, error: voiceError, startListening, stopListening, resetTranscript, hasSupport: hasVoiceSupport } = useSpeechToText();

  // Sync transcript to motion field
  useEffect(() => {
    if (transcript) {
      setValue('motion', transcript, { shouldValidate: true });
    }
  }, [transcript, setValue]);

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      void startListening();
    }
  };

  const currentValues = watch();

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Motion Input with Voice */}
          <div className="space-y-2">
            <Label htmlFor="motion" className="text-sm font-medium">
              {t('generateForm.motion')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative flex gap-2">
              <Input
                id="motion"
                {...register('motion')}
                placeholder={t('generateForm.motionPlaceholder')}
                className="h-12 flex-1"
              />
              {hasVoiceSupport && (
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  onClick={toggleVoice}
                  title={isListening ? t('generateForm.stopListening') : t('generateForm.dictate')}
                  aria-label={isListening ? t('generateForm.stopVoice') : t('generateForm.startVoice')}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
            </div>
            {isListening && (
              <ListeningIndicator label={t('generateForm.listening')} />
            )}
            {voiceError && (
              <p className="text-sm text-destructive">
                {voiceError === 'not-allowed'
                  ? t('voice.permissionDenied', 'Microphone access is blocked. Allow microphone access in your browser settings and try again.')
                  : t('voice.startFailed', 'Dictation could not start. Check your microphone and try again.')}
              </p>
            )}
            {errors.motion && (
              <p className="text-sm text-destructive">{errors.motion.message}</p>
            )}
          </div>

          {/* Main Options */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('generateForm.side')}</Label>
              <OptionSelect
                value={currentValues.side}
                onValueChange={(value) => setValue('side', value)}
                options={[
                  { value: 'pro', label: t('generateForm.sidePro') },
                  { value: 'con', label: t('generateForm.sideCon') },
                ]}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('generateForm.role')}</Label>
              <OptionSelect
                value={currentValues.role}
                onValueChange={(value) => setValue('role', value)}
                options={[
                  { value: 'intro', label: t('generateForm.roleIntro') },
                  { value: 'r1', label: t('generateForm.roleR1') },
                  { value: 'r2', label: t('generateForm.roleR2') },
                  { value: 'conc', label: t('generateForm.roleConc') },
                ]}
              />
            </div>

          </div>

          <ModelSelector feature="generate" showLabel />

          {/* More Options */}
          <div>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between"
              aria-expanded={advancedOpen}
              aria-controls="generate-more-options"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                {t('generateForm.moreOptions')}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-150 ease-out-strong ${advancedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          <div
            ref={advancedOptionsRef}
            id="generate-more-options"
            className="motion-expand"
            data-open={advancedOpen}
            aria-hidden={!advancedOpen}
          >
            <div className="grid gap-4 pt-1 sm:grid-cols-3">
              {/* Length */}
              <div className="space-y-2 min-w-0">
                <Label className="text-sm font-medium truncate block">{t('generateForm.length')}</Label>
                <OptionSelect
                  value={currentValues.length}
                  onValueChange={(value) => setValue('length', value)}
                  triggerClassName="min-w-0"
                  options={[
                    { value: 'brief', label: t('generateForm.lengthBrief') },
                    { value: 'standard', label: t('generateForm.lengthStandard') },
                    { value: 'comprehensive', label: t('generateForm.lengthComprehensive') },
                  ]}
                />
              </div>

              {/* Audience */}
              <div className="space-y-2 min-w-0">
                <Label className="text-sm font-medium truncate block">{t('generateForm.audience')}</Label>
                <OptionSelect
                  value={currentValues.audience}
                  onValueChange={(value) => setValue('audience', value)}
                  triggerClassName="min-w-0"
                  options={[
                    { value: 'beginner', label: t('generateForm.audienceBeginner') },
                    { value: 'intermediate', label: t('generateForm.audienceIntermediate') },
                    { value: 'advanced', label: t('generateForm.audienceAdvanced') },
                  ]}
                />
              </div>

              {/* Tone */}
              <div className="space-y-2 min-w-0">
                <Label className="text-sm font-medium truncate block">{t('generateForm.tone')}</Label>
                <OptionSelect
                  value={currentValues.tone}
                  onValueChange={(value) => setValue('tone', value)}
                  triggerClassName="min-w-0"
                  options={[
                    { value: 'formal', label: t('generateForm.toneFormal') },
                    { value: 'conversational', label: t('generateForm.toneConversational') },
                    { value: 'aggressive', label: t('generateForm.toneAggressive') },
                  ]}
                />
                <p className="text-xs text-muted-foreground">{t('generateForm.styleNote')}</p>
              </div>
            </div>
          </div>



          <DebateContextControl feature="generate" side={requestSide('generate', currentValues)} hidden={!debatePrefill} />

          {/* Submit Button */}
          <Button type="submit" className="w-full h-12" disabled={isLoading} aria-busy={isLoading} data-tour="generate-button">
            {isLoading ? (
              <span className="inline-flex items-center">
                <LoadingSpinner size="sm" className="mr-2" />
                {t('generateForm.generating')}
              </span>
            ) : (
              <span className="inline-flex items-center">
                <Wand2 className="mr-2 h-4 w-4" />
                {t('generateForm.submit')}
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
