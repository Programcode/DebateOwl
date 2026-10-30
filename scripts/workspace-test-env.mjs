import { readFile, writeFile } from "node:fs/promises";

const [source, target] = process.argv.slice(2);
const serviceRoleKey = process.env.LOCAL_SERVICE_ROLE_KEY;
const mailerHost = process.env.LOCAL_MAILER_HOST;
if (!source || !target || !serviceRoleKey || !mailerHost) throw new Error("Local Edge environment is incomplete");
const appOrigin = process.env.APP_ORIGIN || "http://127.0.0.1:18081";
const provider = process.env.FAKE_PROVIDER || "debatelab-fake-openrouter";
const fixture = (await readFile(source, "utf8"))
  .replaceAll("workspace-mailer.invalid", mailerHost)
  .replaceAll("http://127.0.0.1:18081", appOrigin)
  .replaceAll("debatelab-fake-openrouter", provider);
await writeFile(target, `${fixture.trim()}\nLOCAL_GATE_APP_ORIGINS=${appOrigin}\nWORKSPACE_INVITE_SERVICE_ROLE_KEY=${serviceRoleKey}\n`, { mode: 0o600 });
