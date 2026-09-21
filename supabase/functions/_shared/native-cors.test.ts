import { assertStringIncludes } from "jsr:@std/assert@1.0.19";

const browserCalledFunctions = [
  "admin",
  "announcements",
  "ai",
  "ai-stream",
  "create-checkout",
  "create-portal",
  "export-gdoc",
  "import-source",
  "google-connections",
  "redeem-promo",
  "share",
  "workspace-google-docs",
];

for (const functionName of browserCalledFunctions) {
  Deno.test(`${functionName} allows the Capacitor WebView origin`, async () => {
    const source = await Deno.readTextFile(new URL(`../${functionName}/index.ts`, import.meta.url));
    assertStringIncludes(source, '"capacitor://localhost"');
  });
}

for (const functionName of ["admin", "announcements"]) {
  Deno.test(`${functionName} allows the isolated staging browser origin`, async () => {
    const source = await Deno.readTextFile(new URL(`../${functionName}/index.ts`, import.meta.url));
    assertStringIncludes(source, '"http://127.0.0.1:18080"');
  });
}

Deno.test("native share links use the public HTTPS origin", async () => {
  const source = await Deno.readTextFile(new URL("../share/index.ts", import.meta.url));
  assertStringIncludes(source, 'const PUBLIC_WEB_APP_ORIGIN = "https://debate.pi-stack.org";');
  assertStringIncludes(source, "shareUrl: `${PUBLIC_WEB_APP_ORIGIN}/share/${data.share_code}`");
});
