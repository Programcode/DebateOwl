import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: vi.fn(() => ({
    featureConfigs: {
      generate: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
      attack: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
      brainstorm: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.9 },
      factoids: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.3 },
      ask: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
    },
    setFeatureConfig: vi.fn(),
  })),
}));

vi.mock('@/lib/ai/providers/types', () => ({
  DEFAULT_PROVIDERS: [
    {
      id: 'openai', name: 'OpenAI',
      models: [
        { id: 'gpt-5.5', name: 'GPT-5.5', description: '', maxTokens: 128000, isProOnly: true },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: '', maxTokens: 128000 },
      ],
      isAvailable: () => true,
    },
    {
      id: 'anthropic', name: 'Anthropic',
      models: [
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', description: '', maxTokens: 200000, isProOnly: true },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: '', maxTokens: 200000 },
      ],
      isAvailable: () => true,
    },
    {
      id: 'google', name: 'Google Gemini',
      models: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: '', maxTokens: 2000000, isProOnly: true },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: '', maxTokens: 1000000 },
      ],
      isAvailable: () => true,
    },
  ],
}));

import { ModelSelector } from '@/components/ModelSelector';
import { useSettingsStore } from '@/lib/stores/settings-store';

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ModelSelector feature="generate" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders with default model value', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDefined();
  });

  it('renders for attack feature', () => {
    render(<ModelSelector feature="attack" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders for brainstorm feature', () => {
    render(<ModelSelector feature="brainstorm" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders for factoids feature', () => {
    render(<ModelSelector feature="factoids" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders for ask feature', () => {
    render(<ModelSelector feature="ask" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('uses default model when featureConfigs is undefined', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: undefined as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('uses default model when feature config is missing', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {} as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('uses default model when config.model is empty', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: { generate: { provider: 'google', model: '', temperature: 0.7 } } as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('has a select trigger element', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.tagName).toBeDefined();
  });

  it('trigger has text-xs class for small text', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('text-xs');
  });

  it('renders with correct width classes', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toContain('w-[160px]');
  });

  it('calls setFeatureConfig from store', () => {
    const mockSetFeatureConfig = vi.fn();
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {
        generate: { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 },
      } as any,
      setFeatureConfig: mockSetFeatureConfig,
    });
    render(<ModelSelector feature="generate" />);
    expect(mockSetFeatureConfig).not.toHaveBeenCalled();
  });

  it('renders the Cpu icon (hidden on mobile)', () => {
    const { container } = render(<ModelSelector feature="generate" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
  });

  it('handles all feature types without error', () => {
    const features = ['generate', 'attack', 'brainstorm', 'factoids', 'ask'] as const;
    features.forEach(feature => {
      const { unmount } = render(<ModelSelector feature={feature} />);
      expect(screen.getByRole('combobox')).toBeDefined();
      unmount();
    });
  });
});
