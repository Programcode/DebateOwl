import { cleanGeneratedOutput } from './generate-output';
import type { BrainstormOutput } from './schemas/brainstorm';

/**
 * Transforms AI brainstorm response to ensure all required fields exist.
 * This handles cases where the AI returns incomplete structures.
 */
export function transformBrainstormResponse(response: Record<string, unknown>): BrainstormOutput {
  // Ensure required base fields exist
  const result: BrainstormOutput = {
    needsMoreInfo: Boolean(response.needsMoreInfo),
    clarifyingQuestions: Array.isArray(response.clarifyingQuestions) ? response.clarifyingQuestions : [],
    nextSteps: Array.isArray(response.nextSteps) ? response.nextSteps : [],
    warningsAndTradeoffs: Array.isArray(response.warningsAndTradeoffs) ? response.warningsAndTradeoffs : [],
  };

  // Helper to normalize an Idea object
  const normalizeIdea = (idea: unknown): { id: string; title: string; description: string; side: 'pro' | 'con' | 'neutral'; strength: 'strong' | 'moderate' | 'weak'; tradeoffs: string[]; relatedTo: string[] } | null => {
    if (!idea || typeof idea !== 'object') return null;
    const i = idea as Record<string, unknown>;
    return {
      id: String(i.id || `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      title: String(i.title || 'Untitled'),
      description: String(i.description || ''),
      side: (['pro', 'con', 'neutral'].includes(String(i.side)) ? i.side : 'neutral') as 'pro' | 'con' | 'neutral',
      strength: (['strong', 'moderate', 'weak'].includes(String(i.strength)) ? i.strength : 'moderate') as 'strong' | 'moderate' | 'weak',
      tradeoffs: Array.isArray(i.tradeoffs) ? i.tradeoffs.map(String) : [],
      relatedTo: Array.isArray(i.relatedTo) ? i.relatedTo.map(String) : [],
    };
  };

  const normalizeTopFiveItems = (items: unknown[]) => items
    .map((item: unknown, index) => {
      if (!item) return null;
      if (typeof item !== 'object') {
        const idea = normalizeIdea({ title: String(item || `Idea ${index + 1}`), description: String(item || '') });
        return idea ? { rank: index + 1, idea, whyTop: '' } : null;
      }
      const entry = item as Record<string, unknown>;
      const idea = normalizeIdea(entry.idea || entry);
      if (!idea) return null;
      return {
        rank: typeof entry.rank === 'number' ? entry.rank : index + 1,
        idea,
        whyTop: String(entry.whyTop || entry.rationale || entry.reason || ''),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Transform topFive if present
  if (response.topFive && Array.isArray(response.topFive)) {
    result.topFive = normalizeTopFiveItems(response.topFive);
  }

  // Transform mindmap if present
  if (response.mindmap && Array.isArray(response.mindmap)) {
    result.mindmap = response.mindmap
      .map((category: unknown) => {
        if (!category || typeof category !== 'object') return null;
        const c = category as Record<string, unknown>;
        const items = Array.isArray(c.items)
          ? c.items.map(normalizeIdea).filter((i): i is NonNullable<typeof i> => i !== null)
          : [];
        return {
          category: String(c.category || 'Uncategorized'),
          items,
        };
      })
      .filter((cat): cat is NonNullable<typeof cat> => cat !== null && cat.items.length > 0);
  }

  // Transform buckets if present
  if (response.buckets && Array.isArray(response.buckets)) {
    result.buckets = response.buckets
      .map((bucket: unknown) => {
        if (!bucket || typeof bucket !== 'object') return null;
        const b = bucket as Record<string, unknown>;
        const ideas = Array.isArray(b.ideas)
          ? b.ideas.map(normalizeIdea).filter((i): i is NonNullable<typeof i> => i !== null)
          : [];
        return {
          name: String(b.name || 'Unnamed Bucket'),
          ideas,
          keyInsight: String(b.keyInsight || ''),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && b.ideas.length > 0);
  }

  if (!result.topFive?.length && !result.mindmap?.length && !result.buckets?.length) {
    const fallbackItems = [response.ideas, response.angles, response.recommendations, response.results]
      .find((value): value is unknown[] => Array.isArray(value));
    if (fallbackItems) {
      result.topFive = normalizeTopFiveItems(fallbackItems).slice(0, 5);
    }
  }

  return cleanGeneratedOutput(result);
}
