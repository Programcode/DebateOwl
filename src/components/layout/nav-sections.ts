// Which header item is active, so every app route answers "where am I?".

/** Tools that work inside the Current Debate. */
const DEBATE_TOOL_ROUTES = new Set([
  '/app/generate',
  '/app/attack',
  '/app/brainstorm',
  '/app/factoids',
  '/app/ask',
  '/app/crossfire',
  '/app/sparring',
  '/app/flowchart',
]);

export type NavSection = 'tools' | 'debate' | null;

export function navSectionFor(pathname: string, hasDebate: boolean): NavSection {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/app/debate') return 'debate';
  if (DEBATE_TOOL_ROUTES.has(path)) return hasDebate ? 'debate' : 'tools';
  if (path === '/app' || path === '/app/timer') return 'tools';
  return null;
}
