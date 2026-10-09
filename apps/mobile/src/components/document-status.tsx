import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from './text';

/** What a document screen shows before its result is ready, or when it cannot be shown. */
export function DocumentStatus({ status, incomplete }: { status: 'loading' | 'missing' | 'failed' | 'incomplete'; incomplete?: { title: string; body: string } }) {
  const { t } = useTranslation();
  if (status === 'loading') return <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} />;
  return (
    <View style={styles.box} accessibilityRole="alert">
      {status === 'incomplete' && incomplete ? (
        <>
          <Text weight="semibold" style={styles.title}>
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

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
  box: { gap: 6, marginTop: 24 },
  title: { fontSize: 18 },
  body: { fontSize: 16, lineHeight: 22 },
});
