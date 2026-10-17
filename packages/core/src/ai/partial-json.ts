// Reads the JSON a model has written so far. Streaming providers send a
// structured answer one token at a time, so the text is almost always cut in
// the middle of a string, number, or keyword. This parser returns the value
// that prefix describes: complete fields as they are, the field being
// written with its text so far, and nothing invented. It never throws.

type Parsed = { value: unknown; complete: boolean };

const INCOMPLETE = Symbol('incomplete');

class Reader {
  index = 0;
  constructor(readonly text: string) {}

  skipSpace(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index])) this.index++;
  }

  get done(): boolean {
    return this.index >= this.text.length;
  }

  peek(): string {
    return this.text[this.index];
  }
}

function parseString(reader: Reader): Parsed {
  // Caller has seen the opening quote.
  reader.index++;
  let out = '';
  while (!reader.done) {
    const char = reader.text[reader.index];
    if (char === '"') {
      reader.index++;
      return { value: out, complete: true };
    }
    if (char !== '\\') {
      out += char;
      reader.index++;
      continue;
    }
    const escape = reader.text[reader.index + 1];
    if (escape === undefined) break;
    if (escape === 'u') {
      const hex = reader.text.slice(reader.index + 2, reader.index + 6);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break;
      out += String.fromCharCode(parseInt(hex, 16));
      reader.index += 6;
      continue;
    }
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    out += simple[escape] ?? escape;
    reader.index += 2;
  }
  reader.index = reader.text.length;
  // A lone high surrogate waiting for its pair would render as garbage.
  if (/[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1);
  return { value: out, complete: false };
}

function parseNumber(reader: Reader): Parsed | typeof INCOMPLETE {
  const match = /^-?(?:\d+)?(?:\.\d*)?(?:[eE][+-]?\d*)?/.exec(reader.text.slice(reader.index));
  const raw = match?.[0] ?? '';
  reader.index += raw.length;
  const atEnd = reader.done;
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || !/\d$/.test(raw)) return INCOMPLETE;
  // A number at the very end may still be growing ("12" of "125").
  return { value, complete: !atEnd };
}

function parseLiteral(reader: Reader): Parsed | typeof INCOMPLETE {
  for (const [word, value] of [['true', true], ['false', false], ['null', null]] as const) {
    const rest = reader.text.slice(reader.index, reader.index + word.length);
    if (rest === word) {
      reader.index += word.length;
      return { value, complete: true };
    }
    if (word.startsWith(rest) && reader.index + rest.length >= reader.text.length) {
      reader.index = reader.text.length;
      return INCOMPLETE;
    }
  }
  return INCOMPLETE;
}

function parseValue(reader: Reader): Parsed | typeof INCOMPLETE {
  reader.skipSpace();
  if (reader.done) return INCOMPLETE;
  const char = reader.peek();
  if (char === '{') return parseObject(reader);
  if (char === '[') return parseArray(reader);
  if (char === '"') return parseString(reader);
  if (char === '-' || (char >= '0' && char <= '9')) return parseNumber(reader);
  return parseLiteral(reader);
}

function parseObject(reader: Reader): Parsed {
  reader.index++;
  const out: Record<string, unknown> = {};
  while (true) {
    reader.skipSpace();
    if (reader.done) return { value: out, complete: false };
    const char = reader.peek();
    if (char === '}') {
      reader.index++;
      return { value: out, complete: true };
    }
    if (char === ',') {
      reader.index++;
      continue;
    }
    if (char !== '"') return { value: out, complete: false };
    const key = parseString(reader);
    // A key still being written has no value yet.
    if (!key.complete) return { value: out, complete: false };
    reader.skipSpace();
    if (reader.done || reader.peek() !== ':') return { value: out, complete: false };
    reader.index++;
    const value = parseValue(reader);
    if (value === INCOMPLETE) return { value: out, complete: false };
    out[key.value as string] = value.value;
    if (!value.complete) return { value: out, complete: false };
  }
}

function parseArray(reader: Reader): Parsed {
  reader.index++;
  const out: unknown[] = [];
  while (true) {
    reader.skipSpace();
    if (reader.done) return { value: out, complete: false };
    const char = reader.peek();
    if (char === ']') {
      reader.index++;
      return { value: out, complete: true };
    }
    if (char === ',') {
      reader.index++;
      continue;
    }
    const value = parseValue(reader);
    if (value === INCOMPLETE) return { value: out, complete: false };
    out.push(value.value);
    if (!value.complete) return { value: out, complete: false };
  }
}

/**
 * The object a streamed JSON answer describes so far, or undefined before
 * its opening brace. Text before the brace (a ```json fence or a stray
 * sentence) is skipped, as the server's own parser skips it.
 */
export function parsePartialJson(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  const reader = new Reader(text);
  reader.index = start;
  return parseObject(reader).value as Record<string, unknown>;
}
