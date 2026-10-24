import { Children, type ReactNode } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTranslation } from 'react-i18next';
import { FileText, FileDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';

interface ExportToolbarProps {
  onPdf: () => void;
  onDocx: () => void;
  onGoogleDocs: () => void;
  isExportingGDocs?: boolean;
  onDiscuss?: () => void;
  discussLabel?: string;
  /** Buttons that appear on the export row, between the EXPORT tag and PDF/DOCX/Google Docs (e.g. Clipboard). */
  extraExports?: ReactNode;
  /** Buttons that appear on the top row (Save, Discuss, Flowcharts, Undo, etc.). */
  secondaryActions?: ReactNode;
}

// Unified export bar used by every feature's results view.
// Two explicit rows, both left-aligned:
//   Row 1 (top):    secondary actions — Save, Discuss, Flowcharts, Undo
//   Row 2 (bottom): EXPORT tag, extra export buttons (e.g. Clipboard), PDF, DOCX, Google Docs
// Layout chosen by user 2026-05-27; see feedback-exports memory.
export function ExportToolbar({
  onPdf,
  onDocx,
  onGoogleDocs,
  isExportingGDocs = false,
  onDiscuss,
  discussLabel,
  extraExports,
  secondaryActions,
}: ExportToolbarProps) {
  const { t } = useTranslation();

  const hasSecondaryActions = Children.toArray(secondaryActions).filter(Boolean).length > 0;
  const hasTopRow = hasSecondaryActions || !!onDiscuss;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {hasTopRow && (
        <div className="flex w-full flex-wrap items-center justify-start gap-2">
          {secondaryActions}
          {onDiscuss && (
            <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDiscuss}>
              <MessageSquare className="mr-2 h-4 w-4" />
              {discussLabel || t('common.discuss', 'Discuss')}
            </Button>
          )}
        </div>
      )}
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {t('common.export', 'Export')}
        </span>
        {extraExports}
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onPdf}>
          <FileText className="mr-2 h-4 w-4" />
          {t('common.pdf', 'PDF')}
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDocx}>
          <FileDown className="mr-2 h-4 w-4" />
          {t('common.docx', 'DOCX')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={onGoogleDocs}
          disabled={isExportingGDocs}
        >
          {isExportingGDocs ? (
            <LoadingSpinner size="sm" className="mr-2" />
          ) : (
            <GoogleDocsIcon className="mr-2 h-4 w-4" />
          )}
          {t('common.googleDocs', 'Google Docs')}
        </Button>
      </div>
    </div>
  );
}
