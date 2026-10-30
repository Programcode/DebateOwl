// Mints or deletes disposable demo-code users on the LOCAL verification stack.
// Mirrors createDemoUser/deleteDemoUser in e2e/full-stack/stack.ts.
//   node demo-user.mjs create <label> <users.tsv>
//   node demo-user.mjs delete-all <users.tsv>
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

const url = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const pepper = process.env.DEMO_CODE_PEPPER;
if (!url || !serviceKey || !pepper) throw new Error("Local stack environment is incomplete; run verify.sh up");
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Refusing to mint users outside the local stack");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const [command, ...args] = process.argv.slice(2);

if (command === "create") {
  const [label = "verify", usersFile] = args;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const code = `DEMO-${part()}-${part()}`;
  const email = `${label}-${randomUUID()}@fullstack.test`;
  const codeHash = createHash("sha256").update(`${pepper}:${code}`).digest("hex");
  const { data, error } = await admin.from("demo_access_codes")
    .insert({ code_hash: codeHash, label, email, max_uses: 10 })
    .select("id")
    .single();
  if (error) throw error;
  await appendFile(usersFile, `${data.id}\t${email}\n`);
  console.log(`DEMO_CODE=${code}\nEMAIL=${email}\nSign in at ${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:18081"}/login -> "Demo code" tab.`);
} else if (command === "delete-all") {
  const lines = (await readFile(args[0], "utf8")).split("\n").filter(Boolean);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const line of lines) {
    const [codeId, email] = line.split("\t");
    const id = data?.users.find((user) => user.email === email)?.id;
    if (id) await admin.auth.admin.deleteUser(id);
    await admin.from("demo_access_codes").delete().eq("id", codeId);
    console.log(`deleted ${email}`);
  }
} else {
  throw new Error(`Unknown command ${command}`);
}
