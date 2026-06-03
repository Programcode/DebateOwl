import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportToolbar } from '@/components/features/ExportToolbar';

describe('ExportToolbar', () => {
  it('keeps actions in exactly two left-aligned rows', () => {
    const { container } = render(
      <ExportToolbar
        onPdf={vi.fn()}
        onDocx={vi.fn()}
        onGoogleDocs={vi.fn()}
        secondaryActions={<button type="button">Save</button>}
      />,
    );

    const toolbar = container.firstElementChild;
    expect(toolbar).toHaveClass('items-start');
    expect(toolbar?.children).toHaveLength(2);

    const [secondaryRow, exportRow] = Array.from(toolbar?.children ?? []);
    expect(secondaryRow).toHaveClass('justify-start');
    expect(exportRow).toHaveClass('justify-start');
    expect(within(secondaryRow as HTMLElement).getByText('Save')).toBeInTheDocument();
    expect(within(exportRow as HTMLElement).getByText('Export')).toBeInTheDocument();
    expect(within(exportRow as HTMLElement).getByText('PDF')).toBeInTheDocument();
    expect(within(exportRow as HTMLElement).getByText('DOCX')).toBeInTheDocument();
    expect(within(exportRow as HTMLElement).getByText('Google Docs')).toBeInTheDocument();
  });
});
