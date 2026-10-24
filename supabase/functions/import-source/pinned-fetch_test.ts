import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { dialAddress, pinnedGet } from "./pinned-fetch.ts";

const encoder = new TextEncoder();
const HEADERS = { "User-Agent": "DebateLabSourceImporter/1.0" };

// A one-connection HTTP server on 127.0.0.1 that answers with raw bytes, and
// records the request head it received.
async function rawServer(answer: (Uint8Array | string)[] | "never") {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  let requestHead = "";
  const served = (async () => {
    const conn = await listener.accept();
    try {
      const buf = new Uint8Array(8192);
      while (!requestHead.includes("\r\n\r\n")) {
        const n = await conn.read(buf);
        if (n === null) break;
        requestHead += new TextDecoder().decode(buf.subarray(0, n));
      }
      if (answer === "never") {
        await conn.read(buf).catch(() => null);
        return;
      }
      for (const part of answer) await conn.write(typeof part === "string" ? encoder.encode(part) : part);
    } finally {
      try {
        conn.close();
      } catch {
        // The client closed it first.
      }
      listener.close();
    }
  })();
  return { port, served, requestHead: () => requestHead };
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

Deno.test("pinnedGet connects to the given address and never resolves the hostname", async () => {
  const originalResolveDns = Deno.resolveDns;
  (Deno as unknown as { resolveDns: unknown }).resolveDns = () => {
    throw new Error("pinnedGet resolved the hostname");
  };
  const server = await rawServer(["HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 11\r\n\r\nhello world"]);
  try {
    // rebind.invalid cannot resolve, so the connection can only have used the address.
    const url = new URL(`http://rebind.invalid:${server.port}/article?id=1`);
    const response = await pinnedGet(url, ["127.0.0.1"], HEADERS, new AbortController().signal);
    assertEquals([response.status, await response.text()], [200, "hello world"]);
    await server.served;
    const [requestLine, ...headerLines] = server.requestHead().split("\r\n");
    assertEquals(requestLine, "GET /article?id=1 HTTP/1.1");
    assertEquals(headerLines.includes(`Host: rebind.invalid:${server.port}`), true);
  } finally {
    (Deno as unknown as { resolveDns: unknown }).resolveDns = originalResolveDns;
  }
});

Deno.test("pinnedGet skips 1xx answers and decodes a chunked, gzipped body", async () => {
  const page = "<p>" + "Pinned connections keep DNS from changing under the import. ".repeat(20) + "</p>";
  const compressed = await gzip(page);
  const half = Math.floor(compressed.length / 2);
  const server = await rawServer([
    "HTTP/1.1 103 Early Hints\r\nLink: </style.css>; rel=preload\r\n\r\n",
    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\n\r\n",
    `${half.toString(16)};ext=1\r\n`, compressed.subarray(0, half), "\r\n",
    `${(compressed.length - half).toString(16)}\r\n`, compressed.subarray(half), "\r\n",
    "0\r\nX-Trailer: dropped\r\n\r\n",
  ]);
  const response = await pinnedGet(new URL(`http://source.invalid:${server.port}/`), ["127.0.0.1"], HEADERS, new AbortController().signal);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-encoding"), null);
  assertEquals(response.headers.get("content-type"), "text/html");
  assertEquals(await response.text(), page);
  await server.served;
});

Deno.test("pinnedGet reads a body that ends when the server closes", async () => {
  const server = await rawServer(["HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\n", "first part, ", "second part"]);
  const response = await pinnedGet(new URL(`http://source.invalid:${server.port}/`), ["127.0.0.1"], HEADERS, new AbortController().signal);
  assertEquals(await response.text(), "first part, second part");
  await server.served;
});

Deno.test("pinnedGet refuses responses it cannot read safely", async () => {
  for (const answer of [
    ["HTTP/1.1 200 OK\r\nX-Big: " + "a".repeat(40_000) + "\r\n\r\n"],
    ["HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n"],
    ["HTTP/1.1 200 OK\r\nContent-Length: 5, 6\r\n\r\nhello"],
    ["HTTP/1.1 200 OK\r\nX-Folded: one\r\n two\r\n\r\n"],
    ["SSH-2.0-OpenSSH_9.6\r\n\r\n"],
  ]) {
    const server = await rawServer(answer);
    await assertRejects(async () => {
      const response = await pinnedGet(new URL(`http://source.invalid:${server.port}/`), ["127.0.0.1"], HEADERS, new AbortController().signal);
      await response.text();
    }, Error, "could not be read");
    await server.served;
  }
});

Deno.test("pinnedGet tries the next checked address when one refuses", async () => {
  const server = await rawServer(["HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"]);
  const dialed: string[] = [];
  const response = await pinnedGet(
    new URL(`http://source.invalid:${server.port}/`),
    ["192.0.2.1", "127.0.0.1"],
    HEADERS,
    new AbortController().signal,
    (address, url, signal) => {
      dialed.push(address);
      return address === "127.0.0.1" ? dialAddress(address, url, signal) : Promise.reject(new Error("refused"));
    },
  );
  assertEquals([dialed, await response.text()], [["192.0.2.1", "127.0.0.1"], "ok"]);
  await server.served;
});

Deno.test("pinnedGet stops and closes the connection when the deadline aborts", async () => {
  const server = await rawServer("never");
  const deadline = new AbortController();
  const pending = pinnedGet(new URL(`http://source.invalid:${server.port}/`), ["127.0.0.1"], HEADERS, deadline.signal);
  setTimeout(() => deadline.abort(new Error("deadline")), 50);
  await assertRejects(() => pending, Error, "deadline");
  // The server's pending read ends only because the client closed the socket.
  await server.served;
});

Deno.test("pinnedGet moves on from an address that never answers before the deadline runs out", async () => {
  const server = await rawServer(["HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"]);
  let stalledSignal: AbortSignal | undefined;
  const response = await pinnedGet(
    new URL(`http://source.invalid:${server.port}/`),
    ["192.0.2.1", "127.0.0.1"],
    HEADERS,
    AbortSignal.timeout(5_000),
    (address, url, signal) => {
      if (address === "127.0.0.1") return dialAddress(address, url, signal);
      stalledSignal = signal;
      return new Promise<Deno.Conn>(() => {});
    },
    100,
  );
  assertEquals(await response.text(), "ok");
  assertEquals(stalledSignal?.aborted, true);
  await server.served;
});

Deno.test("pinnedGet closes a TLS connection whose handshake stalls when the deadline aborts", async () => {
  // Deno keeps the TCP socket of a cancelled handshake open until the process
  // exits, so a server cannot observe this; check that close() is called.
  const server = await rawServer("never");
  const originalStartTls = Deno.startTls;
  let tlsClosed = false;
  (Deno as unknown as { startTls: unknown }).startTls = (tcp: Deno.TcpConn) => Promise.resolve({
    handshake: () => new Promise(() => {}),
    close: () => {
      tlsClosed = true;
      tcp.close();
    },
  });
  try {
    const deadline = new AbortController();
    const pending = pinnedGet(new URL(`https://source.invalid:${server.port}/`), ["127.0.0.1"], HEADERS, deadline.signal);
    setTimeout(() => deadline.abort(new Error("deadline")), 50);
    await assertRejects(() => pending, Error, "deadline");
    assertEquals(tlsClosed, true);
    await server.served;
  } finally {
    (Deno as unknown as { startTls: unknown }).startTls = originalStartTls;
  }
});
