import site from "@/config/site.json";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * /ai-debate mini rounds that visitors chose to publish. The demo-rebuttal
 * Edge Function writes them, already redacted; anyone reads them through two
 * anon RPCs that return the public columns only. The build prerenders the
 * indexable ones (src/prerender/entry.tsx); every other round is rendered in
 * the browser under a noindex head.
 */

export interface PublishedTurn {
  argument: string;
  rebuttal: string;
  judgeNote: string;
}

export interface PublishedRound {
  slug: string;
  motion: string;
  side: "for" | "against";
  turns: PublishedTurn[];
  /** Substantial, nothing redacted, and the first published on its motion and side. */
  indexable: boolean;
  /** ISO timestamp. */
  publishedAt: string;
}

type Row = Omit<PublishedRound, "publishedAt"> & { published_at: string };

/** What a list of rounds shows, and all the build embeds for one: no argument text. */
export type RoundLink = Pick<PublishedRound, "slug" | "motion" | "side">;
export const roundLink = ({ slug, motion, side }: PublishedRound): RoundLink => ({ slug, motion, side });

export const PUBLISHED_ROUND_ROUTE = "/ai-debate/round/:slug";
export const publishedRoundPath = (slug: string) => `/ai-debate/round/${slug}`;
export const sideLabel = (side: PublishedRound["side"]) => (side === "for" ? "For" : "Against");

const toRound = ({ published_at: publishedAt, ...row }: Row): PublishedRound => ({ ...row, publishedAt });

async function rpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<Row[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(args),
    signal,
  });
  if (!response.ok) throw new Error(`${name} answered ${response.status}`);
  return await response.json() as Row[];
}

/** The round, or null when no round has that slug (never published, or taken down). */
export async function fetchPublishedRound(slug: string, signal?: AbortSignal): Promise<PublishedRound | null> {
  const [row] = await rpc("get_published_demo_round", { p_slug: slug }, signal);
  return row ? toRound(row) : null;
}

/** The newest indexable rounds, newest first. */
export async function listPublishedRounds(limit: number, signal?: AbortSignal): Promise<PublishedRound[]> {
  return (await rpc("list_published_demo_rounds", { p_limit: limit }, signal)).map(toRound);
}

const firstWords = (text: string, count: number) => {
  const words = text.trim().split(/\s+/);
  return words.length > count ? `${words.slice(0, count).join(" ")}…` : words.join(" ");
};

/** The motion and side: unique among indexable rounds, which allow one per motion and side. */
export const roundTitle = (round: PublishedRound) => `${round.motion} (${sideLabel(round.side)}): AI debate round | ${site.brand}`;

export const roundDescription = (round: PublishedRound) =>
  `A visitor argued ${round.side} “${round.motion}” against ${site.product}'s AI opponent, with a judge note on each turn. Their opening: “${firstWords(round.turns[0]?.argument ?? "", 18)}”`;
