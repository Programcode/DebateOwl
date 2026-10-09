import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from './icon';

import { radius } from '@/theme/colors';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

/** The mocks' grey search field. */
export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (text: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.segmentTrack }]}>
      <Icon name="search" color={colors.faint} size={19} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.input, { color: colors.foreground }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.field, paddingHorizontal: 13, minHeight: 46 },
  input: { flex: 1, fontSize: 16.5, fontFamily: fontFamily.regular, paddingVertical: 10 },
});
