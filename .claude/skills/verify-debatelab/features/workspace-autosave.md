# Workspace autosave

Crossfire and Sparring opened from a Workspace save their state to `workspace_artifacts` through the `save_workspace_artifact` RPC on every change. Saves can finish out of order, and a slow older save must not overwrite a newer one: the row ends with the newest text. Workspaces are hidden in production unless `VITE_COLLABORATION_URL` is set, so this is verifiable only on the local stack.

## Sub-features

- `ws-crossfire-autosave` keeps the newest Crossfire resolution when an older save lands last.
- `ws-sparring-autosave` keeps the newest Sparring speech draft when an older save lands last.

## How to get to it (user POV)

- `/app/workspaces` → fill `Motion` → `Create workspace` → open a round (`R1`) → expand `Practice` in the working panel → `Crossfire` or `Sparring`. The tool shows `Shared workspace session`.

## Driving it with verify.sh + Playwright

Preconditions:

- The stack was started with `bin/verify.sh up --collab`. On a stack without it the recipe skips both tests with the reason `Workspaces need the collaboration service: run verify.sh up --collab`, so `drive all` stays green on a plain `up`. Report a skip as unverified.
- Doctor passes. The recipe is `recipes/workspace-autosave.spec.ts`.

- **Open the tool.** Create a workspace for the motion, click `R1`, and on a phone click `Working panel` first (one pane at a time). Open the `Practice` details if closed and click `Crossfire` or `Sparring` (`exact: true`).
- **Hold one save.** `page.route("**/rest/v1/rpc/save_workspace_artifact")` holds the first request whose `p_progress` matches a partial value (Crossfire: a resolution ending in ` n`; Sparring: a draft of `Coding`). The recipe types up to that value and waits until the save is held before typing the rest: the queue keeps only the newest pending save, so a value typed straight through can be merged away and never sent. The page keeps one save in flight, so no other save may be sent while it is held (`sentWhileHeld()` is 0); newer changes wait in the queue.
- **Release and check.** Let the held save through and wait for its answer. Polling `admin.from("workspace_artifacts")` for the workspace and tool must return one row with the full text, and it must still hold that text once every save the page sent has been answered.
- **Sparring.** Click `Start round` and wait for the textbox `Draft for <turn>` (`AI_TIMEOUT`). Each turn opens with a stopped clock and a `Start speaking` button; typing would start it. Click `Start speaking`, then `Pause clock`, before typing, because a running clock saves every tick and would hide a stale save.

## Gotchas

- `e2e/workspace-collaboration.spec.ts` starts its own collaboration process on the slot's collaboration port (`12345` or `12445`) and must not run against `up --collab`. This recipe is the opposite: it needs `up --collab` and skips without it. Don't drive both on one stack.
- `up` always gives the client `VITE_COLLABORATION_URL`, so Workspace routes render without `--collab` but the editor never connects. The recipe keys its skip off `VERIFY_COLLAB` in `drive.env`, not off the page.
- The Workspace editor reports uncaught page errors through the fixture. Hocuspocus hands empty outgoing messages to `onOutgoingMessage`; `durableMutationFromMessage` ignores them (`src/lib/workspace/durable-ack.ts`).
