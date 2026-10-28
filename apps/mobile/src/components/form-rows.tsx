import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ActionMenu } from './action-menu';
import { Icon } from './icon';
import { Text } from './text';

import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** An inset group of rows, iOS Settings style. */
export function FormGroup({ label, children, footer }: { label?: string; children: ReactNode; footer?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {label ? (
        <Text weight="medium" tone="secondary" style={styles.groupLabel}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
      {footer ? (
        <Text tone="faint" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

function RowFrame({ first, children }: { first?: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>{children}</View>;
}

/** A row that shows the chosen option and opens the native picker sheet. */
export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  first,
  disabled,
  testID,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  first?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value)?.label ?? value;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
        style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}>
        <RowFrame first={first}>
          <Text style={styles.rowLabel}>
            {label}
          </Text>
          {/* A long choice (Hungarian, Spanish) wraps onto a second line rather than being cut off. */}
          <Text tone="secondary" style={styles.rowValue} numberOfLines={2}>
            {chosen}
          </Text>
          <Icon name="chevronDown" color={colors.tabInactive} size={18} />
        </RowFrame>
      </Pressable>
      <ActionMenu
        visible={open}
        title={label}
        items={options.map((option) => ({ key: option.value, label: option.label, icon: option.value === value ? 'check' : undefined, disabled: option.disabled }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setOpen(false)}
        onSelect={(key) => onChange(key as T)}
      />
    </>
  );
}

/** A labelled switch with an optional line of explanation. */
export function SwitchRow({ label, description, value, onChange, first, disabled }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void; first?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <RowFrame first={first}>
      <View style={styles.switchText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? (
          <Text tone="faint" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primaryFill, false: colors.segmentTrack }}
        thumbColor="#FFFFFF"
      />
    </RowFrame>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  groupLabel: { fontSize: 14, marginLeft: 4 },
  groupCard: { borderWidth: 2, borderRadius: radius.field, overflow: 'hidden' },
  footer: { fontSize: 13, lineHeight: 18, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, minHeight: 50, paddingVertical: 8 },
  rowLabel: { fontSize: 16.5, flexShrink: 1 },
  rowValue: { flex: 1, fontSize: 16, textAlign: 'right' },
  switchText: { flex: 1, gap: 2 },
  description: { fontSize: 13.5, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
