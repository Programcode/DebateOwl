import AppTabs from '@/components/app-tabs';
import { useInactiveDebateCheck } from '@/lib/use-inactive-debate-check';

export default function TabsLayout() {
  useInactiveDebateCheck();
  return <AppTabs />;
}
