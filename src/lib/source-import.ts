import { supabase } from '@/lib/supabase/client';
import { SourceImportOutputSchema, type SourceImportOutput } from '@/lib/ai/schemas/source-import';

export async function importSourceFromUrl(url: string): Promise<SourceImportOutput> {
  const { data, error } = await supabase.functions.invoke('import-source', {
    body: { url },
  });

  if (error) {
    throw new Error(error.message || 'Failed to import source');
  }

  const parsed = SourceImportOutputSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Imported source response was invalid');
  }

  return parsed.data;
}
