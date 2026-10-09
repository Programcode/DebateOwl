import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PREPARE_TOOLS } from '@/components/prepare-tools';

/** A Prepare tool that is not in the app yet. */
export default function PrepareToolScreen() {
  const { t } = useTranslation();
  const { tool } = useLocalSearchParams<{ tool: string }>();
  const entry = PREPARE_TOOLS.find((item) => item.key === tool);
  return <PlaceholderScreen tab="prepare" title={entry ? t(`nav.${entry.key}`) : undefined} icon={entry?.icon} />;
}
