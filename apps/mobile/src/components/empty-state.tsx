import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Owl, type OwlPose } from './owl';
import { Text } from './text';

/** The website's EmptyState: the owl in the place's pose above a title, a line and an optional action. */
export function EmptyState({ pose, title, description, children }: { pose: OwlPose; title: string; description?: string; children?: ReactNode }) {
  return (
    <Card style={styles.card}>
      <Owl pose={pose} size={88} />
      <View style={styles.text}>
        <Text weight="bold" tone="heading" style={styles.title}>
          {title}
        </Text>
        {description ? (
          <Text tone="secondary" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: 22 },
  text: { alignItems: 'center', gap: 4 },
  title: { fontSize: 17, lineHeight: 22, textAlign: 'center' },
  description: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 420 },
});
