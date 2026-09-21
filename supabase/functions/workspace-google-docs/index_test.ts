import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
const modulePromise = import("./index.ts");

Deno.test("workspace Markdown becomes rich Google import HTML", async () => {
  const { markdownToGoogleHtml } = await modulePromise;
  const html = markdownToGoogleHtml(`# Cím Ősz

3. ***Első***
  - [Forrás](https://example.com/evidence)

\\*literal\\*

| Név | Érték |
| --- | --- |
| Árvíz | tűrő |`, "Beszéd");
  for (const expected of ["<h1>", "<ol start=\"3\">", "<ul>", "<strong><em>", "<a href=\"https://example.com/evidence\"", "<table>", "*literal*", "Árvíz", "tűrő"]) {
    assertStringIncludes(html, expected);
  }
  if (html.includes("<em>literal</em>")) throw new Error("escaped literal became formatting");
});

Deno.test("Google ordered and nested list metadata survives import", async () => {
  const { tabsMarkdown } = await modulePromise;
  const tabs = tabsMarkdown({
    title: "List",
    lists: {
      list1: { listProperties: { nestingLevels: [{ glyphType: "DECIMAL", startNumber: 3 }, { glyphType: "GLYPH_TYPE_UNSPECIFIED" }] } },
    },
    body: { content: [
      { paragraph: { bullet: { listId: "list1", nestingLevel: 0 }, elements: [{ textRun: { content: "First\n", textStyle: {} } }] } },
      { paragraph: { bullet: { listId: "list1", nestingLevel: 1 }, elements: [{ textRun: { content: "Nested\n", textStyle: {} } }] } },
    ] },
  });
  assertEquals(tabs[0].markdown, "3. First\n  - Nested");
});

Deno.test("provider marker reconciles a retry without creating another Doc", async () => {
  const { findOrCreateGoogleDocument } = await modulePromise;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ files: [{ id: "existing-doc" }] }), { status: 200 }));
  };
  try {
    assertEquals(await findOrCreateGoogleDocument("token", "a0000000-0000-4000-8000-000000000001", "Title", "# Body"), "existing-doc");
    assertEquals(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("new Google Doc creation carries its idempotency marker and rich HTML atomically", async () => {
  const { findOrCreateGoogleDocument } = await modulePromise;
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (_input, init) => {
    if (!init?.method) return Promise.resolve(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    bodies.push(String(init.body));
    return Promise.resolve(new Response(JSON.stringify({ id: "created-doc" }), { status: 200 }));
  };
  try {
    assertEquals(await findOrCreateGoogleDocument("token", "a0000000-0000-4000-8000-000000000001", "Title", "**Body**"), "created-doc");
    assertStringIncludes(bodies[0], "debatelabRequestId");
    assertStringIncludes(bodies[0], "<strong>Body</strong>");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
