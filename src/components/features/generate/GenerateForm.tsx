// src/components/features/generate/GenerateForm.tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles, Wand2, Mic, MicOff } from 'lucide-react';
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
import { useSettingsStore } from '@/lib/stores/settings-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useSpeechToText } from '@/hooks/use-speech-to-text';

interface GenerateFormProps {
  onSubmit: (data: GenerateInput) => void;
  isLoading: boolean;
}

export function GenerateForm({ onSubmit, isLoading }: GenerateFormProps) {
  const globalLanguage = useSettingsStore((s) => s.language);
  const { generateForm, setGenerateForm } = useSessionStore();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<GenerateInput>({
    resolver: zodResolver(GenerateInputSchema),
    defaultValues: {
      motion: '',
      side: 'auto',
      format: 'custom',
      role: 'intro',
      length: 'standard',
      audience: 'intermediate',
      tone: 'formal',
      language: globalLanguage,
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
            <CardTitle>Generate Debate Case</CardTitle>
            <CardDescription>Create structured arguments for any motion</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Motion Input with Voice */}
          <div className="space-y-2">
            <Label htmlFor="motion" className="text-sm font-medium">
              Motion / Topic <span className="text-destructive">*</span>
            </Label>
            <div className="relative flex gap-2">
              <Input
                id="motion"
                {...register('motion')}
                placeholder="e.g., This house believes that artificial intelligence will create more jobs than it destroys"
                className="h-12 flex-1"
              />
              {hasVoiceSupport && (
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  className={`h-12 w-12 shrink-0 ${isListening ? 'animate-pulse' : ''}`}
                  onClick={toggleVoice}
                  title={isListening ? "Stop listening" : "Dictate your motion"}
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
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
                Listening... Speak your motion clearly
              </div>
            )}
            {errors.motion && (
              <p className="text-sm text-destructive">{errors.motion.message}</p>
            )}
          </div>

          {/* Two Column Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Side</Label>
              <Select
                value={currentValues.side}
                onValueChange={(value) => setValue('side', value as GenerateInput['side'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Pick Best)</SelectItem>
                  <SelectItem value="pro">Proposition (Pro)</SelectItem>
                  <SelectItem value="con">Opposition (Con)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Debate Format</Label>
              <Select
                value={currentValues.format}
                onValueChange={(value) => setValue('format', value as GenerateInput['format'])}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Standard Tournament (4-6-6-3)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Speaker Role</Label>
              <Select
                value={currentValues.role}
                onValueChange={(value) => setValue('role', value as GenerateInput['role'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intro">Introductor (4 min)</SelectItem>
                  <SelectItem value="r1">R1 - Rebuttal/Arg (6 min)</SelectItem>
                  <SelectItem value="r2">R2 - Rebuttal/Build (6 min)</SelectItem>
                  <SelectItem value="conc">Conclusor (3 min)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Length */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Case Length</Label>
              <Select
                value={currentValues.length}
                onValueChange={(value) => setValue('length', value as GenerateInput['length'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brief">Brief</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="comprehensive">Comprehensive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Audience Level</Label>
              <Select
                value={currentValues.audience}
                onValueChange={(value) => setValue('audience', value as GenerateInput['audience'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tone</Label>
              <Select
                value={currentValues.tone}
                onValueChange={(value) => setValue('tone', value as GenerateInput['tone'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Language</Label>
              <Select
                value={currentValues.language}
                onValueChange={(value) => setValue('language', value as GenerateInput['language'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Submit Button */}
          <Button type="submit" className="w-full h-12" disabled={isLoading} data-tour="generate-button">
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating Case...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate Debate Case
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
