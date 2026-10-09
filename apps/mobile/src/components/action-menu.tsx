import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import type { IconName } from './icon-paths';

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
}

export interface ActionMenuProps {
  visible: boolean;
  title?: string;
  items: MenuItem[];
  cancelLabel: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Where the web preview draws it; iOS always uses the action sheet. */
  placement?: 'top' | 'bottom';
  testID?: string;
}

/** A native iOS action sheet, opened while `visible` is true. The web preview draws its own (action-menu.web.tsx). */
export function ActionMenu({ visible, title, items, cancelLabel, onSelect, onClose }: ActionMenuProps) {
  const latest = useRef({ items, onSelect, onClose });
  latest.current = { items, onSelect, onClose };
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const choose = (index: number | undefined) => {
      if (!live) return;
      const { items: current, onSelect: select, onClose: close } = latest.current;
      close();
      const item = index === undefined ? undefined : current[index];
      if (item) select(item.key);
    };
    const labels = latest.current.items.map((item) => item.label);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...labels, cancelLabel],
          cancelButtonIndex: labels.length,
          destructiveButtonIndex: latest.current.items.flatMap((item, index) => (item.destructive ? [index] : [])),
        },
        (index) => choose(index < labels.length ? index : undefined),
      );
    } else {
      Alert.alert(title ?? '', undefined, [
        ...labels.map((label, index) => ({ text: label, onPress: () => choose(index) })),
        { text: cancelLabel, style: 'cancel' as const, onPress: () => choose(undefined) },
      ], { cancelable: true, onDismiss: () => choose(undefined) });
    }
    return () => {
      live = false;
    };
    // Shown once per opening; the latest items and handlers are read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return null;
}
