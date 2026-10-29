import * as Clipboard from 'expo-clipboard';

/**
 * The web preview cannot make a PDF: expo-print's printToFileAsync does not
 * exist there. It keeps the HTML it would print and the text it copied on
 * window, so the screenshot script can show and check them.
 */
type ExportProbe = { __debatelabExport?: { html?: string; fileName?: string; copied?: string; shared?: string; sharedUrl?: string; json?: string } };

function probe() {
  const target = window as unknown as ExportProbe;
  target.__debatelabExport ??= {};
  return target.__debatelabExport;
}

export function sharePdf(html: string, fileName: string): Promise<void> {
  Object.assign(probe(), { html, fileName });
  return Promise.resolve();
}

export function shareJson(json: string, fileName: string): Promise<void> {
  Object.assign(probe(), { json, fileName });
  return Promise.resolve();
}

export async function copyText(text: string): Promise<void> {
  probe().copied = text;
  await Clipboard.setStringAsync(text).catch((): undefined => undefined);
}

export function shareText(_title: string, text: string): Promise<void> {
  probe().shared = text;
  return Promise.resolve();
}

export function shareUrl(_title: string, url: string): Promise<void> {
  probe().sharedUrl = url;
  return Promise.resolve();
}
