/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const subscriptionState = vi.hoisted(() => ({ isPro: false, tier: 'trial', loading: false }));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => subscriptionState,
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: vi.fn(() => ({
    featureConfigs: {
      generate: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7, reasoningEffort: 'low' },
      attack: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7, reasoningEffort: 'low' },
      brainstorm: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.9, reasoningEffort: 'low' },
      factoids: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.3, reasoningEffort: 'low' },
      ask: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7, reasoningEffort: 'low' },
    },
    setFeatureConfig: vi.fn(),
  })),
}));

vi.mock('@/lib/ai/providers/types', () => ({
  DEFAULT_MODEL: 'openai/gpt-5.6-luna',
  isReasoningEffort: (value: unknown) => value === 'low' || value === 'medium' || value === 'high',
  DEFAULT_PROVIDERS: [
    {
      id: 'openrouter', name: 'OpenRouter',
      models: [
        { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', maxTokens: 128000, isProOnly: false, supportsTemperature: false },
        { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', maxTokens: 65536, isProOnly: false, supportsTemperature: true },
        { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash', maxTokens: 131072, isProOnly: false, supportsTemperature: true },
        { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', maxTokens: 128000, isProOnly: true, supportsTemperature: false },
        { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', maxTokens: 128000, isProOnly: true, supportsTemperature: true },
        { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', maxTokens: 128000, isProOnly: true, supportsTemperature: false },
        { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra', maxTokens: 128000, isProOnly: true, supportsTemperature: false },
        { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro', maxTokens: 384000, isProOnly: true, supportsTemperature: true },
        { id: 'z-ai/glm-5.3-flash', name: 'GLM-5.3 Flash', maxTokens: 131072, isProOnly: true, supportsTemperature: true },
        { id: 'meta/muse-spark-1.3', name: 'Muse Spark 1.3', maxTokens: 943718, isProOnly: true, supportsTemperature: true },
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
    subscriptionState.isPro = false;
    subscriptionState.tier = 'trial';
    subscriptionState.loading = false;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders without crashing', () => {
    render(<ModelSelector feature="generate" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('renders with default model value', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getAllByRole('combobox')[0];
    expect(trigger).toBeDefined();
  });

  it('renders for attack feature', () => {
    render(<ModelSelector feature="attack" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('renders for brainstorm feature', () => {
    render(<ModelSelector feature="brainstorm" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('renders for factoids feature', () => {
    render(<ModelSelector feature="factoids" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('renders for ask feature', () => {
    render(<ModelSelector feature="ask" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('uses default model when featureConfigs is undefined', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: undefined as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('uses default model when feature config is missing', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {} as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('uses default model when config.model is empty', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: { generate: { provider: 'google', model: '', temperature: 0.7 } } as any,
      setFeatureConfig: vi.fn(),
    });
    render(<ModelSelector feature="generate" />);
    expect(screen.getAllByRole('combobox')[0]).toBeDefined();
  });

  it('has a select trigger element', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getAllByRole('combobox')[0];
    expect(trigger.tagName).toBeDefined();
  });

  it('trigger uses form-sized text', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getAllByRole('combobox')[0];
    expect(trigger.className).toContain('text-sm');
  });

  it('renders full width inside forms', () => {
    render(<ModelSelector feature="generate" />);
    const trigger = screen.getAllByRole('combobox')[0];
    expect(trigger.className).toContain('w-full');
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
      expect(screen.getAllByRole('combobox')[0]).toBeDefined();
      unmount();
    });
  });

  it('shows low reasoning and disables the choice for trial users with saved high reasoning', () => {
    const mockSetFeatureConfig = vi.fn();
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {
        generate: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7, reasoningEffort: 'high' },
      } as any,
      setFeatureConfig: mockSetFeatureConfig,
    });

    render(<ModelSelector feature="generate" />);

    const reasoning = screen.getAllByRole('combobox')[1];
    expect(reasoning).toBeDisabled();
    expect(reasoning).toHaveTextContent('Low');
    expect(mockSetFeatureConfig).not.toHaveBeenCalled();
  });

  it('keeps a saved Pro model visible after trial entitlement resolves', () => {
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {
        generate: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5', temperature: 0.7, reasoningEffort: 'low' },
      } as any,
      setFeatureConfig: vi.fn(),
    });

    render(<ModelSelector feature="generate" />);

    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Claude Sonnet 5');
  });

  it('keeps saved Pro controls visible while entitlement is loading', () => {
    subscriptionState.loading = true;
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {
        generate: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5', temperature: 0.7, reasoningEffort: 'high' },
      } as any,
      setFeatureConfig: vi.fn(),
    });

    render(<ModelSelector feature="generate" />);

    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Claude Sonnet 5');
    expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('High');
  });

  it('enables model and reasoning controls for Pro users', () => {
    subscriptionState.isPro = true;
    subscriptionState.tier = 'pro';
    vi.mocked(useSettingsStore).mockReturnValue({
      featureConfigs: {
        generate: { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7, reasoningEffort: 'low' },
      } as any,
      setFeatureConfig: vi.fn(),
    });

    render(<ModelSelector feature="generate" />);
    const [model, reasoning] = screen.getAllByRole('combobox');
    expect(model).not.toBeDisabled();
    expect(reasoning).not.toBeDisabled();
  });

});
