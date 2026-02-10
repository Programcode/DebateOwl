// src/components/features/attack/AttackForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Swords, Search } from 'lucide-react';
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
<<<<<<< HEAD
import { WikiSourcesToggle } from '@/components/features/shared/WikiSourcesToggle';
=======
import { useSessionStore } from '@/lib/stores/session-store';
import { useEffect } from 'react';
>>>>>>> main

interface AttackFormProps {
  onSubmit: (data: AttackInput) => void;
  isLoading: boolean;
  importedCase?: string;
}

export function AttackForm({ onSubmit, isLoading, importedCase }: AttackFormProps) {
  const { attackForm, setAttackForm } = useSessionStore();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AttackInput>({
    resolver: zodResolver(AttackInputSchema),
    defaultValues: {
      caseText: importedCase || '',
      aggressiveness: 'moderate',
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
            <CardTitle>Attack My Case</CardTitle>
            <CardDescription>Find weaknesses and get improvement suggestions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Case Text Input */}
          <div className="space-y-2">
            <Label htmlFor="caseText" className="text-sm font-medium">
              Your Argument <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="caseText"
              {...register('caseText')}
              placeholder="Paste your debate case or argument here..."
              className="min-h-[200px] resize-y"
            />
            {errors.caseText && (
              <p className="text-sm text-destructive">{errors.caseText.message}</p>
            )}
          </div>

          {/* Settings Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Aggressiveness */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Attack Intensity</Label>
              <Select
                value={currentValues.aggressiveness}
                onValueChange={(value) => setValue('aggressiveness', value as AttackInput['aggressiveness'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">Mild (Constructive)</SelectItem>
                  <SelectItem value="moderate">Moderate (Balanced)</SelectItem>
                  <SelectItem value="ruthless">Ruthless (No Mercy)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Judge Paradigm */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Judge Paradigm</Label>
              <Select
                value={currentValues.judgeParadigm}
                onValueChange={(value) => setValue('judgeParadigm', value as AttackInput['judgeParadigm'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="logic">Logic-Heavy</SelectItem>
                  <SelectItem value="values">Values-Focused</SelectItem>
                  <SelectItem value="policy">Policy/Impact</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Detect Fallacies</Label>
                <p className="text-xs text-muted-foreground">Identify logical fallacies in the argument</p>
              </div>
              <Switch
                checked={currentValues.detectFallacies}
                onCheckedChange={(checked) => setValue('detectFallacies', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Analyze Weighing</Label>
                <p className="text-xs text-muted-foreground">Evaluate impact comparison and prioritization</p>
              </div>
              <Switch
                checked={currentValues.analyzeWeighing}
                onCheckedChange={(checked) => setValue('analyzeWeighing', checked)}
              />
            </div>
          </div>

          {/* Wiki Sources Toggle */}
          <WikiSourcesToggle />

          {/* Submit Button */}
          <Button type="submit" variant="destructive" className="w-full h-12" disabled={isLoading}>
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Analyzing Case...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Find Weaknesses
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
