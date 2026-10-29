import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { PressScale as BouncePressable } from '@/components/press-scale';
import type { ActionMenuProps } from './action-menu';
import { Icon } from './icon';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

/** react-native-web has no action sheet, so the web preview draws a menu like the Library's. */
export function ActionMenu({ visible, title, items, cancelLabel, onSelect, onClose, placement = 'bottom', testID }: ActionMenuProps) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Modal transparent visible onRequestClose={onClose}>
      <Pressable accessibilityLabel={cancelLabel} onPress={onClose} style={[styles.backdrop, placement === 'top' ? styles.top : styles.bottom]}>
        <View accessibilityRole="menu" testID={testID} style={[styles.menu, placement === 'top' ? styles.menuTop : styles.menuBottom, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {title ? (
            <Text tone="faint" style={styles.title} maxFontSizeMultiplier={1.6}>
              {title}
            </Text>
          ) : null}
          {items.map((item, index) => (
            <BouncePressable
              key={item.key}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: Boolean(item.disabled) }}
              disabled={item.disabled}
              onPress={() => {
                onClose();
                onSelect(item.key);
              }}
              style={({ pressed }) => [styles.item, (index > 0 || title) && { borderTopWidth: 1, borderTopColor: colors.line }, pressed && { backgroundColor: colors.line }]}>
              <Text style={[styles.label, item.destructive && { color: colors.destructive }, item.disabled && { color: colors.tabInactive }]} maxFontSizeMultiplier={1.6}>{item.label}</Text>
              {item.icon ? <Icon name={item.icon} color={item.destructive ? colors.destructive : colors.foreground} size={21} /> : null}
            </BouncePressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,42,110,0.18)', paddingHorizontal: 14 },
  top: { alignItems: 'flex-end', paddingTop: 58 },
  bottom: { justifyContent: 'flex-end', paddingBottom: 28 },
  menu: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', boxShadow: '0 14px 40px -10px rgba(11,42,110,0.4)' },
  menuTop: { width: 268 },
  menuBottom: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 13.5, textAlign: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, minHeight: 52, gap: 12 },
  label: { fontSize: 17, flexShrink: 1 },
});
