import { forwardRef } from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PressScale as BouncePressable } from '@/components/press-scale';
import { scaledForPreview, Text } from './text';

import { useTheme } from '@/theme/use-theme';

/** The one Done bar every field shows above the keyboard; KeyboardDoneBar draws it. */
export const DONE_BAR_ID = 'debateowl-keyboard-done';

/**
 * Every text field in the app: a Done bar above the keyboard on iOS, so a
 * multi-line answer or a number pad can always be put away, and the web
 * preview's text size (font-scale.web.ts).
 */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  return (
    <TextInput
      ref={ref}
      inputAccessoryViewID={Platform.OS === 'ios' ? DONE_BAR_ID : undefined}
      {...props}
      style={scaledForPreview(style, props.maxFontSizeMultiplier)}
    />
  );
});

/** The Done bar above the keyboard, drawn once in the root layout. iOS only. */
export function KeyboardDoneBar() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={DONE_BAR_ID} backgroundColor={colors.card}>
      <View style={[styles.bar, { borderTopColor: colors.line }]}>
        <BouncePressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={8} style={styles.done}>
          <Text weight="semibold" style={[styles.doneText, { color: colors.primary }]} maxFontSizeMultiplier={1.5}>
            {t('mobile.common.done')}
          </Text>
        </BouncePressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  doneText: { fontSize: 17 },
});
