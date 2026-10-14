import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from './buttons';
import { Card } from './card';
import { Icon } from './icon';
import { Text } from './text';

import { useAuth } from '@/lib/auth';
import { fetchChats, type ChatSummary } from '@/lib/chats';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme/use-theme';

/** Past Ask chats in this debate (or the unsorted ones in one-off mode), in a native page sheet. */
export function AskHistory({
  visible,
  debateId,
  openChatId,
  onClose,
  onPick,
  onNewChat,
}: {
  visible: boolean;
  debateId: string | null;
  openChatId: string | null;
  onClose: () => void;
  onPick: (chatId: string) => void;
  onNewChat: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const copies = useCopyHolder();

  useEffect(() => {
    if (!visible || !userId) {
      copies.release();
      return;
    }
    let active = true;
    setChats(null);
    setFailed(false);
    fetchChats(userId, debateId, copies.mark())
      .then((next) => {
        if (active) setChats(next);
      })
      .catch((cause: unknown) => {
        console.warn('Could not load chats:', cause instanceof Error ? cause.message : cause);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [visible, userId, debateId, copies]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        testID="ask-history">
        <View style={styles.header}>
          <Text accessibilityRole="header" weight="bold" style={styles.title}>
            {t('askChat.savedChats')}
          </Text>
          <TextButton label={t('mobile.common.done')} onPress={onClose} />
        </View>
        <PrimaryButton icon="plus" label={t('askChat.newChat')} onPress={onNewChat} />
        {failed ? (
          <Text tone="secondary" style={styles.body}>
            {t('mobile.ask.historyFailed')}
          </Text>
        ) : chats === null ? (
          <ActivityIndicator style={styles.loading} accessibilityRole="progressbar" />
        ) : chats.length === 0 ? (
          <Card>
            <Text weight="semibold" style={styles.rowTitle}>
              {t('askChat.noSavedChats')}
            </Text>
            <Text tone="secondary" style={styles.body}>
              {t('askChat.noSavedChatsDesc')}
            </Text>
          </Card>
        ) : (
          <Card style={styles.list}>
            {chats.map((chat, index) => (
              <Pressable
                key={chat.id}
                accessibilityRole="button"
                accessibilityState={{ selected: chat.id === openChatId }}
                onPress={() => onPick(chat.id)}
                style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && styles.pressed]}>
                <View style={styles.rowText}>
                  <Text weight="semibold" style={styles.rowTitle} numberOfLines={2}>
                    {chat.title}
                  </Text>
                  <Text tone="faint" style={styles.meta}>
                    {`${formatDate(new Date(chat.createdAt).toISOString())} · ${t('askChat.messageCount', { count: chat.messageCount })}`}
                  </Text>
                </View>
                {chat.id === openChatId ? <Icon name="check" color={colors.primary} size={21} /> : null}
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  loading: { marginTop: 24 },
  list: { padding: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 14 },
  pressed: { opacity: 0.6 },
});
