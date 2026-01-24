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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainstormInputSchema, type BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface BrainstormFormProps {
  onSubmit: (data: BrainstormInput) => void;
  isLoading: boolean;
}

export function BrainstormForm({ onSubmit, isLoading }: BrainstormFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<BrainstormInput>({
    resolver: zodResolver(BrainstormInputSchema),
    defaultValues: {
      motion: '',
      side: 'both',
      context: '',
      outputMode: 'topfive',
    },
  });

  const currentValues = watch();

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="bg-gradient-to-br from-amber-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Lightbulb className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <CardTitle>Brainstorm Ideas</CardTitle>
            <CardDescription>Explore argument angles collaboratively</CardDescription>
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
              placeholder="e.g., Universal Basic Income should be implemented globally"
              className="h-12"
            />
            {errors.motion && (
              <p className="text-sm text-destructive">{errors.motion.message}</p>
            )}
          </div>

          {/* Settings Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Side to Explore</Label>
              <Select
                value={currentValues.side}
                onValueChange={(value) => setValue('side', value as BrainstormInput['side'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Explore Both Sides</SelectItem>
                  <SelectItem value="pro">Proposition Only</SelectItem>
                  <SelectItem value="con">Opposition Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Output Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Output Format</Label>
              <Select
                value={currentValues.outputMode}
                onValueChange={(value) => setValue('outputMode', value as BrainstormInput['outputMode'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="topfive">Top 5 Best Angles</SelectItem>
                  <SelectItem value="mindmap">Mind Map Style</SelectItem>
                  <SelectItem value="buckets">Categorized Buckets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Context */}
          <div className="space-y-2">
            <Label htmlFor="context" className="text-sm font-medium">
              What You Already Have (Optional)
            </Label>
            <Textarea
              id="context"
              {...register('context')}
              placeholder="Share any ideas or angles you've already considered..."
              className="min-h-[100px] resize-y"
            />
          </div>

          {/* Submit Button */}
          <Button 
            type="submit" 
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-primary-foreground" 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating Ideas...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Start Brainstorming
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
