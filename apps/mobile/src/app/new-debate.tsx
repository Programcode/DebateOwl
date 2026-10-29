import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { DebateForm } from '@/components/debate-form';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { markNewDebate } from '@/lib/debate-arrival';
import { useDebates } from '@/lib/debate-context';

/**
 * Start a debate: the website's Start new debate dialog (motion, format, role,
 * instructions) plus the judge. It becomes current. The motion generator
 * opens it with its motion filled in.
 */
export default function NewDebateSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { create } = useDebates();
  const { motion } = useLocalSearchParams<{ motion?: string }>();

  return (
    <SheetScrollView testID="new-debate-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('debate.startNew')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} />
      </View>
      <Text tone="secondary" style={styles.body}>
        {t('debate.startNewDesc')}
      </Text>
      <DebateForm
        initial={motion ? { motion } : undefined}
        submitLabel={t('debate.startDebate')}
        onSubmit={async (values) => {
          const debate = await create(values);
          markNewDebate(debate.id);
          // Closes this sheet and the switcher under it, if it was opened from there.
          router.dismissAll();
          router.navigate('/(tabs)/(debate)');
        }}
      />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
});
