import type { Debate } from './debates';
import type { MotionChoice, MotionGateText } from './motion-gate';

/** react-native-web's Alert does nothing, so the web preview asks with the browser's dialogs. */
export function chooseMotionTarget(matches: Debate[], text: MotionGateText): Promise<MotionChoice> {
  const ask = (label: string) => window.confirm(`${text.title}\n\n${text.message}\n\n${label}?`);
  if (matches[0] && ask(text.switchLabel)) return Promise.resolve({ kind: 'switch', debateId: matches[0].id });
  if (ask(text.createLabel)) return Promise.resolve({ kind: 'create' });
  if (ask(text.onceLabel)) return Promise.resolve({ kind: 'one-off' });
  return Promise.resolve(null);
}
