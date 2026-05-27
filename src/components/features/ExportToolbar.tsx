import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FileDown, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GoogleDocsIcon from '@/components/icons/GoogleDocsIcon';
import { AutoSavedSourcesUndo } from '@/components/features/AutoSavedSourcesUndo';

interface ExportToolbarProps {
  onPdf: () => void;
  onDocx: () => void;
  onGoogleDocs: () => void;
  isExportingGDocs?: boolean;
  onDiscuss?: () => void;
  discussLabel?: string;
  showUndo?: boolean;
  /** Extra export buttons rendered before PDF/DOCX/Google Docs on row 1. */
  extraExports?: ReactNode;
  /** Action buttons rendered on row 2 (e.g. flowchart import, save, undo). */
  secondaryActions?: ReactNode;
}

// Unified export bar used by every feature's results view.
// All elements left-aligned in a single wrapping group so the visual order
// matches the DOM order in every locale (longer translated labels can wrap to
// a second line, but never reorder).
export function ExportToolbar({
  onPdf,
  onDocx,
  onGoogleDocs,
  isExportingGDocs = false,
  onDiscuss,
  discussLabel,
  showUndo = true,
  extraExports,
  secondaryActions,
}: ExportToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2">
      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
        {t('common.export', 'Export')}
      </span>
      <div className="flex flex-wrap items-center justify-start gap-2">
        {showUndo && <AutoSavedSourcesUndo />}
        {extraExports}
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onPdf}>
          <FileText className="mr-2 h-4 w-4" />
          PDF
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDocx}>
          <FileDown className="mr-2 h-4 w-4" />
          DOCX
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={onGoogleDocs}
          disabled={isExportingGDocs}
        >
          {isExportingGDocs ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GoogleDocsIcon className="mr-2 h-4 w-4" />
          )}
          Google Docs
        </Button>
        {onDiscuss && (
          <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={onDiscuss}>
            <MessageSquare className="mr-2 h-4 w-4" />
            {discussLabel || t('common.discuss', 'Discuss')}
          </Button>
        )}
        {secondaryActions}
      </div>
    </div>
  );
}
