import type { DocumentPickerAsset } from 'expo-document-picker';

/** The web preview's picker hands back a browser File. */
export function pickedFileSize(asset: DocumentPickerAsset): number {
  return asset.file?.size ?? asset.size ?? 0;
}

/** `length` bytes of the picked File from `start`, as base64. */
export async function readPickedChunk(asset: DocumentPickerAsset, start: number, length: number): Promise<string> {
  if (!asset.file) throw new Error('The picked file has no contents');
  const bytes = new Uint8Array(await asset.file.slice(start, start + length).arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
