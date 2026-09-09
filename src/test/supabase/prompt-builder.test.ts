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

  it('preserves every generate role and length combination', () => {
    const lengths = [
      ['brief', 2],
      ['standard', 3],
      ['comprehensive', 4],
    ] as const;
    const roles = ['intro', 'r1', 'r2', 'conc'] as const;

    for (const role of roles) {
      for (const [length, contentionCount] of lengths) {
        const prompt = buildUserPrompt('generate', {
          motion: 'MATRIX MOTION',
          side: 'con',
          format: 'custom',
          role,
          length,
          language: 'hu',
        }, 'RESEARCH CONTEXT');

        expect(prompt).toContain(`Role: ${role}`);
        expect(prompt).toContain(`Length: ${length}`);
        expect(prompt).toContain(`Length Instruction: Return exactly ${contentionCount} contentions`);
        expect(prompt).toContain('Language: Hungarian (hu)');
      }
    }
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

  it('preserves attack intensity, paradigms, and toggle combinations', () => {
    for (const aggressiveness of ['moderate', 'ruthless'] as const) {
      for (const judgeParadigm of ['logic', 'values', 'policy'] as const) {
        for (const [detectFallacies, analyzeWeighing] of [[true, true], [true, false], [false, true], [false, false]] as const) {
          const prompt = buildUserPrompt('attack', {
            caseText: 'MATRIX CASE',
            aggressiveness,
            judgeParadigm,
            detectFallacies,
            analyzeWeighing,
          }, 'RESEARCH CONTEXT');

          expect(prompt).toContain(`Attack Intensity: ${aggressiveness}`);
          expect(prompt).toContain(`Judge Paradigm: ${judgeParadigm}`);
          expect(prompt).toContain(`Detect Fallacies: ${detectFallacies ? 'enabled' : 'disabled'}`);
          expect(prompt).toContain(`Analyze Weighing: ${analyzeWeighing ? 'enabled' : 'disabled'}`);
        }
      }
    }
  });

  it('builds brainstorm prompts with optional context and defaults', () => {
    const prompt = buildUserPrompt('brainstorm', {
      motion: 'Ban private jets',
    }, 'SEARCH');

    expect(prompt).toContain('Motion: Ban private jets');
    expect(prompt).toContain('Side: both');
    expect(prompt).toContain('Output Mode: topfive');
  });

  it('preserves brainstorm output modes for one side and both sides', () => {
    for (const side of ['pro', 'con', 'both'] as const) {
      for (const outputMode of ['topfive', 'mindmap', 'buckets'] as const) {
        const prompt = buildUserPrompt('brainstorm', {
          motion: 'MATRIX MOTION',
          side,
          outputMode,
        }, 'RESEARCH CONTEXT');

        expect(prompt).toContain(`Side: ${side}`);
        expect(prompt).toContain(`Output Mode: ${outputMode}`);
      }
    }
  });

  it('builds factoids prompts with language and filters', () => {
    const prompt = buildUserPrompt('factoids', {
      claim: 'Solar is cheaper than coal',
      sourceType: 'government',
      language: 'en',
    }, 'CTX');

    expect(prompt).toContain('Find evidence in favor of this statement: "Solar is cheaper than coal"');
    expect(prompt).toContain('Source Type: government');
    expect(prompt).toContain('Language: English (en)');
  });

  it('preserves factoid source, timeframe, direction, and count inputs', () => {
    const fixtures = [
      { claim: 'Is this law constitutional?', direction: 'against', sourceType: 'government', timeframe: '2024-2026', sourceCount: 9, language: 'hu' },
      { claim: 'What do the latest statistics show?', direction: 'for', sourceType: 'government', timeframe: '2025-2026', sourceCount: 12, language: 'en' },
      { claim: 'Does the academic literature support this claim?', direction: 'for', sourceType: 'academic', timeframe: 'Recent (last 5 years)', sourceCount: 5, language: 'es' },
    ] as const;

    for (const fixture of fixtures) {
      const prompt = buildUserPrompt('factoids', fixture, 'RESEARCH CONTEXT');
      expect(prompt).toContain(`Find evidence ${fixture.direction === 'against' ? 'against' : 'in favor of'} this statement: "${fixture.claim}"`);
      expect(prompt).toContain(`Source Type: ${fixture.sourceType}`);
      expect(prompt).toContain(`Timeframe: ${fixture.timeframe}`);
      expect(prompt).toContain(`Source Count: ${fixture.sourceCount}`);
      expect(prompt).toContain(`Language: ${fixture.language === 'hu' ? 'Hungarian' : fixture.language === 'es' ? 'Spanish' : 'English'} (${fixture.language})`);
    }
  });

  it('builds ask prompts with mode guidance fallback', () => {
    const prompt = buildUserPrompt('ask', {
      message: 'Help me prep',
      mode: 'unknown-mode',
    }, '');

    expect(prompt).toContain('Mode: unknown-mode');
    expect(prompt).toContain('Mode Guidance: Give a direct coaching answer');
  });

  it('preserves general and clarify ask guidance', () => {
    for (const [mode, guidance] of [['general', 'Give a direct coaching answer'], ['clarify', 'Define unclear terms']] as const) {
      const prompt = buildUserPrompt('ask', { message: 'MATRIX QUESTION', mode }, '');
      expect(prompt).toContain(`Mode: ${mode}`);
      expect(prompt).toContain(`Mode Guidance: ${guidance}`);
      expect(prompt).not.toContain('RESEARCH CITATION RULES:');
    }
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
