import { describe, expect, it } from 'vitest';
import { componentFromModule, loadOptionalComponent } from '@/components/optional-telemetry';

function Marker(): null {
  return null;
}

describe('optional telemetry modules', () => {
  it('does not throw when a preload resolves to undefined', async () => {
    expect(componentFromModule(undefined, 'Analytics').name).toBe('HiddenTelemetry');
    const loaded = await loadOptionalComponent(() => Promise.resolve(undefined), 'Analytics');
    expect(loaded.default.name).toBe('HiddenTelemetry');
  });

  it('uses the named export when the chunk arrives', async () => {
    const loaded = await loadOptionalComponent(
      () => Promise.resolve({ Analytics: Marker }),
      'Analytics',
    );
    expect(loaded.default).toBe(Marker);
  });

  it('resolves a fallback when the chunk rejects', async () => {
    const loaded = await loadOptionalComponent(() => Promise.reject(new TypeError('Failed to fetch')), 'SpeedInsights');
    expect(loaded.default.name).toBe('HiddenTelemetry');
  });
});
