import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { BrainstormOutput } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

// "Discuss" prompts are built line by line, so no source indentation turns them into a
// Markdown code block, and they are sent from Ask itself, through its streaming path.

export function attackDiscussPrompt(result: AttackOutput, t: TFunction) {
  return [
    t('discuss.attack.intro', "I'd like to discuss the critique of my case."),
    '',
    `**${t('discuss.attack.assessment', 'Overall assessment')}:** ${result.overallAssessment.summary}`,
    `**${t('discuss.attack.score', 'Score')}:** ${result.overallAssessment.score}/100`,
    '',
    `**${t('discuss.attack.weaknesses', 'Top weaknesses')}:**`,
    ...result.weaknesses.slice(0, 3).map((weakness) => `- ${weakness.description} (${t(`attackResults.${weakness.severity}`, weakness.severity)})`),
    '',
    t('discuss.attack.ask', 'Can you help me improve this?'),
  ].join('\n');
}

export function brainstormDiscussPrompt(result: BrainstormOutput, t: TFunction) {
  const lines = [t('discuss.brainstorm.intro', "I'd like to discuss these brainstormed ideas."), ''];
  if (result.topFive?.length) {
    lines.push(`**${t('discuss.brainstorm.topIdeas', 'Top ideas')}:**`);
    lines.push(...result.topFive.map((item) => `- ${item.idea.title}${item.idea.side ? ` (${t(`brainstormResults.${item.idea.side}`, item.idea.side)})` : ''}`));
  } else if (result.buckets?.length) {
    lines.push(`**${t('discuss.brainstorm.buckets', 'Key buckets')}:**`);
    lines.push(...result.buckets.map((bucket) => `- ${bucket.name}: ${bucket.keyInsight}`));
  }
  lines.push('', t('discuss.brainstorm.ask', 'Can you help me expand on one of these?'));
  return lines.join('\n');
}

export function generateDiscussPrompt(result: GenerateOutput, t: TFunction) {
  return [
    t('discuss.generate.intro', "I'd like to discuss the case we just generated."),
    '',
    `**${t('discuss.generate.thesis', 'Thesis')}:** ${result.caseStructure.thesis}`,
    '',
    `**${t('discuss.generate.arguments', 'Arguments')}:**`,
    ...(result.contentions.length
      ? result.contentions.map((contention, index) => `${index + 1}. ${contention.title ?? contention.claim}`)
      : result.reinforce?.length
        ? result.reinforce.map((item, index) => `${index + 1}. ${item.argument || item.text}`)
        : (result.whyWeWin ?? []).map((reason, index) => `${index + 1}. ${reason}`)),
    '',
    t('discuss.generate.ask', 'Can we refine this?'),
  ].join('\n');
}

export function factoidsDiscussPrompt(result: FactoidsOutput, t: TFunction) {
  return [
    t('discuss.factoids.intro', "I'd like to discuss the evidence I found."),
    '',
    `**${t('discuss.factoids.factoids', 'Evidence')}:**`,
    ...result.factoids.slice(0, 3).map((factoid) => `- ${factoid.shortClaim} (${factoid.citation.publisher})`),
    '',
    t('discuss.factoids.ask', 'How can I best use this evidence?'),
  ].join('\n');
}

/** Opens Ask, which sends the prompt as the user's next message. */
export function openDiscussion(navigate: NavigateFunction, prompt: string) {
  navigate('/app/ask', { state: { discussPrompt: prompt } });
}
