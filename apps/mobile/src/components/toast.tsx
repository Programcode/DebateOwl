import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { Text } from './text';

import { haptics } from '@/lib/haptics';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export interface ToastOptions {
  title: string;
  message?: string;
  /** Success shows the mint check and taps; error shows the alert and warns. */
  tone?: 'success' | 'error' | 'info';
  /** One action, such as Undo. */
  action?: { label: string; onPress: () => void };
}

interface ShownToast extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {});

/** Shows a short message above the tab bar, as the website's toasts do. A newer toast replaces the one showing. */
export function useToast(): (toast: ToastOptions) => void {
  return useContext(ToastContext);
}

const DURATION_MS = 4000;
// Long enough to reach Undo.
const ACTION_DURATION_MS = 6500;
/** The tab bar's height above the safe area, so the toast clears it. */
const TAB_BAR = 56;

let ids = 0;

/**
 * The app's toasts. Form sheets are drawn above the root view, so a sheet
 * keeps its own inline messages and the toast shows once the sheet closes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: ToastOptions) => {
    if (next.tone === 'success') haptics.success();
    else if (next.tone === 'error') haptics.warning();
    AccessibilityInfo.announceForAccessibility([next.title, next.message].filter(Boolean).join('. '));
    setToast({ ...next, id: ++ids });
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), toast.action ? ACTION_DURATION_MS : DURATION_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onClose={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: ShownToast; onClose: () => void }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const face = scheme === 'dark' ? colors.card : colors.heading;
  const text = scheme === 'dark' ? colors.foreground : '#FFFFFF';
  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: insets.bottom + TAB_BAR }]}>
      <Animated.View
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(160)}
        accessibilityLiveRegion="polite"
        testID="toast"
        style={[styles.toast, { backgroundColor: face, borderColor: scheme === 'dark' ? colors.border : face }]}>
        {toast.tone === 'success' ? (
          <View style={[styles.badge, { backgroundColor: colors.successFill }]}>
            <Icon name="check" color="#FFFFFF" size={15} />
          </View>
        ) : toast.tone === 'error' ? (
          <Icon name="alert" color={scheme === 'dark' ? colors.destructive : '#FF9FA2'} size={20} />
        ) : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.text}>
          <Text weight="semibold" style={[styles.title, { color: text }]} numberOfLines={2}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text style={[styles.message, { color: text }]} numberOfLines={3}>
              {toast.message}
            </Text>
          ) : null}
        </Pressable>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              onClose();
              toast.action?.onPress();
            }}
            testID="toast-action"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text weight="display" style={[styles.actionLabel, { color: colors.accent }]}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 2,
    borderRadius: radius.field,
    paddingVertical: 11,
    paddingHorizontal: 14,
    boxShadow: '0 6px 20px rgba(11,42,110,0.22)',
  },
  badge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 15, lineHeight: 20 },
  message: { fontSize: 14, lineHeight: 19, opacity: 0.86 },
  action: { paddingHorizontal: 6, paddingVertical: 4 },
  actionLabel: { fontSize: 16 },
  pressed: { opacity: 0.6 },
});
