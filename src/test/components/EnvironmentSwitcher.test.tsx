import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentSwitcher } from '@/components/features/settings/EnvironmentSwitcher';
import { StagingBanner } from '@/components/StagingBanner';

const mocks = vi.hoisted(() => ({
  env: 'production' as 'local' | 'production' | 'staging',
  setActiveEnv: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase/env', () => ({
  getActiveEnv: () => mocks.env,
  setActiveEnv: mocks.setActiveEnv,
}));
vi.mock('@/lib/supabase/AuthProvider', () => ({ useAuth: () => ({ leaveEnvironment: mocks.signOut }) }));

beforeEach(() => {
  mocks.env = 'production';
  mocks.setActiveEnv.mockReset();
  mocks.signOut.mockReset().mockResolvedValue(undefined);
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
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Staging' }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('pointing at staging');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch & Sign Out' })); });
    expect(order).toEqual(['signOut', 'set:staging', 'reload']);
  });

  it('leaves the environment alone when the dialog is cancelled', () => {
    const reload = vi.fn();
    render(<EnvironmentSwitcher reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Staging' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.setActiveEnv).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('offers production while staging is active', () => {
    mocks.env = 'staging';
    render(<EnvironmentSwitcher reload={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Switch to Production' })).toBeInTheDocument();
  });

  it('still switches when sign-out fails, so nobody is stranded on a broken project', async () => {
    mocks.env = 'staging';
    mocks.signOut.mockRejectedValue(new Error('staging unreachable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = vi.fn();
    render(<EnvironmentSwitcher reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Production' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch & Sign Out' })); });
    expect(mocks.setActiveEnv).toHaveBeenCalledWith('production');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders nothing in local preview', () => {
    mocks.env = 'local';
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch to Production' })); });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.setActiveEnv).toHaveBeenCalledWith('production');
    expect(reload).toHaveBeenCalledOnce();
  });
});
