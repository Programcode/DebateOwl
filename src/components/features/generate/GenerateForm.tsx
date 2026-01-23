// src/components/features/generate/GenerateForm.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles, Wand2 } from 'lucide-react';
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

interface GenerateFormProps {
  onSubmit: (data: GenerateInput) => void;
  isLoading: boolean;
}

export function GenerateForm({ onSubmit, isLoading }: GenerateFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<GenerateInput>({
    resolver: zodResolver(GenerateInputSchema),
    defaultValues: {
      motion: '',
      side: 'auto',
      format: 'bp',
      role: 'general',
      length: 'standard',
      audience: 'intermediate',
      tone: 'formal',
      language: 'en',
    },
  });

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
          {/* Motion Input */}
          <div className="space-y-2">
            <Label htmlFor="motion" className="text-sm font-medium">
              Motion / Topic <span className="text-destructive">*</span>
            </Label>
            <Input
              id="motion"
              {...register('motion')}
              placeholder="e.g., This house believes that artificial intelligence will create more jobs than it destroys"
              className="h-12"
            />
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
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bp">British Parliamentary</SelectItem>
                  <SelectItem value="policy">Policy Debate</SelectItem>
                  <SelectItem value="classroom">Classroom Discussion</SelectItem>
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
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="r1">First Speaker</SelectItem>
                  <SelectItem value="r2">Second Speaker</SelectItem>
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
          <Button type="submit" className="w-full h-12" disabled={isLoading}>
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
