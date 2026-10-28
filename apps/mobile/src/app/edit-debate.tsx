import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { DebateForm } from '@/components/debate-form';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { useToast } from '@/components/toast';
import { useDebates } from '@/lib/debate-context';

/** The website's Edit settings for the Current Debate: motion, format, role and instructions, plus the judge. */
export default function EditDebateSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { current, update } = useDebates();

  return (
    <SheetScrollView testID="edit-debate-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="display" style={styles.title}>
          {t('debate.editSettings')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} />
      </View>
      {current ? (
        <DebateForm
          key={current.id}
          initial={current}
          submitLabel={t('common.save')}
          onSubmit={async (values) => {
            await update(current.id, values);
            toast({ tone: 'success', title: t('debate.settingsSaved') });
            router.back();
          }}
        />
      ) : (
        <Text tone="secondary" style={styles.body}>
          {t('debate.noCurrentDesc')}
        </Text>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
});
