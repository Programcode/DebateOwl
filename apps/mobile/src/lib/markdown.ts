/**
 * A small Markdown reader for Ask answers. The website renders them with
 * react-markdown, which needs the DOM, so the app reads the subset the coach
 * writes: paragraphs, headings, lists, quotes, code, bold, italic, links and
 * numbered citation markers like [2]. Answers arrive token by token, so an
 * unfinished **bold** run renders bold until it closes.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'cite'; n: number };

export type Block =
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'heading'; level: number; inline: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'quote'; inline: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}```/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith('`')) {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const strong = rest.startsWith('**') ? '**' : rest.startsWith('__') ? '__' : null;
    if (strong) {
      const end = text.indexOf(strong, i + 2);
      flush();
      // Unclosed while streaming: bold to the end until the closing marker arrives.
      const inner = end === -1 ? text.slice(i + 2) : text.slice(i + 2, end);
      if (inner) out.push({ type: 'bold', children: parseInline(inner) });
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    const emphasis = rest[0] === '*' || (rest[0] === '_' && !/\w/.test(text[i - 1] ?? '')) ? rest[0] : null;
    if (emphasis && rest[1] && rest[1] !== ' ') {
      const end = text.indexOf(emphasis, i + 1);
      if (end > i + 1 && text[end - 1] !== ' ' && (emphasis === '*' || !/\w/.test(text[end + 1] ?? ''))) {
        flush();
        out.push({ type: 'italic', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ type: 'link', text: link[1], url: link[2] });
      i += link[0].length;
      continue;
    }
    const cite = /^\[(\d{1,2})\]/.exec(rest);
    if (cite) {
      flush();
      out.push({ type: 'cite', n: Number(cite[1]) });
      i += cite[0].length;
      continue;
    }
    buffer += text[i];
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  let quote: string[] = [];

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) });
    list = null;
  };
  const endQuote = () => {
    if (quote.length) blocks.push({ type: 'quote', inline: parseInline(quote.join(' ')) });
    quote = [];
  };
  const endAll = () => {
    endParagraph();
    endList();
    endQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (FENCE.test(line)) {
      endAll();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      endAll();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endAll();
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2].trim()) });
      continue;
    }
    if (RULE.test(line)) {
      endAll();
      blocks.push({ type: 'rule' });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      endParagraph();
      endQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        endList();
        list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push((bullet ? bullet[1] : ordered![2]).trim());
      continue;
    }
    const quoted = QUOTE.exec(line);
    if (quoted) {
      endParagraph();
      endList();
      quote.push(quoted[1].trim());
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      // An indented line continues the last list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    endList();
    endQuote();
    paragraph.push(line.trim());
  }
  endAll();
  return blocks;
}

function plainText(inline: Inline[]): string {
  return inline.map((node) =>
    node.type === 'text' || node.type === 'code' || node.type === 'link' ? node.text
      : node.type === 'bold' || node.type === 'italic' ? plainText(node.children)
        : '').join('');
}

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function hasCite(inline: Inline[], n: number): boolean {
  return inline.some((node) => (node.type === 'cite' && node.n === n) || ((node.type === 'bold' || node.type === 'italic') && hasCite(node.children, n)));
}

/**
 * Places citation n after the paragraph or list item that contains its claim,
 * when the answer quotes the claim. Claims the answer only paraphrases keep
 * their chip in the row under the answer.
 */
export function attachCitations(blocks: Block[], claims: string[]): Block[] {
  const next = blocks.map((block) => (block.type === 'list' ? { ...block, items: block.items.map((item) => [...item]) } : 'inline' in block ? { ...block, inline: [...block.inline] } : block));
  claims.forEach((claim, index) => {
    const n = index + 1;
    const key = normalize(claim).slice(0, 48);
    if (key.length < 16) return;
    for (const block of next) {
      const targets = block.type === 'list' ? block.items : 'inline' in block ? [block.inline] : [];
      const target = targets.find((inline) => normalize(plainText(inline)).includes(key));
      if (target) {
        if (!hasCite(target, n)) target.push({ type: 'cite', n });
        return;
      }
    }
  });
  return next;
}
