import cluster from '@/config/ai-debate-cluster.json';

/**
 * The AI-debate cluster pages with their exact link anchors, from
 * src/config/ai-debate-cluster.json, which scripts/seo_cluster.py reads too.
 * A link marked `"live": false` is for a page that does not exist yet and
 * stays hidden until it is set true.
 */
export const AI_DEBATE_LINKS: readonly { path: string; anchor: string }[] = cluster.links
  .filter((link) => !('live' in link) || link.live)
  .map(({ path, anchor }) => ({ path, anchor }));

/** The /ai-debate page, once it is live. */
export const AI_DEBATE_PARTNER = AI_DEBATE_LINKS.find((link) => link.path === '/ai-debate');
