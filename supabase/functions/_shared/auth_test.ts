import { assertEquals } from "jsr:@std/assert@1.0.19";
for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  Deno.env.set(key, key === "SUPABASE_URL" ? "https://supabase.test" : "test-key");
}
const { HttpError, jsonError } = await import("./auth.ts");

Deno.test("jsonError conceals internal errors and preserves explicit HTTP errors", async () => {
  for (const error of [new Error("database credentials and query"), { message: "database detail" }]) {
    const response = jsonError(error, {});
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: "Internal server error" });
  }
  const response = jsonError(new HttpError(401, "Authentication required"), {});
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Authentication required" });
});
