import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { Card, ListItemIn, SkeletonTextRows } from './card';
import { Icon } from './icon';
import { CardRowFrame, useRowArrivals } from './list-screen';
import { PressScale } from './press-scale';
import { Text } from './text';

import { useAuth } from '@/lib/auth';
import { fetchChats, type ChatSummary } from '@/lib/chats';
import { formatDate } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useCopyHolder } from '@/lib/use-copy-holder';
import { useTheme } from '@/theme/use-theme';

/**
 * Saved chats as a list with their loading, failed and empty states, below `header`. It is the
 * scroll view itself (a FlatList), so a debate with hundreds of chats draws only those on screen.
 */
export function ChatList({
  chats,
  failed,
  openChatId,
  onPick,
  highlightOpen = false,
  header,
  style,
  contentContainerStyle,
  testID,
}: {
  chats: ChatSummary[] | null;
  failed: boolean;
  openChatId: string | null;
  onPick: (chatId: string) => void;
  /** The iPad list marks the open chat with a tinted row instead of a check. */
  highlightOpen?: boolean;
  header: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = chats ?? [];
  const arrivals = useRowArrivals(rows.map((chat) => chat.id));
  const empty =
    failed && !chats ? (
      <Text tone="secondary" style={styles.body}>
        {t('mobile.ask.historyFailed')}
      </Text>
    ) : chats === null ? (
      <SkeletonTextRows rows={4} />
    ) : (
      <Card>
        <Text weight="semibold" style={styles.rowTitle}>
          {t('askChat.noSavedChats')}
        </Text>
        <Text tone="secondary" style={styles.body}>
          {t('askChat.noSavedChatsDesc')}
        </Text>
      </Card>
    );
  return (
    <FlatList
      data={rows}
      keyExtractor={(chat) => chat.id}
      extraData={openChatId}
      style={style}
      contentContainerStyle={contentContainerStyle}
      testID={testID}
      ListHeaderComponent={<View style={styles.listHeader}>{header}</View>}
      ListEmptyComponent={empty}
      renderItem={({ item: chat, index }) => {
        const open = chat.id === openChatId;
        return (
          <CardRowFrame index={index} count={rows.length}>
            <ListItemIn index={index} enter={arrivals.entersNow(chat.id)} style={index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }}>
              <PressScale
                accessibilityRole="button"
                accessibilityState={{ selected: open }}
                onPress={() => {
                  if (!open) haptics.select();
                  onPick(chat.id);
                }}
                testID="ask-chat-row"
                style={[styles.row, highlightOpen && open && { backgroundColor: colors.tile }]}>
                <View style={styles.rowText}>
                  <Text weight="semibold" style={[styles.rowTitle, highlightOpen && open && { color: colors.chipSelectedForeground }]} numberOfLines={2}>
                    {chat.title}
                  </Text>
                  <Text tone="faint" style={styles.meta}>
                    {`${formatDate(new Date(chat.createdAt).toISOString())} · ${t('askChat.messageCount', { count: chat.messageCount })}`}
                  </Text>
                </View>
                {open && !highlightOpen ? <Icon name="check" color={colors.primary} size={21} /> : null}
              </PressScale>
            </ListItemIn>
          </CardRowFrame>
        );
      }}
    />
  );
}

/**
 * Ask's conversations beside the chat on iPad (mock A, like Messages): the
 * Current Debate's saved chats, or the unsorted ones in one-off mode. A list
 * from another account or debate is never shown while the next one loads.
 */
export function AskChatPane({
  debateId,
  openChatId,
  reloadKey,
  width,
  onBack,
  onPick,
  onNewChat,
}: {
  debateId: string | null;
  openChatId: string | null;
  /** Changes when the open chat is saved, so its row and count show up. */
  reloadKey: string;
  width: number;
  onBack: () => void;
  onPick: (chatId: string) => void;
  onNewChat: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const identity = userId ? `${userId}:${debateId ?? ''}` : null;
  const [state, setState] = useState<{ identity: string | null; chats: ChatSummary[] | null; failed: boolean }>({ identity: null, chats: null, failed: false });
  const copies = useCopyHolder();

  // Leaving Ask drops the saved copies this list is showing, the same as the phone's history sheet.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      // A new reloadKey means the open chat was saved, so this list loads again.
      void reloadKey;
      const key = `${userId}:${debateId ?? ''}`;
      let active = true;
      fetchChats(userId, debateId, copies.mark())
        .then((chats) => {
          if (active) setState({ identity: key, chats, failed: false });
        })
        .catch((cause: unknown) => {
          console.warn('Could not load chats:', cause instanceof Error ? cause.message : cause);
          // A reload that fails keeps the list it already shows for this debate.
          if (active) setState((previous) => ({ identity: key, chats: previous.identity === key ? previous.chats : null, failed: true }));
        });
      return () => {
        active = false;
        copies.release();
      };
    }, [userId, debateId, reloadKey, copies]),
  );

  const mine = state.identity === identity;
  return (
    <View style={[styles.pane, { width, borderRightColor: colors.line, backgroundColor: colors.background }]} testID="ask-chat-pane">
      <View style={[styles.paneTop, { paddingTop: insets.top + 6 }]}>
        <BouncePressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} onPress={onBack} style={styles.iconButton}>
          <Icon name="chevronLeft" color={colors.primary} size={28} />
        </BouncePressable>
        <BouncePressable accessibilityRole="button" accessibilityLabel={t('askChat.newChat')} hitSlop={8} onPress={onNewChat} style={styles.iconButton} testID="ask-new-chat">
          <Icon name="plus" color={colors.primary} size={26} />
        </BouncePressable>
      </View>
      <ChatList
        chats={mine ? state.chats : null}
        failed={mine && state.failed}
        openChatId={openChatId}
        onPick={onPick}
        highlightOpen
        contentContainerStyle={[styles.paneContent, { paddingBottom: insets.bottom + 24 }]}
        header={
          <Text accessibilityRole="header" weight="display" style={styles.paneTitle}>
            {t('nav.ask')}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 21 },
  listHeader: { gap: 14, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 14 },
  pane: { borderRightWidth: StyleSheet.hairlineWidth },
  paneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  paneContent: { paddingHorizontal: 18 },
  paneTitle: { fontSize: 32, lineHeight: 38, letterSpacing: -0.9 },
});
