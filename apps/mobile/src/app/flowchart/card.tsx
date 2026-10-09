import { addCard } from '@debatelab/core/flowchart';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { CardForm } from '@/components/flowchart-card-form';
import { SheetScrollView } from '@/components/sheet';
import { Text } from '@/components/text';
import { findDraft, updateDraft, useFlowchartDrafts } from '@/lib/flowchart-drafts';

/** "+": the website's Add Node dialog as a form sheet. The card joins the map on screen. */
export default function AddCardSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { scope, map } = useLocalSearchParams<{ scope: string; map: string }>();
  useFlowchartDrafts();
  // `map` is the map's handle, so a save that changes its key while the sheet is open keeps it.
  const held = scope && map ? findDraft(scope, map) : null;
  const draft = held?.draft;

  return (
    <SheetScrollView testID="card-sheet">
      <View style={styles.header}>
        <Text accessibilityRole="header" weight="bold" style={styles.title}>
          {t('flowchart.addNodeDialog')}
        </Text>
        <TextButton label={t('common.cancel')} onPress={() => router.back()} />
      </View>
      <Text tone="secondary" style={styles.body}>
        {draft ? t('flowchart.addNodeDialogDesc') : t('mobile.flowchart.mapGone')}
      </Text>
      {draft ? (
        <CardForm
          initial={{ label: '', description: '', type: 'contention', strength: 'moderate' }}
          submitLabel={t('flowchart.addNode')}
          onSubmit={(fields) => {
            if (held) updateDraft(scope, held.key, (current) => ({ ...current, doc: addCard(current.doc, fields, Date.now()).doc, edited: true }));
            router.back();
          }}
        />
      ) : null}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21, marginTop: -8 },
});
