import { readFile, writeFile } from "node:fs/promises";

const [source, target] = process.argv.slice(2);
const serviceRoleKey = process.env.LOCAL_SERVICE_ROLE_KEY;
const mailerHost = process.env.LOCAL_MAILER_HOST;
if (!source || !target || !serviceRoleKey || !mailerHost) throw new Error("Local Edge environment is incomplete");
const fixture = (await readFile(source, "utf8")).replace("workspace-mailer.invalid", mailerHost);
await writeFile(target, `${fixture.trim()}\nWORKSPACE_INVITE_SERVICE_ROLE_KEY=${serviceRoleKey}\n`, { mode: 0o600 });
