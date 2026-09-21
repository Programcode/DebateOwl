import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonnerBase = vi.fn();
const sonnerError = vi.fn();
const sonnerSuccess = vi.fn();

vi.mock('sonner', () => {
  const toast = Object.assign(sonnerBase, { error: sonnerError, success: sonnerSuccess });
  return { toast };
});

const { toast } = await import('@/hooks/use-toast');

beforeEach(() => {
  sonnerBase.mockClear();
  sonnerError.mockClear();
  sonnerSuccess.mockClear();
});

describe('toast adapter', () => {
  it('routes destructive to sonner.error', () => {
    toast({ title: 'Broke', description: 'why', variant: 'destructive' });
    expect(sonnerError).toHaveBeenCalledWith('Broke', { description: 'why', action: undefined });
    expect(sonnerBase).not.toHaveBeenCalled();
  });

  it('routes success to sonner.success', () => {
    toast({ title: 'Done', variant: 'success' });
    expect(sonnerSuccess).toHaveBeenCalledWith('Done', { description: undefined, action: undefined });
  });

  it('routes default and missing variant to the base toast', () => {
    toast({ title: 'Saved' });
    toast({ title: 'Also saved', variant: 'default' });
    expect(sonnerBase).toHaveBeenCalledTimes(2);
    expect(sonnerError).not.toHaveBeenCalled();
  });

  it('forwards an action and tolerates a missing title', () => {
    const action = { label: 'Retry', onClick: () => {} };
    toast({ description: 'no title', action });
    expect(sonnerBase).toHaveBeenCalledWith('', { description: 'no title', action });
  });
});
