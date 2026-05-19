// src/components/features/generate/GenerateForm.tsx
import { useEffect, useState } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerateInputSchema, type GenerateInput } from '@/lib/ai/schemas/generate';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSpeechToText } from '@/hooks/use-speech-to-text';


interface GenerateFormProps {
  onSubmit: (data: GenerateInput) => void;
  isLoading: boolean;
}

export function GenerateForm({ onSubmit, isLoading }: GenerateFormProps) {
  const { t } = useTranslation();
  const { generateForm, setGenerateForm } = useSessionStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<GenerateInput>({
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

  // Voice input integration
  const { isListening, transcript, startListening, stopListening, resetTranscript, hasSupport: hasVoiceSupport } = useSpeechToText();

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
      startListening();
    }
  };

  const currentValues = watch();

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t('generateForm.title')}</CardTitle>
            <CardDescription>{t('generateForm.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  className={`h-12 w-12 shrink-0 ${isListening ? 'animate-pulse' : ''}`}
                  onClick={toggleVoice}
                  title={isListening ? t('generateForm.stopListening') : t('generateForm.dictate')}
                  aria-label={isListening ? t('generateForm.stopVoice') : t('generateForm.startVoice')}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
            </div>
            {isListening && (
              <div className="flex items-center gap-2 text-sm text-primary animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                {t('generateForm.listening')}
              </div>
            )}
            {errors.motion && (
              <p className="text-sm text-destructive">{errors.motion.message}</p>
            )}
          </div>

          {/* Main Options */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('generateForm.side')}</Label>
              <Select
                value={currentValues.side}
                onValueChange={(value) => setValue('side', value as GenerateInput['side'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">{t('generateForm.sidePro')}</SelectItem>
                  <SelectItem value="con">{t('generateForm.sideCon')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('generateForm.format')}</Label>
              <Select
                value={currentValues.format}
                onValueChange={(value) => setValue('format', value as GenerateInput['format'])}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{t('generateForm.formatStandard')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('generateForm.role')}</Label>
              <Select
                value={currentValues.role}
                onValueChange={(value) => setValue('role', value as GenerateInput['role'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intro">{t('generateForm.roleIntro')}</SelectItem>
                  <SelectItem value="r1">{t('generateForm.roleR1')}</SelectItem>
                  <SelectItem value="r2">{t('generateForm.roleR2')}</SelectItem>
                  <SelectItem value="conc">{t('generateForm.roleConc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* More */}
          <div className="space-y-2 sm:max-w-xs">
            <Label className="text-sm font-medium">{t('generateForm.more')}</Label>
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
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${advancedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          <div
            id="generate-more-options"
            className="motion-expand"
            data-open={advancedOpen}
          >
            <div className="grid gap-4 pt-1 sm:grid-cols-3">
              {/* Length */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('generateForm.length')}</Label>
                <Select
                  value={currentValues.length}
                  onValueChange={(value) => setValue('length', value as GenerateInput['length'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brief">{t('generateForm.lengthBrief')}</SelectItem>
                    <SelectItem value="standard">{t('generateForm.lengthStandard')}</SelectItem>
                    <SelectItem value="comprehensive">{t('generateForm.lengthComprehensive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Audience */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('generateForm.audience')}</Label>
                <Select
                  value={currentValues.audience}
                  onValueChange={(value) => setValue('audience', value as GenerateInput['audience'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('generateForm.audienceBeginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('generateForm.audienceIntermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('generateForm.audienceAdvanced')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tone */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('generateForm.tone')}</Label>
                <Select
                  value={currentValues.tone}
                  onValueChange={(value) => setValue('tone', value as GenerateInput['tone'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">{t('generateForm.toneFormal')}</SelectItem>
                    <SelectItem value="conversational">{t('generateForm.toneConversational')}</SelectItem>
                    <SelectItem value="aggressive">{t('generateForm.toneAggressive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>



          {/* Submit Button */}
          <Button type="submit" className="w-full h-12" disabled={isLoading} data-tour="generate-button">
            {isLoading ? (
              <span className="motion-reveal inline-flex items-center">
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
