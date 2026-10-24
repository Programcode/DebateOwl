// GET a URL over a connection to an address the caller has already checked.
//
// fetch() resolves the hostname again when it connects, so a name that answers
// with a public address for validateResolvedPublicHost and a private one a
// moment later (DNS rebinding) would reach the private address. Here the
// socket goes to the checked address itself; TLS still verifies the
// certificate for the hostname, and Host carries the hostname.
//
// This is a deliberately small HTTP/1.1 client for one GET per connection
// (Connection: close): Content-Length, chunked and close-delimited bodies,
// gzip and deflate, and 1xx interim responses skipped. Anything else is
// refused rather than guessed at.

import { untilAborted } from "../_shared/bounded-body.ts";

const MAX_HEAD_BYTES = 32 * 1024;
const READ_CHUNK_BYTES = 16 * 1024;
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export type Dial = (address: string, url: URL) => Promise<Deno.Conn>;

/** TCP to `address`; for https, TLS with SNI and certificate checks for the URL's hostname. */
export const dialAddress: Dial = async (address, url) => {
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const tcp = await Deno.connect({ hostname: address, port });
  if (url.protocol !== "https:") return tcp;
  try {
    // Without ALPN a server may pick HTTP/2, which this client does not speak.
    const tls = await Deno.startTls(tcp, { hostname: url.hostname, alpnProtocols: ["http/1.1"] });
    // startTls defers the handshake; finish it here so a certificate that is
    // not valid for the hostname fails the dial.
    await tls.handshake();
    return tls;
  } catch (error) {
    closeQuietly(tcp);
    throw error;
  }
};

function closeQuietly(conn: Deno.Conn) {
  try {
    conn.close();
  } catch {
    // Already closed.
  }
}

class SourceProtocolError extends Error {
  constructor() {
    super("The source sent a response that could not be read.");
  }
}

// Buffers reads from the connection so the head can be parsed line by line.
class ConnReader {
  private buffered = new Uint8Array(0);

  constructor(private readonly conn: Deno.Conn) {}

  private async fill(): Promise<boolean> {
    const chunk = new Uint8Array(READ_CHUNK_BYTES);
    const n = await this.conn.read(chunk);
    if (n === null) return false;
    const next = new Uint8Array(this.buffered.length + n);
    next.set(this.buffered);
    next.set(chunk.subarray(0, n), this.buffered.length);
    this.buffered = next;
    return true;
  }

  /** One CRLF- or LF-terminated line, without the terminator. */
  async line(maxBytes: number): Promise<string> {
    while (true) {
      const end = this.buffered.indexOf(0x0a);
      if (end !== -1) {
        if (end > maxBytes) throw new SourceProtocolError();
        const raw = this.buffered.subarray(0, end);
        this.buffered = this.buffered.subarray(end + 1);
        // One character per byte, so a header value stays a valid ByteString.
        // (TextDecoder's "latin1" is windows-1252 and maps some bytes past U+00FF.)
        let text = "";
        for (const byte of raw) text += String.fromCharCode(byte);
        return text.endsWith("\r") ? text.slice(0, -1) : text;
      }
      if (this.buffered.length > maxBytes) throw new SourceProtocolError();
      if (!(await this.fill())) throw new SourceProtocolError();
    }
  }

  /** Up to `max` bytes, or null at end of stream. */
  async some(max = Infinity): Promise<Uint8Array | null> {
    if (this.buffered.length === 0 && !(await this.fill())) return null;
    const take = Math.min(this.buffered.length, max);
    const out = this.buffered.slice(0, take);
    this.buffered = this.buffered.subarray(take);
    return out;
  }
}

type Head = { status: number; headers: Headers };

async function readHead(reader: ConnReader): Promise<Head> {
  let budget = MAX_HEAD_BYTES;
  const take = async () => {
    const line = await reader.line(budget);
    budget -= line.length + 2;
    if (budget < 0) throw new SourceProtocolError();
    return line;
  };
  const statusMatch = /^HTTP\/1\.[01] ([1-5]\d\d)(?: .*)?$/.exec(await take());
  if (!statusMatch) throw new SourceProtocolError();
  const headers = new Headers();
  while (true) {
    const line = await take();
    if (line === "") break;
    // Obsolete line folding and malformed names are refused, not repaired.
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!match) throw new SourceProtocolError();
    try {
      headers.append(match[1], match[2]);
    } catch {
      throw new SourceProtocolError();
    }
  }
  return { status: Number(statusMatch[1]), headers };
}

function contentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (value === null) return null;
  const values = value.split(",").map((part) => part.trim());
  if (!values.every((part) => /^\d+$/.test(part) && part === values[0])) throw new SourceProtocolError();
  return Number(values[0]);
}

async function* chunkedBody(reader: ConnReader): AsyncGenerator<Uint8Array> {
  while (true) {
    const sizeMatch = /^([0-9A-Fa-f]{1,8})(?:[ \t]*;.*)?$/.exec(await reader.line(1024));
    if (!sizeMatch) throw new SourceProtocolError();
    let remaining = parseInt(sizeMatch[1], 16);
    if (remaining === 0) {
      // Trailer fields are read and dropped.
      let budget = MAX_HEAD_BYTES;
      while (true) {
        const line = await reader.line(budget);
        if (line === "") return;
        budget -= line.length + 2;
      }
    }
    while (remaining > 0) {
      const piece = await reader.some(remaining);
      if (!piece) throw new SourceProtocolError();
      remaining -= piece.length;
      yield piece;
    }
    if ((await reader.line(2)) !== "") throw new SourceProtocolError();
  }
}

async function* lengthBody(reader: ConnReader, length: number): AsyncGenerator<Uint8Array> {
  let remaining = length;
  while (remaining > 0) {
    const piece = await reader.some(remaining);
    if (!piece) throw new SourceProtocolError();
    remaining -= piece.length;
    yield piece;
  }
}

async function* untilClose(reader: ConnReader): AsyncGenerator<Uint8Array> {
  while (true) {
    const piece = await reader.some();
    if (!piece) return;
    yield piece;
  }
}

function bodyStream(reader: ConnReader, head: Head, onDone: () => void): ReadableStream<Uint8Array> {
  const transferEncoding = head.headers.get("transfer-encoding")?.trim().toLowerCase();
  let pieces: AsyncGenerator<Uint8Array>;
  if (transferEncoding !== undefined) {
    if (transferEncoding !== "chunked") throw new SourceProtocolError();
    pieces = chunkedBody(reader);
  } else {
    const length = contentLength(head.headers);
    pieces = length === null ? untilClose(reader) : lengthBody(reader, length);
  }

  let stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await pieces.next();
        if (done) {
          controller.close();
          onDone();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        onDone();
        // Socket errors carry OS detail; the import shows this message to the user.
        controller.error(error instanceof SourceProtocolError ? error : new SourceProtocolError());
      }
    },
    cancel() {
      onDone();
    },
  });

  const encoding = head.headers.get("content-encoding")?.trim().toLowerCase();
  const decompress = (format: CompressionFormat) =>
    new DecompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  if (encoding === "gzip" || encoding === "x-gzip") {
    stream = stream.pipeThrough(decompress("gzip"));
  } else if (encoding === "deflate") {
    stream = stream.pipeThrough(decompress("deflate"));
  } else if (encoding !== undefined && encoding !== "identity") {
    throw new SourceProtocolError();
  }
  if (encoding !== undefined) {
    // The lengths described the encoded bytes, not what the stream now yields.
    head.headers.delete("content-encoding");
    head.headers.delete("content-length");
  }
  head.headers.delete("transfer-encoding");
  return stream;
}

async function connectFirst(addresses: string[], url: URL, signal: AbortSignal, dial: Dial): Promise<Deno.Conn> {
  for (const address of addresses) {
    if (signal.aborted) break;
    const attempt = dial(address, url);
    try {
      return await untilAborted(attempt, signal);
    } catch {
      // A connection that opens after the deadline is closed, not leaked.
      attempt.then(closeQuietly, () => undefined);
    }
  }
  if (signal.aborted) throw signal.reason;
  throw new Error("Could not connect to the source.");
}

/**
 * GET `url` from the first of `addresses` that accepts a connection. Every
 * address must already have passed the private-range checks; the hostname is
 * never resolved here.
 */
export async function pinnedGet(
  url: URL,
  addresses: string[],
  headers: Record<string, string>,
  signal: AbortSignal,
  dial: Dial = dialAddress,
): Promise<Response> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs can be imported.");
  const conn = await connectFirst(addresses, url, signal, dial);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    closeQuietly(conn);
  };
  signal.addEventListener("abort", close, { once: true });

  try {
    // pathname and search come out of the URL parser percent-encoded, so they
    // cannot carry CR, LF or spaces into the request line.
    const lines = [`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`];
    for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
    lines.push("Accept-Encoding: gzip, deflate", "Connection: close", "", "");
    const request = new TextEncoder().encode(lines.join("\r\n"));
    for (let written = 0; written < request.length;) {
      written += await untilAborted(conn.write(request.subarray(written)), signal);
    }

    const reader = new ConnReader(conn);
    let head = await untilAborted(readHead(reader), signal);
    while (head.status < 200) head = await untilAborted(readHead(reader), signal);

    if (NULL_BODY_STATUSES.has(head.status)) {
      close();
      return new Response(null, { status: head.status, headers: head.headers });
    }
    const body = bodyStream(reader, head, close);
    return new Response(body, { status: head.status, headers: head.headers });
  } catch (error) {
    close();
    if (signal.aborted || error instanceof SourceProtocolError) throw error;
    throw new Error("Could not connect to the source.");
  }
}
