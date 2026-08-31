import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const browserCalledFunctions = [
  "admin",
  "announcements",
  "ai",
  "ai-stream",
  "create-checkout",
  "create-portal",
  "export-gdoc",
  "import-source",
  "redeem-promo",
  "share",
];

for (const functionName of browserCalledFunctions) {
  Deno.test(`${functionName} allows the Capacitor WebView origin`, async () => {
    const source = await Deno.readTextFile(new URL(`../${functionName}/index.ts`, import.meta.url));
    assertStringIncludes(source, '"capacitor://localhost"');
  });
}

Deno.test("announcements allows the isolated staging browser origin", async () => {
  const source = await Deno.readTextFile(new URL("../announcements/index.ts", import.meta.url));
  assertStringIncludes(source, '"http://127.0.0.1:18080"');
});

Deno.test("native share links use the public HTTPS origin", async () => {
  const source = await Deno.readTextFile(new URL("../share/index.ts", import.meta.url));
  assertStringIncludes(source, 'const PUBLIC_WEB_APP_ORIGIN = "https://debate.pi-stack.org";');
  assertStringIncludes(source, "shareUrl: `${PUBLIC_WEB_APP_ORIGIN}/share/${data.share_code}`");
});
