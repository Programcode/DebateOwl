import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

/**
 * Export on the phone: expo-print renders the document's HTML to a PDF,
 * which is renamed to the website's file name and handed to the share sheet.
 */
export async function sharePdf(html: string, fileName: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

/** The share button: the document as plain text, through the iOS share sheet. */
export async function shareText(title: string, text: string): Promise<void> {
  await Share.share({ title, message: text });
}
