import type { DocumentPickerAsset } from 'expo-document-picker';

/** The web preview's picker hands back a browser File; its bytes as base64. */
export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  if (!asset.file) throw new Error('The picked file has no contents');
  const bytes = new Uint8Array(await asset.file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
