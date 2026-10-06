# Database and migrations

Part of the [coding standards](../../CODING_STANDARDS.md). [supabase/README.md](../../supabase/README.md#migrations-and-database-tests) owns migration order, table grants, and the database gate. [docs/operations.md](../operations.md#supabase-changes) owns applying migrations to staging and production.

## Constraints

- A `CHECK` passes when its expression is `NULL`. Test nullable columns explicitly with `IS NOT NULL` inside the branch that requires them ([#19](https://github.com/Programcode/DebateLab/pull/19#discussion_r3896430665)).
- Grant the privileges a client read path needs, and let RLS limit the rows. Revoking `SELECT` broke the daily usage count ([#70](https://github.com/Programcode/DebateLab/pull/70#discussion_r4102131041)). When a migration narrows grants, check every client write path that touches the table ([#44](https://github.com/Programcode/DebateLab/pull/44#discussion_r4049229043)).

## Locks on tables with production rows

`npm run lint` runs squawk on new migrations. Check every `-- squawk-ignore` against the table's production size: an ignore is fine on a small table and wrong on a large one. Index builds on populated tables use `CREATE INDEX CONCURRENTLY` in their own file ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649726)), and long locks run at low traffic ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004307)).

## Compare times on one clock

Do not compare a timestamp produced by an Edge Function with one produced by Postgres. Clock skew made the erase fence either accept writes after "Delete all data" or reject fresh requests. Take both times from the database, or compare counters ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649730)).

## Destructive data changes

A migration that anyone can apply must not delete user data as a side effect. Put the deletion in a function, leave the call out of the migration, and run it as a separate step that needs explicit authorization for that environment. Write down the preservation and restore path before that step ([#72](https://github.com/Programcode/DebateLab/pull/72#discussion_r4112813734), [#71](https://github.com/Programcode/DebateLab/pull/71#discussion_r4103235907)). `20260926090100_legacy_debate_cleanup.sql` now follows this.

## Privileged clients

Use the generated `Database` type with `createClient<Database>(...)` rather than casting the client through `unknown` ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649719)). A service-role client filters by the user ID it validated from the bearer token, never by an ID from the request body ([#90 security review](https://github.com/Programcode/DebateLab/pull/90)).
