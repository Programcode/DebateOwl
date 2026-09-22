import { assertEquals } from "jsr:@std/assert@1.0.19";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
const modules = Promise.all([
  import("../google-connections/index.ts"),
  import("../workspace-google-docs/index.ts"),
]);

for (const [name, index] of [["connections", 0], ["documents", 1]] as const) {
  Deno.test(`Google ${name} preflight allows the isolated browser origin`, async () => {
    const handler = (await modules)[index].handleRequest;
    const response = await handler(new Request("http://localhost", {
      headers: { Origin: "http://127.0.0.1:18080" },
      method: "OPTIONS",
    }));
    assertEquals(response.status, 204);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:18080");
  });
}
