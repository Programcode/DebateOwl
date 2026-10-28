import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { readAsStringAsync } from 'expo-file-system/legacy';

/** A picked file's size in bytes: the picker's, or the file's own when the picker gave none. */
export function pickedFileSize(asset: DocumentPickerAsset): number {
  return asset.size && asset.size > 0 ? asset.size : new File(asset.uri).size;
}

/** `length` bytes of a picked file from `start`, as base64, read natively from the copy the picker left in the app's cache. */
export function readPickedChunk(asset: DocumentPickerAsset, start: number, length: number): Promise<string> {
  return readAsStringAsync(asset.uri, { encoding: 'base64', position: start, length });
}
