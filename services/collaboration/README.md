# Collaboration service spike

**Status:** Phase 0 evidence only. No production route or deployment uses this service.

## Selected stack

- Tiptap 3.31.3
- Hocuspocus 4.7.0
- Yjs 13.6.32
- y-protocols 1.0.7
- async-mutex 0.5.0

These exact versions are MIT, support Node 22, and work with DebateLab's React 18 client. Tiptap 3 uses `@tiptap/y-tiptap`; the spike does not install redundant `y-prosemirror`, React provider bindings, or IndexedDB support.

## Proven write order

Both reconnect `SyncStep2` and live `Update` messages use the same public Hocuspocus hook path:

1. authenticate the room's document and epoch;
2. acquire the per-document lock;
3. apply the candidate to a bounded scratch Y.Doc and validate the editor schema;
4. append the update with authenticated author, epoch, SHA-256 mutation ID, and server sequence;
5. let Hocuspocus apply and broadcast synchronously;
6. verify the live document contains the update;
7. send the stateless durable acknowledgement and release the lock.

The UI must use the custom acknowledgement for Saved. Hocuspocus `synced` and its boolean sync status do not prove database persistence. A reconnecting client queries pending mutation IDs and receives the original durable sequence.

The tests reject append failures, invalid schema, stale epochs, and frames above 2 MiB before broadcast or acknowledgement. They also kill the service after commit before acknowledgement and after acknowledgement, then reload the stored update in a new process.

## Remaining production boundary

The in-memory mutex proves single-process serialization. P2.1 must replace it with the planned dedicated-session PostgreSQL advisory lock and terminate writable sessions when that database connection is lost. P2.2 owns account-scoped IndexedDB recovery and presence.

Run:

```sh
npm run test:collaboration
npx vitest run src/test/workspace/collaboration.test.ts
```
