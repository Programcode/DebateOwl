/** Bound native Text layout work, including imported documents with no paragraph breaks. */
export function sourceParagraphs(text: string): string[] {
  if (text.length === 0) return [text];
  const parts: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 4000, text.length);
    const paragraph = text.indexOf('\n\n', start);
    if (paragraph >= start && paragraph + 2 <= end) end = paragraph + 2;
    else if (end < text.length) {
      const space = text.lastIndexOf(' ', end - 1);
      if (space > start + 2000) end = space + 1;
      // Do not split a surrogate pair between native text views.
      if (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end -= 1;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}
