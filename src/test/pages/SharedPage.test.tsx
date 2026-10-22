import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/lib/supabase/auth-context';
import SharedPage from '@/pages/SharedPage';

const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: () => ({ maybeSingle }),
  },
}));

const signedOut: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  signInWithGoogle: async () => undefined,
  signInWithEmailOtp: async () => undefined,
  verifyEmailOtp: async () => undefined,
  signInWithDemoCode: async () => undefined,
  signOut: async () => undefined,
  leaveEnvironment: async () => undefined,
  discardTabState: () => undefined,
};

function renderShare(path = '/share/doesnotexist123') {
  return render(
    <AuthContext.Provider value={signedOut}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/:code" element={<SharedPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('a missing share link', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    document.head.querySelector('meta[name="robots"]')?.remove();
    document.title = 'DebateLab';
  });

  it('renders a not-found page with its own title and noindex', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    renderShare();

    expect(await screen.findByRole('heading', { level: 1, name: 'Shared link not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Shared Content' })).not.toBeInTheDocument();
    expect(screen.getByText('This shared content is no longer available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Shared link not found · DebateLab');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('still shows a shared item that exists', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: '1',
        share_code: 'abc',
        item_type: 'note',
        item_data: { summary: 'A short note' },
        title: 'Practice case',
        created_at: '2026-10-01T00:00:00Z',
        view_count: 2,
      },
      error: null,
    });
    renderShare('/share/abc');

    expect(await screen.findByRole('heading', { level: 1, name: 'Practice case' })).toBeInTheDocument();
    expect(screen.getByText('A short note')).toBeInTheDocument();
    expect(document.title).toBe('DebateLab');
  });
});
