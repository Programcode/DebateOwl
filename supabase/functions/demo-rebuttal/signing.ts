// The demo's signed values, all keyed with the same server secret:
// - the session token a first turn returns, which a follow-up sends back;
// - a signature on every turn the model answered, which a publish sends back,
//   so a published page can only hold text this function moderated and served.

/** Long enough for a slow second turn and a publish; the claim RPC also ends sessions at the UTC day. */
const SESSION_TOKEN_TTL_MS = 2 * 60 * 60 * 1_000;

export const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function sign(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), new TextEncoder().encode(message)));
}

async function verify(secret: string, message: string, signature: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromHex(signature), new TextEncoder().encode(message));
}

/**
 * The token a first turn returns: session id, the hashed IP the session was
 * opened from, and an expiry, signed with a server secret. The follow-up is
 * charged to that IP hash, so it no longer has to come from the same IP; the
 * per-IP session limit applies only when a session starts.
 */
export async function signSessionToken(sessionId: string, ipHash: string, secret: string, now = Date.now()): Promise<string> {
  const payload = `${sessionId}.${ipHash}.${now + SESSION_TOKEN_TTL_MS}`;
  return `${payload}.${await sign(secret, `demo-session:v1:${payload}`)}`;
}

/** The session's IP hash when the token is ours, unexpired and names this session; otherwise null. */
export async function verifySessionToken(token: string | undefined, sessionId: string, secret: string, now = Date.now()): Promise<string | null> {
  const match = token?.match(/^([0-9a-f-]{36})\.([0-9a-f]{64})\.(\d{1,15})\.([0-9a-f]{64})$/);
  if (!match) return null;
  const [, tokenSession, ipHash, expires, signature] = match;
  if (tokenSession !== sessionId || Number(expires) < now) return null;
  return (await verify(secret, `demo-session:v1:${tokenSession}.${ipHash}.${expires}`, signature)) ? ipHash : null;
}

export interface SignedTurn {
  sessionId: string;
  /** 1 or 2: a signature cannot be moved to the other turn or another session. */
  turn: number;
  motion: string;
  side: string;
  argument: string;
  rebuttal: string;
  judgeNote: string;
}

const turnMessage = (turn: SignedTurn) =>
  `demo-turn:v1:${JSON.stringify([turn.sessionId, turn.turn, turn.motion, turn.side, turn.argument, turn.rebuttal, turn.judgeNote])}`;

/**
 * A published round's slug and delete token, derived from its session so a
 * publish retried after a lost response returns the same ones. Only a caller
 * holding the session token reaches this.
 */
export async function publishKeys(sessionId: string, secret: string): Promise<{ slug: string; deleteToken: string }> {
  const slugHex = await sign(secret, `demo-slug:v1:${sessionId}`);
  return {
    slug: BigInt(`0x${slugHex}`).toString(36).padStart(12, "0").slice(-12),
    deleteToken: await sign(secret, `demo-delete:v1:${sessionId}`),
  };
}

export const signTurn = (turn: SignedTurn, secret: string) => sign(secret, turnMessage(turn));

export const verifyTurn = (turn: SignedTurn, signature: string, secret: string) => verify(secret, turnMessage(turn), signature);
