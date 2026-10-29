import AppTabs from '@/components/app-tabs';
import { useInactiveDebateCheck } from '@/lib/use-inactive-debate-check';

// Tabs opened beneath a linked screen (the root layout's anchor) start on the Debate tab.
export const unstable_settings = { anchor: '(debate)' };

export default function TabsLayout() {
  useInactiveDebateCheck();
  return <AppTabs />;
}
