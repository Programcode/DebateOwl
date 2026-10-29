import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import { Image } from 'react-native';

/**
 * Ollie for the widget extension. The extension cannot read the app's
 * bundle, so each owl pose it shows (the Current Debate widget's mark, the
 * generating Live Activity's poses) is copied into the App Group folder once
 * and drawn from there with `uiImage`. Without the folder (Expo Go, a build
 * without DEBATELAB_APP_GROUP) every pose is null and the layouts show a symbol.
 */

type WidgetsModule = { widgetsDirectory?: string | null };

const POSES = {
  mark: require('@/assets/owl/mark.png'),
  thinking: require('@/assets/owl/thinking.png'),
  reading: require('@/assets/owl/reading.png'),
  skeptical: require('@/assets/owl/skeptical.png'),
  point: require('@/assets/owl/point.png'),
  celebrating: require('@/assets/owl/celebrating.png'),
  surprised: require('@/assets/owl/surprised.png'),
} as const;

export type WidgetOwlPose = keyof typeof POSES;

const copies = new Map<WidgetOwlPose, Promise<string | null>>();

/** The pose's file URI in the App Group folder, copied there on first use; null when there is no folder or the copy fails. */
export function widgetOwl(pose: WidgetOwlPose): Promise<string | null> {
  let copy = copies.get(pose);
  if (!copy) {
    copy = copyPose(pose);
    copies.set(pose, copy);
  }
  return copy;
}

/** Every pose the layouts may switch between, so a Live Activity never waits on a copy mid-run. */
export async function widgetOwls<P extends WidgetOwlPose>(poses: readonly P[]): Promise<Record<P, string | null>> {
  const uris = await Promise.all(poses.map((pose) => widgetOwl(pose)));
  return Object.fromEntries(poses.map((pose, index) => [pose, uris[index]])) as Record<P, string | null>;
}

async function copyPose(pose: WidgetOwlPose): Promise<string | null> {
  try {
    const directory = requireOptionalNativeModule<WidgetsModule>('ExpoWidgets')?.widgetsDirectory;
    if (!directory) return null;
    // The mark keeps the name the Current Debate widget has always used.
    const target = new File(directory, pose === 'mark' ? 'owl-mark.png' : `owl-${pose}.png`);
    if (target.exists) return target.uri;
    const source = Image.resolveAssetSource(POSES[pose])?.uri;
    if (!source) return null;
    // A development build serves assets from Metro; a release build has them on disk.
    if (/^https?:/i.test(source)) {
      await File.downloadFileAsync(source, target, { idempotent: true });
    } else {
      new File(source).copy(target);
    }
    return target.uri;
  } catch (cause) {
    // Forget the failure, so the next caller tries again.
    copies.delete(pose);
    console.warn(`Could not give the widgets the ${pose} owl:`, cause instanceof Error ? cause.message : cause);
    return null;
  }
}
