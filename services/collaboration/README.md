# Collaboration service

The Node 22 service is the durable workspace editor boundary. Hocuspocus carries Yjs updates; Supabase Auth and PostgreSQL remain authoritative for identity, current membership, metadata, snapshots, updates, versions, and review decisions.

For every loaded document epoch, one dedicated PostgreSQL session holds an advisory lock. Incoming reconnect and live updates are schema-checked and persisted before broadcast or the custom `durable-ack`. Access is rechecked for reads, writes, and awareness. Database lock loss, member removal, and version restore close writable sessions. The 2 MiB update/document ceiling is intentional for the trial.

The same loopback server exposes two authenticated HTTP operations:

- `/access/remove` waits for queued writes, changes membership, fences sockets, then acknowledges;
- `/review/decide` commits proposal status, accepted Yjs content, and the pre-decision version in one database transaction.

Required configuration names:

- `COLLABORATION_DATABASE_URL`
- `COLLABORATION_PORT`
- `COLLABORATION_ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Run focused checks with:

```sh
npm run test:collaboration
```

Run the complete local database/Auth/browser lifecycle under the repository lock with:

```sh
./.superset/db-gate.sh
```

This service has no production deployment in Milestone 1.
