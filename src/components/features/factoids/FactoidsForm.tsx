// src/components/features/factoids/FactoidsForm.tsx
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FactoidsInputSchema, type FactoidsInput } from '@/lib/ai/schemas/factoids';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useSettingsStore } from '@/lib/stores/settings-store';

interface FactoidsFormProps {
  onSubmit: (data: FactoidsInput) => void;
  isLoading: boolean;
}

export function FactoidsForm({ onSubmit, isLoading }: FactoidsFormProps) {
  const globalLanguage = useSettingsStore((s) => s.language);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FactoidsInput>({
    resolver: zodResolver(FactoidsInputSchema),
    defaultValues: {
      claim: '',
      region: '',
      timeframe: '',
      sourceType: 'any',
      language: globalLanguage,
    },
  });

  const currentValues = watch();

  return (
    <Card className="border-secondary/30">
      <CardHeader className="bg-gradient-to-br from-secondary/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/20">
            <BookOpen className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <CardTitle>Find Evidence</CardTitle>
            <CardDescription>Get debate-ready factoids with verified citations</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Claim Input */}
          <div className="space-y-2">
            <Label htmlFor="claim" className="text-sm font-medium">
              Claim to Support <span className="text-destructive">*</span>
            </Label>
            <Input
              id="claim"
              {...register('claim')}
              placeholder="e.g., Renewable energy is more cost-effective than fossil fuels"
              className="h-12"
            />
            {errors.claim && (
              <p className="text-sm text-destructive">{errors.claim.message}</p>
            )}
          </div>

          {/* Settings Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Region */}
            <div className="space-y-2">
              <Label htmlFor="region" className="text-sm font-medium">Region <span className="text-destructive">*</span></Label>
              <Input
                id="region"
                {...register('region')}
                placeholder="e.g., United States, Europe, Global"
              />
              {errors.region && (
                <p className="text-sm text-destructive">{errors.region.message}</p>
              )}
            </div>

            {/* Timeframe */}
            <div className="space-y-2">
              <Label htmlFor="timeframe" className="text-sm font-medium">Timeframe (Optional)</Label>
              <Input
                id="timeframe"
                {...register('timeframe')}
                placeholder="e.g., 2020-2024, Last decade"
              />
            </div>

            {/* Evidence Strength */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Source Type</Label>
              <Select
                value={currentValues.sourceType}
                onValueChange={(value) => setValue('sourceType', value as FactoidsInput['sourceType'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Reputable Source</SelectItem>
                  <SelectItem value="academic">Academic Only</SelectItem>
                  <SelectItem value="government">Government Sources</SelectItem>
                  <SelectItem value="news">Major News</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Language</Label>
              <Select
                value={currentValues.language}
                onValueChange={(value) => setValue('language', value as FactoidsInput['language'])}
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
          <Button type="submit" variant="secondary" className="w-full h-12" disabled={isLoading}>
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Finding Evidence...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Find Factoids
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
