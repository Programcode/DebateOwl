import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

/** A picked file's bytes as base64, read from the copy the picker left in the app's cache. */
export function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).base64();
}
