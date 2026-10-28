import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { SheetScrollView } from '@/components/sheet';
import { SourceView } from '@/components/source-view';

/** A source, read-only, in a form sheet. The iPad Library shows the same view beside its list. */
export default function SourceSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="source-sheet">
      {/* Opened from a link with nothing under it, closing goes to the Library. */}
      <SourceView key={id} id={id} onDone={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, gap: 14 },
});
