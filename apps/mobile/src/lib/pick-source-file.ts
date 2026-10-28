import * as DocumentPicker from 'expo-document-picker';

import { SOURCE_FILE_PICKER_TYPES } from './source-file';

/** Opens the Files picker for one Library file. Null when the student cancels. */
export async function pickSourceFile(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: SOURCE_FILE_PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
  return result.canceled ? null : result.assets[0] ?? null;
}
