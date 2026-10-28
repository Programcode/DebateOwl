// Text files attached to an Ask question, read on the device and sent as
// part of the message, as the website's AskPage does. Shared by the website
// and the iOS app.

/** File types whose text is read and sent; any other attached file is named but skipped. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'yaml', 'yml', 'xml',
  'html', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
  'c', 'cpp', 'h', 'hpp',
]);

export function isAskTextFile(file: { name: string; type?: string | null }): boolean {
  if (file.type?.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? TEXT_EXTENSIONS.has(ext) : false;
}

/** An attached file as the message describes it: its text, or why it has none. */
export type AskFileContent =
  | { name: string; text: string }
  | { name: string; skipped: string }
  | { name: string; unreadable: true };

function fileBlock(file: AskFileContent): string {
  if ('text' in file) return `FILE: ${file.name}\nCONTENT:\n${file.text}\n\n`;
  if ('skipped' in file) return `FILE: ${file.name} - binary skipped (type: ${file.skipped || 'unknown'})\n`;
  return `[Error reading ${file.name}]\n`;
}

/** The message the model receives: the files' text, then the question. */
export function askMessageWithFiles(message: string, files: AskFileContent[]): string {
  if (files.length === 0) return message;
  return `CONTEXT:\n${files.map(fileBlock).join('\n')}\n\nQUESTION: ${message}`;
}

/** The question as the chat shows and saves it: the files are named, their text is not kept. */
export function askDisplayContent(message: string, fileNames: string[]): string {
  return fileNames.length > 0 ? `${message}\n\n[Attachments: ${fileNames.join(', ')}]` : message;
}
