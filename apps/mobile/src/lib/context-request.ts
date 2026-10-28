import type { DebateContextFeature, DebateContextRequest, DebateContextSide } from '@debatelab/core/contract/debate-context';

import { planRequest } from './context-plan';

/**
 * The Current Debate material a request sends: IDs only, planned as the
 * website's planDebateContext plans them, with the student's Review choices
 * and the debate's pins (context-plan.ts). The server loads and checks the text.
 *
 * `side` is the side the request prepares, as the website's requestSide
 * picks it. `excludeChatId` is the chat open in Ask: it is already the
 * conversation.
 */
export async function buildDebateContext(
  userId: string,
  debateId: string,
  feature: DebateContextFeature,
  side: DebateContextSide,
  excludeChatId: string | null = null,
): Promise<DebateContextRequest> {
  return (await planRequest(userId, debateId, feature, side, { excludeChatId })).request;
}
