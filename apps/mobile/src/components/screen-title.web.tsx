import { StyleSheet } from 'react-native';

import { Text } from './text';

/** The web preview has no native header, so the large title is drawn in the content. */
export function ScreenTitle({ title }: { title: string }) {
  return (
    <Text accessibilityRole="header" weight="display" style={styles.title}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, letterSpacing: -0.5, lineHeight: 41, marginTop: 8, marginBottom: 8 },
});
