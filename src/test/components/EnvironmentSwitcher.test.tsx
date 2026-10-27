import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentSwitcher } from '@/components/features/settings/EnvironmentSwitcher';
import { StagingBanner } from '@/components/StagingBanner';

const mocks = vi.hoisted(() => ({
  env: 'production' as 'local' | 'production' | 'staging',
  pinned: false,
  setActiveEnv: vi.fn(),
  signOut: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('@/lib/supabase/env', () => ({
  ENV_STORAGE_KEY: 'debate-supabase-env',
  getActiveEnv: () => mocks.env,
  isEnvPinned: () => mocks.env === 'local' || mocks.pinned,
  setActiveEnv: mocks.setActiveEnv,
}));
vi.mock('@/lib/supabase/AuthProvider', () => ({ useAuth: () => ({ leaveEnvironment: mocks.signOut, discardTabState: mocks.discard }) }));

beforeEach(() => {
  mocks.env = 'production';
  mocks.pinned = false;
  mocks.setActiveEnv.mockReset();
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.discard.mockReset();
});
afterEach(cleanup);

describe('EnvironmentSwitcher', () => {
  it('switches production to staging only after confirmation, signing out first', async () => {
    const order: string[] = [];
    mocks.signOut.mockImplementation(async () => { order.push('signOut'); });
    mocks.setActiveEnv.mockImplementation((env: string) => { order.push(`set:${env}`); });
    const reload = vi.fn(() => { order.push('reload'); });
    render(<EnvironmentSwitcher reload={reload} />);

    expect(screen.getByText('production')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to staging' }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('pointing at staging');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch & sign out' })); });
    expect(order).toEqual(['signOut', 'set:staging', 'reload']);
  });

  it('leaves the environment alone when the dialog is cancelled', () => {
    const reload = vi.fn();
    render(<EnvironmentSwitcher reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to staging' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.setActiveEnv).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('still switches when sign-out fails, so nobody is stranded on a broken project', async () => {
    mocks.env = 'staging';
    mocks.signOut.mockRejectedValue(new Error('staging unreachable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = vi.fn();
    render(<EnvironmentSwitcher reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to production' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch & sign out' })); });
    expect(mocks.setActiveEnv).toHaveBeenCalledWith('production');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders nothing in local preview', () => {
    mocks.env = 'local';
    const { container } = render(<EnvironmentSwitcher reload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing in a staging preview build, which cannot switch', () => {
    mocks.env = 'staging';
    mocks.pinned = true;
    const { container } = render(<EnvironmentSwitcher reload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StagingBanner', () => {
  it('is hidden outside staging', () => {
    const { container, rerender } = render(<StagingBanner reload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    mocks.env = 'local';
    rerender(<StagingBanner reload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks staging and returns to production without needing a staging session', async () => {
    mocks.env = 'staging';
    const reload = vi.fn();
    render(<StagingBanner reload={reload} />);
    expect(screen.getByRole('status')).toHaveTextContent('Staging backend');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch to production' })); });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.setActiveEnv).toHaveBeenCalledWith('production');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads this tab when another tab switches to a different project', () => {
    const reload = vi.fn();
    render(<StagingBanner reload={reload} />);
    const changeTo = (value: string | null, key: string | null = 'debate-supabase-env') => {
      if (value === null) localStorage.removeItem('debate-supabase-env');
      else localStorage.setItem('debate-supabase-env', value);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
    };

    changeTo(null, 'debate-trainer-storage');
    changeTo(null);
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
    mocks.discard.mockImplementation(() => expect(reload).not.toHaveBeenCalled());
    changeTo('staging');
    expect(mocks.discard).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    localStorage.removeItem('debate-supabase-env');
  });

  it('marks a staging preview build without offering a switch it cannot make', () => {
    mocks.env = 'staging';
    mocks.pinned = true;
    const reload = vi.fn();
    render(<StagingBanner reload={reload} />);
    expect(screen.getByRole('status')).toHaveTextContent('Staging backend');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    localStorage.setItem('debate-supabase-env', 'production');
    window.dispatchEvent(new StorageEvent('storage', { key: 'debate-supabase-env', newValue: 'production' }));
    expect(reload).not.toHaveBeenCalled();
    localStorage.removeItem('debate-supabase-env');
  });

  it('ignores other tabs in local preview', () => {
    mocks.env = 'local';
    const reload = vi.fn();
    render(<StagingBanner reload={reload} />);
    localStorage.setItem('debate-supabase-env', 'staging');
    window.dispatchEvent(new StorageEvent('storage', { key: 'debate-supabase-env', newValue: 'staging' }));
    expect(reload).not.toHaveBeenCalled();
    localStorage.removeItem('debate-supabase-env');
  });
});
