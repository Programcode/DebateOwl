import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { SourceView } from '@/components/source-view';

/** A source, read-only, in a form sheet. The iPad Library shows the same view beside its list. */
export default function SourceSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SourceView key={id} id={id} contentStyle={styles.content} onDone={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18 },
});
