import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import { createEdgeStripe, Stripe } from "./stripe.ts";

Deno.test("the edge Stripe client is the fetch build, not the Node http client", () => {
  const fetchClient = Stripe.createFetchHttpClient();
  assertEquals(fetchClient.getClientName(), "fetch");
  assertThrows(
    () => Stripe.createNodeHttpClient(),
    Error,
    "createFetchHttpClient",
  );

  const stripe = createEdgeStripe("sk_test_example", "http://127.0.0.1:12111");
  const fields = stripe as unknown as { getApiField(key: string): unknown };
  assertEquals(fields.getApiField("host"), "127.0.0.1");
  assertEquals(fields.getApiField("protocol"), "http");
  const httpClient = fields.getApiField("httpClient") as { getClientName(): string };
  assertEquals(httpClient.getClientName(), "fetch");
});
