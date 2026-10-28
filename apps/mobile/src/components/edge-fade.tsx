import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const FADE_WIDTH = 36;

/**
 * A sideways-scrolling row that fades out at its trailing edge while it
 * continues off screen, so it reads as scrollable rather than cut off. When
 * everything fits there is no fade. `color` is the surface behind the row.
 */
export function FadingScrollRow({
  color,
  id,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  children,
}: {
  color: string;
  /** Unique on the screen: the fade's SVG gradient id. */
  id: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'handled' | 'always' | 'never';
  children: ReactNode;
}) {
  const [frame, setFrame] = useState(0);
  const [content, setContent] = useState(0);
  const overflows = content > frame + 1;
  return (
    <View style={style} onLayout={(event) => setFrame(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={contentContainerStyle}
        onContentSizeChange={(width) => setContent(width)}>
        {children}
      </ScrollView>
      {overflows ? (
        <View pointerEvents="none" style={styles.fade}>
          <Svg width={FADE_WIDTH} height="100%">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={color} stopOpacity={0} />
                <Stop offset="1" stopColor={color} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width={FADE_WIDTH} height="100%" fill={`url(#${id})`} />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE_WIDTH },
});
