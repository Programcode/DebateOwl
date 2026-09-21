import type { JSONContent } from "@tiptap/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import {
  fromWorkspaceDocx,
  fromWorkspaceHtml,
  fromWorkspaceMarkdown,
  toWorkspaceDocx,
  toWorkspaceMarkdown,
  toWorkspacePdf,
} from "@/lib/workspace/document-conversion";
import {
  STRUCTURED_SPEECH,
  STRUCTURED_SPEECH_TEXT,
} from "./fixtures/structured-speech";

const EXPECTED_SEMANTICS = {
  headings: [{ level: 1, text: "A fair transition" }],
  bulletListDepths: [0, 1],
  links: [{ href: "https://example.com/evidence", text: "source" }],
  table: [
    ["Metric", "Value"],
    ["Access", "Equal"],
  ],
  citations: [
    {
      sourceId: "source-1",
      title: "Public evidence",
      locator: "p. 7",
      quote: "Equal access",
      href: "https://example.com/evidence",
    },
  ],
};

function nodeText(node: JSONContent): string {
  if (node.type === "citation") return "";
  return node.text ?? node.content?.map(nodeText).join("") ?? "";
}

function documentSemantics(document: JSONContent) {
  const headings: Array<{ level: number; text: string }> = [];
  const bulletListDepths: number[] = [];
  const links: Array<{ href: string; text: string }> = [];
  const table: string[][] = [];
  const citations: Array<Record<string, unknown>> = [];

  function visit(node: JSONContent, listDepth = 0) {
    if (node.type === "heading") {
      headings.push({ level: Number(node.attrs?.level), text: nodeText(node) });
    }
    if (node.type === "bulletList") {
      bulletListDepths.push(listDepth);
      listDepth += 1;
    }
    if (node.type === "text") {
      const link = node.marks?.find((mark) => mark.type === "link");
      if (link) links.push({ href: String(link.attrs?.href), text: node.text ?? "" });
    }
    if (node.type === "table") {
      for (const row of node.content ?? []) {
        table.push((row.content ?? []).map(nodeText));
      }
    }
    if (node.type === "citation") citations.push(node.attrs ?? {});
    node.content?.forEach((child) => visit(child, listDepth));
  }

  visit(document);
  return { headings, bulletListDepths, links, table, citations };
}

describe("workspace document conversion", () => {
  it("round-trips supported semantics and multilingual text through Markdown", () => {
    expect(documentSemantics(STRUCTURED_SPEECH)).toEqual(EXPECTED_SEMANTICS);

    const markdown = toWorkspaceMarkdown(STRUCTURED_SPEECH);
    const roundTrip = fromWorkspaceMarkdown(markdown);

    expect(documentSemantics(roundTrip)).toEqual(EXPECTED_SEMANTICS);
    const visibleText = nodeText(roundTrip);
    for (const text of STRUCTURED_SPEECH_TEXT) {
      expect(visibleText).toContain(text);
    }
  });

  it("preserves numbered lists, nested marks, links, tables, and Hungarian text", () => {
    const imported = fromWorkspaceMarkdown(`1. ***Első tűrő***
2. [Második](https://example.com/hungarian)

| Név | Érték |
| --- | --- |
| Ősz | árvíztűrő |`);
    const serialized = JSON.stringify(imported);

    expect(serialized).toContain('"type":"orderedList"');
    expect(serialized).toContain('"type":"bold"');
    expect(serialized).toContain('"type":"italic"');
    expect(serialized).toContain("https://example.com/hungarian");
    expect(toWorkspaceMarkdown(imported)).toContain("árvíztűrő");
  });

  it("round-trips supported semantics and multilingual text through DOCX", async () => {
    expect(toWorkspaceDocx).toBeTypeOf("function");
    expect(fromWorkspaceDocx).toBeTypeOf("function");

    const docx = await toWorkspaceDocx(STRUCTURED_SPEECH);
    expect(Array.from(docx.slice(0, 2))).toEqual([0x50, 0x4b]);
    const roundTrip = await fromWorkspaceDocx(docx);

    expect(documentSemantics(roundTrip)).toEqual(EXPECTED_SEMANTICS);
    const visibleText = nodeText(roundTrip);
    for (const text of STRUCTURED_SPEECH_TEXT) {
      expect(visibleText).toContain(text);
    }
  });

  it("renders selectable multilingual PDF text with intact glyphs", async () => {
    const fontData = await readFile(resolve(
      process.cwd(),
      "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
    ));
    const bytes = await toWorkspacePdf(STRUCTURED_SPEECH, { fontData });
    const loadingTask = getDocument({ data: bytes, useWorkerFetch: false });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      page.cleanup();
    }
    await loadingTask.destroy();

    const extracted = pages.join(" ").replace(/\s+/g, " ");
    for (const text of STRUCTURED_SPEECH_TEXT) {
      expect(extracted).toContain(text);
    }
    expect(extracted).toContain("[Public evidence, p. 7]");
  });

  it("keeps malformed citations, scripts, and unsafe links outside imported schema", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const imported = fromWorkspaceHtml(`
      <h1>Safe heading</h1>
      <p>
        <a href="javascript:alert(1)">plain unsafe label</a>
        <script>hidden payload</script>
        <a href="debatelab-citation:%E0%A4%A?title=Broken">broken citation label</a>
      </p>
    `);
    const serialized = JSON.stringify(imported);

    expect(nodeText(imported)).toContain("plain unsafe label");
    expect(nodeText(imported)).toContain("broken citation label");
    expect(serialized).not.toContain("hidden payload");
    expect(serialized).not.toContain('"type":"link"');
    expect(serialized).not.toContain('"type":"citation"');
    warning.mockRestore();
  });
});
