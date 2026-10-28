import i18n from '@/i18n';
import type { GenerateOutput } from './ai/schemas/generate';
import type { AttackOutput } from './ai/schemas/attack';
import type { BrainstormOutput } from './ai/schemas/brainstorm';
import type { FactoidsOutput } from './ai/schemas/factoids';
import type { SparringSession } from './stores/sparring-store';
import {
  buildAttackDocx,
  buildBrainstormDocx,
  buildCaseDocx,
  buildFactoidsDocx,
  buildSparringDocx,
  hasCaseData,
  type BuiltDocx,
  type DocxContext,
  type DocxModule,
} from '@debatelab/core/export/docx';
import { formatEuropeanDate, formatEuropeanDateTime } from './date-format';
import { captureProductEvent } from '@/lib/observability';

/** Triggers a browser download from a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// The documents themselves are built in @debatelab/core, shared with the iOS app;
// the builders throw on results missing the data they need.
const docxContext: DocxContext = {
  t: (key, options) => i18n.t(key, options),
  formatDate: (date) => formatEuropeanDate(date),
  formatDateTime: (date) => formatEuropeanDateTime(date),
};

/** Builds a Word document with the lazily loaded `docx` library and downloads it. */
async function downloadDocx(build: (docx: DocxModule, ctx: DocxContext) => BuiltDocx, tool: string): Promise<void> {
  // Dynamically import heavy libraries only when needed
  const docx = await import('docx');
  const { doc, fileName } = build(docx, docxContext);
  const blob = await docx.Packer.toBlob(doc);
  saveBlob(blob, fileName);
  captureProductEvent('content_exported', { format: 'docx', tool });
}

export async function exportCaseToDocx(result: GenerateOutput): Promise<boolean> {
  try {
    await downloadDocx((docx, ctx) => buildCaseDocx(docx, result, ctx), 'generate');
    return true;
  } catch (error) {
    console.error('Failed to export case to DOCX:', error);
    return false;
  }
}

export async function exportAttackToDocx(result: AttackOutput): Promise<boolean> {
  try {
    await downloadDocx((docx, ctx) => buildAttackDocx(docx, result, ctx), 'attack');
    return true;
  } catch (error) {
    console.error('Failed to export attack to DOCX:', error);
    return false;
  }
}

export async function exportBrainstormToDocx(result: BrainstormOutput): Promise<boolean> {
  try {
    await downloadDocx((docx, ctx) => buildBrainstormDocx(docx, result, ctx), 'brainstorm');
    return true;
  } catch (error) {
    console.error('Failed to export brainstorm to DOCX:', error);
    return false;
  }
}

export async function exportFactoidsToDocx(result: FactoidsOutput): Promise<boolean> {
  try {
    await downloadDocx((docx, ctx) => buildFactoidsDocx(docx, result, ctx), 'factoids');
    return true;
  } catch (error) {
    console.error('Failed to export factoids to DOCX:', error);
    return false;
  }
}

// ============================================================
// GOOGLE DOCS EXPORTS
// ============================================================

export interface GoogleDocsExportResult {
  success: boolean;
  documentUrl?: string;
  error?: string;
  requiresReauth?: boolean;
}

const GOOGLE_DOCS_EXPORT_TIMEOUT_MS = 30_000;
const GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE = 'Google Docs export timed out. Please try again.';

async function callGoogleDocsEdgeFunction(
  mode: 'generate' | 'attack' | 'brainstorm' | 'factoids',
  data: GenerateOutput | AttackOutput | BrainstormOutput | FactoidsOutput
): Promise<GoogleDocsExportResult> {
  try {
    const { supabase, SUPABASE_URL } = await import('@/lib/supabase/client');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated. Please sign in.', requiresReauth: true };
    }

    // Supabase only provides provider_token immediately after OAuth. The fallback
    // is scoped to this browser session so access tokens do not survive restarts.
    let providerToken = session.provider_token;
    const tokenSource = providerToken ? 'session' : 'sessionStorage';
    if (!providerToken) {
      providerToken = sessionStorage.getItem('google_provider_token');
    }

    console.debug('[GDocs Export] Token source:', tokenSource, 'Token present:', Boolean(providerToken));

    if (!providerToken) {
      return {
        success: false,
        error: 'Google Drive access not granted. Please sign out and sign back in.',
        requiresReauth: true,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_DOCS_EXPORT_TIMEOUT_MS);
    let response: Response;
    let respData: Record<string, unknown>;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/export-gdoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          data,
          accessToken: providerToken,
        }),
        signal: controller.signal,
      });
      respData = await response.json().catch(() => ({}));
      if (controller.signal.aborted) {
        return { success: false, error: GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return { success: false, error: GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE };
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error('[GDocs Export] Error response:', response.status, respData);
      if (
        respData.code === 'AUTH_EXPIRED' ||
        respData.code === 'REFRESH_FAILED' ||
        respData.code === 'DRIVE_SCOPE_REQUIRED' ||
        response.status === 401 ||
        response.status === 403
      ) {
        return { success: false, error: typeof respData.error === 'string' ? respData.error : 'Authorization expired.', requiresReauth: true };
      }
      return { success: false, error: typeof respData.error === 'string' ? respData.error : 'Failed to export to Google Docs' };
    }

    if (typeof respData.newAccessToken === 'string') {
      sessionStorage.setItem('google_provider_token', respData.newAccessToken);
    }

    captureProductEvent('content_exported', { format: 'google_docs', tool: mode });
    return { success: true, documentUrl: typeof respData.documentUrl === 'string' ? respData.documentUrl : undefined };
  } catch (error) {
    console.error('Failed to export to Google Docs:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function exportCaseToGoogleDocs(result: GenerateOutput): Promise<GoogleDocsExportResult> {
  if (!hasCaseData(result)) {
    return { success: false, error: 'Missing required case data for export.' };
  }
  return callGoogleDocsEdgeFunction('generate', result);
}

export async function exportAttackToGoogleDocs(result: AttackOutput): Promise<GoogleDocsExportResult> {
  if (!result?.overallAssessment || !Array.isArray(result.weaknesses)) {
    return { success: false, error: 'Missing required attack data for export.' };
  }
  return callGoogleDocsEdgeFunction('attack', result);
}

export async function exportBrainstormToGoogleDocs(result: BrainstormOutput): Promise<GoogleDocsExportResult> {
  return callGoogleDocsEdgeFunction('brainstorm', result);
}

export async function exportFactoidsToGoogleDocs(result: FactoidsOutput): Promise<GoogleDocsExportResult> {
  if (!Array.isArray(result?.factoids)) {
    return { success: false, error: 'Missing required factoids data for export.' };
  }
  return callGoogleDocsEdgeFunction('factoids', result);
}

// ============================================================
// SPARRING TRANSCRIPT DOCX EXPORT
// ============================================================
export async function exportSparringToDocx(session: SparringSession): Promise<boolean> {
  try {
    await downloadDocx((docx, ctx) => buildSparringDocx(docx, session, ctx), 'sparring');
    return true;
  } catch (error) {
    console.error('Failed to export sparring transcript to DOCX:', error);
    return false;
  }
}
