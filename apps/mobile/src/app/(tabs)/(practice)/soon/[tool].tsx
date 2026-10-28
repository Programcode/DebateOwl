import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PRACTICE_TOOLS } from '@/components/practice-tools';

/** A Practice tool that is not in the app yet. */
export default function PracticeToolScreen() {
  const { t } = useTranslation();
  const { tool } = useLocalSearchParams<{ tool: string }>();
  const entry = PRACTICE_TOOLS.find((item) => item.key === tool);
  return <PlaceholderScreen tab="practice" title={entry ? ('title' in entry ? t(entry.title, { ns: 'tools' }) : t(`nav.${entry.key}`)) : undefined} icon={entry?.icon} />;
}
