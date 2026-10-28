// The esm.sh build `stripe@14.10.0?target=deno` imports
// deno.land/std@0.177.1/node/process.ts. On import that polyfill registers a
// macrotask callback, and the callback calls Deno.core.runMicrotasks(). The
// Edge Runtime rejects that call ("Deno.core.runMicrotasks() is not supported")
// after the handler has already sent its response. Checkout and account
// deletion still succeed; the log line is the polyfill, not the Stripe call.
//
// npm:stripe resolves the package "deno" export, which is the worker build.
// That build speaks fetch and does not install the std nextTick callback.
// createFetchHttpClient() keeps every request on fetch even if a future
// default changes.

import Stripe from "npm:stripe@14.10.0";

const STRIPE_API_VERSION = "2023-10-16";

export function createEdgeStripe(secretKey: string, apiUrl?: string | null): Stripe {
  const endpoint = apiUrl ? new URL(apiUrl) : null;
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    ...(endpoint && {
      host: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === "http:" ? "80" : "443"),
      protocol: endpoint.protocol.replace(":", "") as "http" | "https",
    }),
  });
}

export { Stripe };
