import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './text';

import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type Props = TextInputProps & { label: string; hint?: string; invalid?: boolean };

/** A labelled text field in an inset card, iOS form style. */
export const Field = forwardRef<TextInput, Props>(function Field({ label, hint, invalid, style, ...props }, ref) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text weight="medium" tone="secondary" style={styles.label}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.tabInactive}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: invalid ? colors.destructive : colors.border,
            color: colors.foreground,
          },
          style,
        ]}
      />
      {hint ? (
        <Text tone="faint" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { fontSize: 14, marginLeft: 4 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: 15,
    fontSize: 17,
    fontFamily: fontFamily.regular,
  },
  hint: { fontSize: 13, marginLeft: 4, lineHeight: 18 },
});
