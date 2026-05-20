import { describe, expect, it } from 'vitest';
import { buildUserPrompt, getAskModeGuidance } from '../../../supabase/functions/ai/prompt-builder';

describe('supabase prompt-builder', () => {
  it('builds generate prompts with language and defaults', () => {
    const prompt = buildUserPrompt('generate', {
      motion: 'This house supports public transit subsidies',
      side: 'pro',
      language: 'es',
    }, 'SEARCH CONTEXT');

    expect(prompt).toContain('Motion: This house supports public transit subsidies');
    expect(prompt).toContain('Side: pro');
    expect(prompt).toContain('Length Instruction: Return exactly 3 contentions');
    expect(prompt).toContain('Audience Instruction: Assume a trained debater');
    expect(prompt).toContain('Tone Instruction: Use polished, judge-facing language');
    expect(prompt).toContain('Language: Spanish (es)');
    expect(prompt).toContain('SEARCH CONTEXT');
  });

  it('builds attack prompts with toggle states', () => {
    const prompt = buildUserPrompt('attack', {
      caseText: 'Case text',
      detectFallacies: false,
      analyzeWeighing: true,
    }, 'EXTRA');

    expect(prompt).toContain('Detect Fallacies: disabled');
    expect(prompt).toContain('Analyze Weighing: enabled');
    expect(prompt).toContain('CASE TEXT:');
    expect(prompt).toContain('EXTRA');
  });

  it('builds brainstorm prompts with optional context and defaults', () => {
    const prompt = buildUserPrompt('brainstorm', {
      motion: 'Ban private jets',
    }, 'SEARCH');

    expect(prompt).toContain('Motion: Ban private jets');
    expect(prompt).toContain('Side: both');
    expect(prompt).toContain('Output Mode: topfive');
  });

  it('builds factoids prompts with language and filters', () => {
    const prompt = buildUserPrompt('factoids', {
      claim: 'Solar is cheaper than coal',
      sourceType: 'government',
      language: 'en',
    }, 'CTX');

    expect(prompt).toContain('Find evidence for claim: "Solar is cheaper than coal"');
    expect(prompt).toContain('Source Type: government');
    expect(prompt).toContain('Language: English (en)');
  });

  it('builds ask prompts with mode guidance fallback', () => {
    const prompt = buildUserPrompt('ask', {
      message: 'Help me prep',
      mode: 'unknown-mode',
    }, '');

    expect(prompt).toContain('Mode: unknown-mode');
    expect(prompt).toContain('Mode Guidance: Give a direct coaching answer');
  });

  it('returns ask mode guidance for known and unknown modes', () => {
    expect(getAskModeGuidance('argumentmap')).toContain('include argumentMap');
    expect(getAskModeGuidance('clarify')).toContain('follow-up questions');
    expect(getAskModeGuidance('not-a-mode')).toContain('direct coaching answer');
  });

  it('uses fallback values for non-string generate fields', () => {
    const prompt = buildUserPrompt('generate', {
      motion: '',
      side: 123,
      format: null,
      role: undefined,
      length: '',
      audience: '',
      tone: '',
      language: 'zz',
    }, '');

    expect(prompt).toContain('Motion: ');
    expect(prompt).toContain('Side: pro');
    expect(prompt).toContain('Format: custom');
    expect(prompt).toContain('Role: intro');
    expect(prompt).toContain('Length: standard');
    expect(prompt).toContain('Audience: intermediate');
    expect(prompt).toContain('Tone: formal');
    expect(prompt).toContain('Language: zz (zz)');
  });

  it('builds attack prompts with boolean defaults and explicit disabled weighing', () => {
    const prompt = buildUserPrompt('attack', {
      caseText: 'Case text',
      aggressiveness: 0,
      judgeParadigm: {},
      detectFallacies: true,
      analyzeWeighing: false,
    }, '');

    expect(prompt).toContain('Attack Intensity: moderate');
    expect(prompt).toContain('Judge Paradigm: logic');
    expect(prompt).toContain('Detect Fallacies: enabled');
    expect(prompt).toContain('Analyze Weighing: disabled');
  });

  it('includes brainstorm context when provided', () => {
    const prompt = buildUserPrompt('brainstorm', {
      motion: 'Expand climate adaptation policy',
      context: 'School board debate round',
    }, '');

    expect(prompt).toContain('Context: School board debate round');
  });
});
