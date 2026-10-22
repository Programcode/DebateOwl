import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatRows } from './ask-chat-list';
import { PrimaryButton, TextButton } from './buttons';
import { Text } from './text';

import { useAuth } from '@/lib/auth';
import { fetchChats, type ChatSummary } from '@/lib/chats';
import { useCopyHolder } from '@/lib/use-copy-holder';
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
        <ChatRows chats={chats} failed={failed} openChatId={openChatId} onPick={onPick} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, flexShrink: 1 },
});
