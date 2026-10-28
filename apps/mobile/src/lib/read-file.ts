import { File } from 'expo-file-system';

/** A picked file's text, read from the copy the picker left in the app's cache. */
export function readPickedText(asset: { uri: string }): Promise<string> {
  return new File(asset.uri).text();
}
