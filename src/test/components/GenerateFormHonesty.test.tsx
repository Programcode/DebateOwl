import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenerateForm } from '@/components/features/generate/GenerateForm';

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: () => ({
    generateForm: null as never,
    setGenerateForm: vi.fn(),
    sourceLibrary: [] as never[],
  }),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test' }, session: { access_token: 'test' } }),
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ tier: 'pro', canAccessProModels: true }),
}));

describe('GenerateForm control honesty', () => {
  it('labels audience and tone as style guidance that does not change research', () => {
    render(<GenerateForm onSubmit={vi.fn()} isLoading={false} />);
    const notes = screen.getAllByText(/guides writing style; it does not change research/i);
    expect(notes.length).toBeGreaterThan(0);
  });
});
