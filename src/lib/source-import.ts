import { supabase } from '@/lib/supabase/client';
import { SourceImportOutputSchema, type SourceImportOutput } from '@/lib/ai/schemas/source-import';
import { getEdgeFunctionErrorMessage } from '@/lib/supabase/edge-function-error';

export async function importSourceFromUrl(url: string): Promise<SourceImportOutput> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke('import-source', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: { url },
  });

  if (error) {
    throw new Error(await getEdgeFunctionErrorMessage(error) || 'Failed to import source');
  }

  const parsed = SourceImportOutputSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Imported source response was invalid');
  }

  return parsed.data;
}
