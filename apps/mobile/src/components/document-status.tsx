import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Skeleton } from './skeleton';
import { Text } from './text';

/** What a document screen shows before its result is ready, or when it cannot be shown. */
export function DocumentStatus({ status, incomplete }: { status: 'loading' | 'missing' | 'failed' | 'incomplete'; incomplete?: { title: string; body: string } }) {
  const { t } = useTranslation();
  if (status === 'loading') return <DocumentSkeleton />;
  return (
    <View style={styles.box} accessibilityRole="alert">
      {status === 'incomplete' && incomplete ? (
        <>
          <Text accessibilityRole="header" weight="semibold" style={styles.title}>
            {incomplete.title}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {incomplete.body}
          </Text>
        </>
      ) : (
        <Text tone="secondary" style={styles.body}>
          {status === 'missing' ? t('mobile.results.notFound') : t('mobile.results.loadFailed')}
        </Text>
      )}
    </View>
  );
}

// Line widths for the paragraphs, so the page reads as text, not as a grid of bars.
const PARAGRAPHS = [
  ['100%', '96%', '88%', '62%'],
  ['100%', '92%', '97%', '48%'],
  ['98%', '90%', '70%'],
] as const;

/** A document loading in its own shape: a heading, then paragraphs. It is the loading indicator. */
function DocumentSkeleton() {
  const { t } = useTranslation();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={styles.loading}>
      <Skeleton width="72%" height={24} round={8} />
      {PARAGRAPHS.map((lines, paragraph) => (
        <View key={paragraph} style={styles.paragraph}>
          {lines.map((width, line) => (
            <Skeleton key={line} width={width} height={13} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 20, gap: 22 },
  paragraph: { gap: 10 },
  box: { gap: 6, marginTop: 24 },
  title: { fontSize: 18 },
  body: { fontSize: 16, lineHeight: 22 },
});
