import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/buttons';
import { Card, IconTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { SheetScrollView } from '@/components/sheet';
import { SOURCE_ICONS, sourceMeta } from '@/components/source-display';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { fetchSource, type Source } from '@/lib/sources';
import { useTheme } from '@/theme/use-theme';

function webUrl(origin: string | null): string | null {
  return origin && /^https?:\/\//i.test(origin) ? origin : null;
}

/** A source, read-only: its title, where it came from and its text. */
export default function SourceSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [source, setSource] = useState<Source | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchSource(userId, id)
      .then((next) => {
        if (active) setSource(next);
      })
      .catch((cause: unknown) => {
        console.warn('Could not load the source:', cause instanceof Error ? cause.message : cause);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [userId, id]);

  const url = webUrl(source?.origin ?? null);

  return (
    <SheetScrollView contentContainerStyle={styles.content} testID="source-sheet">
      <View style={styles.header}>
        <View style={styles.headerText}>
          {source ? (
            <View style={styles.kind}>
              <IconTile name={SOURCE_ICONS[source.type]} size={30} />
              <Text tone="faint" style={styles.meta} numberOfLines={1}>
                {sourceMeta(t, source)}
              </Text>
            </View>
          ) : null}
        </View>
        <TextButton label={t('mobile.common.done')} onPress={() => router.back()} />
      </View>

      {failed ? (
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.loadFailed')}
        </Text>
      ) : source === undefined ? (
        <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />
      ) : source === null ? (
        <Text tone="secondary" style={styles.body}>
          {t('mobile.library.sourceMissing')}
        </Text>
      ) : (
        <>
          <Text accessibilityRole="header" weight="bold" style={styles.title} selectable>
            {source.title || t('libraryPage.untitledSource')}
          </Text>
          {url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityHint={t('mobile.library.openPage')}
              onPress={() => void WebBrowser.openBrowserAsync(url)}
              style={({ pressed }) => [styles.origin, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
              <Icon name="globe" color={colors.primary} size={19} />
              <Text weight="medium" style={[styles.originText, { color: colors.primary }]} numberOfLines={1}>
                {url.replace(/^https?:\/\/(www\.)?/i, '')}
              </Text>
              <Icon name="externalLink" color={colors.primary} size={17} />
            </Pressable>
          ) : source.origin ? (
            <Text tone="faint" style={styles.meta}>
              {source.origin}
            </Text>
          ) : null}
          <Card>
            <Text style={styles.text} selectable>
              {source.content}
            </Text>
          </Card>
        </>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  meta: { fontSize: 14, flexShrink: 1 },
  loading: { marginTop: 32 },
  body: { fontSize: 15, lineHeight: 21 },
  title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.4 },
  origin: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 46 },
  originText: { flex: 1, fontSize: 15 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 16, lineHeight: 24 },
});
