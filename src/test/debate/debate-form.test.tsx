import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/i18n';
import { DebateForm } from '@/components/features/debate/DebateForm';

describe('DebateForm', () => {
  it('keeps settings it does not show, such as the judge the iOS app sets, when it saves', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DebateForm
        initial={{ motion: 'This House would ban homework', settings: { format: 'bp', role: 'r1', judge: 'Lay judge, a parent volunteer' }, instructions: '' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].settings).toEqual({ format: 'bp', role: 'r1', judge: 'Lay judge, a parent volunteer' });
  });
});
