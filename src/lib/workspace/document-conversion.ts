import type { JSONContent } from "@tiptap/core";
import { validateUrl } from "@/lib/validation/url";
import liberationSansUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import { workspaceSchema } from "./schema";

function escapeMarkdown(text: string) {
  return text.replace(/([\\`*_[\]()|])/g, "\\$1");
}

function unescapeMarkdown(text: string) {
  return text.replace(/\\([\\`*_[\]()|])/g, "$1");
}

function citationLabel(attrs: Record<string, unknown>) {
  const title = String(attrs.title || "Citation");
  const locator = attrs.locator ? `, ${String(attrs.locator)}` : "";
  return `[${title}${locator}]`;
}

function citationUri(attrs: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const key of ["title", "locator", "quote", "href"] as const) {
    if (attrs[key]) query.set(key, String(attrs[key]));
  }
  return `debatelab-citation:${encodeURIComponent(String(attrs.sourceId || ""))}?${query}`;
}

function inlineMarkdown(content: JSONContent[] = []) {
  return content.map((node) => {
    if (node.type === "citation") {
      return `${citationLabel(node.attrs ?? {})}(${citationUri(node.attrs ?? {})})`;
    }
    if (node.type !== "text") return "";

    let text = escapeMarkdown(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `**${text}**`;
      if (mark.type === "italic") text = `*${text}*`;
      if (mark.type === "strike") text = `~~${text}~~`;
    }
    const link = node.marks?.find((mark) => mark.type === "link");
    return link?.attrs?.href
      ? `[${text}](${String(link.attrs.href)})`
      : text;
  }).join("");
}

function serializeList(node: JSONContent, depth = 0): string {
  const lines: string[] = [];
  for (const [index, item] of (node.content ?? []).entries()) {
    const blocks = item.content ?? [];
    const paragraph = blocks.find((block) => block.type === "paragraph");
    const marker = node.type === "orderedList" ? `${index + Number(node.attrs?.start ?? 1)}.` : "-";
    lines.push(`${"  ".repeat(depth)}${marker} ${inlineMarkdown(paragraph?.content)}`);
    for (const child of blocks) {
      if (child.type === "bulletList" || child.type === "orderedList") lines.push(serializeList(child, depth + 1));
    }
  }
  return lines.join("\n");
}

function tableCellMarkdown(cell: JSONContent) {
  return escapeMarkdown((cell.content ?? []).map((block) => inlineMarkdown(block.content)).join(" "));
}

function serializeTable(node: JSONContent) {
  const rows = (node.content ?? []).map((row) =>
    `| ${(row.content ?? []).map(tableCellMarkdown).join(" | ")} |`,
  );
  if (rows.length === 0) return "";
  const columns = node.content?.[0]?.content?.length ?? 1;
  rows.splice(1, 0, `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`);
  return rows.join("\n");
}

export function toWorkspaceMarkdown(document: JSONContent): string {
  workspaceSchema.nodeFromJSON(document).check();
  return (document.content ?? []).map((node) => {
    if (node.type === "heading") {
      return `${"#".repeat(Number(node.attrs?.level) || 1)} ${inlineMarkdown(node.content)}`;
    }
    if (node.type === "paragraph") return inlineMarkdown(node.content);
    if (node.type === "bulletList" || node.type === "orderedList") return serializeList(node);
    if (node.type === "table") return serializeTable(node);
    return "";
  }).filter(Boolean).join("\n\n");
}

function parseCitation(href: string): JSONContent | null {
  if (!href.startsWith("debatelab-citation:")) return null;
  const [source, query = ""] = href.slice("debatelab-citation:".length).split("?", 2);
  let sourceId: string;
  try {
    sourceId = decodeURIComponent(source);
  } catch {
    return null;
  }
  if (!sourceId) return null;
  const params = new URLSearchParams(query);
  const citationHref = validateUrl(params.get("href") ?? undefined) ?? null;
  return {
    type: "citation",
    attrs: {
      sourceId,
      title: params.get("title"),
      locator: params.get("locator"),
      quote: params.get("quote"),
      href: citationHref,
    },
  };
}

function parseMarkedText(text: string, extraMarks: JSONContent["marks"] = []): JSONContent[] {
  const nodes: JSONContent[] = [];
  const pattern = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) {
      nodes.push({ type: "text", text: unescapeMarkdown(text.slice(start, match.index)), marks: extraMarks });
    }
    const marks = match[2]
      ? [{ type: "bold" }, { type: "italic" }]
      : [{ type: match[3] ? "bold" : match[4] ? "italic" : "strike" }];
    nodes.push({
      type: "text",
      text: unescapeMarkdown(match[2] ?? match[3] ?? match[4] ?? match[5]),
      marks: [...extraMarks, ...marks],
    });
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    nodes.push({ type: "text", text: unescapeMarkdown(text.slice(start)), marks: extraMarks });
  }
  return nodes.map((node) => node.marks?.length ? node : { ...node, marks: undefined });
}

function parseInline(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  let start = 0;
  for (const match of text.matchAll(linkPattern)) {
    if (match.index > start) nodes.push(...parseMarkedText(text.slice(start, match.index)));
    const citation = parseCitation(match[2]);
    if (citation) {
      nodes.push(citation);
    } else {
      const href = validateUrl(match[2]);
      nodes.push(...parseMarkedText(match[1], href ? [{ type: "link", attrs: { href } }] : []));
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) nodes.push(...parseMarkedText(text.slice(start)));
  return nodes;
}

function splitTableRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of line.trim().replace(/^\||\|$/g, "")) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  cells.push(cell.trim());
  return cells;
}

function parseTable(lines: string[], start: number) {
  const rows: JSONContent[] = [];
  let index = start;
  let header = true;
  while (index < lines.length && /^\s*\|/.test(lines[index])) {
    if (!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index])) {
      rows.push({
        type: "tableRow",
        content: splitTableRow(lines[index]).map((cell) => ({
          type: header ? "tableHeader" : "tableCell",
          content: [{ type: "paragraph", content: parseInline(unescapeMarkdown(cell)) }],
        })),
      });
      header = false;
    }
    index += 1;
  }
  return { node: { type: "table", content: rows } satisfies JSONContent, index };
}

function parseList(lines: string[], start: number, indent: number) {
  const items: JSONContent[] = [];
  const first = /^(\s*)(?:(\d+)\.|[-+*])\s+(.*)$/.exec(lines[start]);
  const ordered = Boolean(first?.[2]);
  const order = Number(first?.[2] ?? 1);
  let index = start;
  while (index < lines.length) {
    const match = /^(\s*)(?:(\d+)\.|[-+*])\s+(.*)$/.exec(lines[index]);
    if (!match || match[1].length < indent) break;
    if (match[1].length > indent) {
      const nested = parseList(lines, index, match[1].length);
      items.at(-1)?.content?.push(nested.node);
      index = nested.index;
      continue;
    }
    items.push({
      type: "listItem",
      content: [{ type: "paragraph", content: parseInline(match[3]) }],
    });
    index += 1;
  }
  return {
    node: { type: ordered ? "orderedList" : "bulletList", ...(ordered ? { attrs: { start: order } } : {}), content: items } satisfies JSONContent,
    index,
  };
}

export function fromWorkspaceMarkdown(markdown: string): JSONContent {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: JSONContent[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      content.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }
    if (/^\s*(?:(?:\d+)\.|[-+*])\s+/.test(line)) {
      const list = parseList(lines, index, /^\s*/.exec(line)?.[0].length ?? 0);
      content.push(list.node);
      index = list.index;
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1] ?? "")) {
      const table = parseTable(lines, index);
      content.push(table.node, { type: "paragraph" });
      index = table.index;
      continue;
    }

    content.push({ type: "paragraph", content: parseInline(line) });
    index += 1;
  }

  const parsed = workspaceSchema.nodeFromJSON({ type: "doc", content });
  parsed.check();
  return parsed.toJSON();
}

function docxInline(content: JSONContent[] = [], docx: typeof import("docx")) {
  return content.map((node) => {
    if (node.type === "citation") {
      return new docx.ExternalHyperlink({
        link: citationUri(node.attrs ?? {}),
        children: [new docx.TextRun(citationLabel(node.attrs ?? {}))],
      });
    }

    const options = {
      text: node.text ?? "",
      bold: node.marks?.some((mark) => mark.type === "bold"),
      italics: node.marks?.some((mark) => mark.type === "italic"),
      strike: node.marks?.some((mark) => mark.type === "strike"),
    };
    const link = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    return link
      ? new docx.ExternalHyperlink({
          link: String(link),
          children: [new docx.TextRun(options)],
        })
      : new docx.TextRun(options);
  });
}

function docxList(node: JSONContent, docx: typeof import("docx"), depth = 0): import("docx").Paragraph[] {
  const paragraphs: import("docx").Paragraph[] = [];
  for (const item of node.content ?? []) {
    const blocks = item.content ?? [];
    const paragraph = blocks.find((block) => block.type === "paragraph");
    paragraphs.push(new docx.Paragraph({
      children: docxInline(paragraph?.content, docx),
      ...(node.type === "orderedList"
        ? { numbering: { reference: "workspace-numbering", level: depth } }
        : { bullet: { level: depth } }),
    }));
    for (const child of blocks) {
      if (child.type === "bulletList" || child.type === "orderedList") paragraphs.push(...docxList(child, docx, depth + 1));
    }
  }
  return paragraphs;
}

function docxTable(node: JSONContent, docx: typeof import("docx")) {
  return new docx.Table({
    rows: (node.content ?? []).map((row, rowIndex) => new docx.TableRow({
      tableHeader: rowIndex === 0,
      children: (row.content ?? []).map((cell) => new docx.TableCell({
        children: (cell.content ?? []).map((block) => new docx.Paragraph({
          children: docxInline(block.content, docx),
        })),
      })),
    })),
  });
}

function docxBlocks(document: JSONContent, docx: typeof import("docx")) {
  return (document.content ?? []).flatMap((node) => {
    if (node.type === "heading") {
      const levels = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6,
      ];
      return [new docx.Paragraph({
        heading: levels[Math.max(0, Math.min(5, Number(node.attrs?.level) - 1))],
        children: docxInline(node.content, docx),
      })];
    }
    if (node.type === "paragraph") {
      return [new docx.Paragraph({ children: docxInline(node.content, docx) })];
    }
    if (node.type === "bulletList" || node.type === "orderedList") return docxList(node, docx);
    if (node.type === "table") return [docxTable(node, docx)];
    return [];
  });
}

export async function toWorkspaceDocx(document: JSONContent): Promise<Uint8Array> {
  workspaceSchema.nodeFromJSON(document).check();
  const docx = await import("docx");
  const children = docxBlocks(document, docx);
  const file = new docx.Document({
    numbering: {
      config: [{
        reference: "workspace-numbering",
        levels: Array.from({ length: 9 }, (_, level) => ({
          alignment: docx.AlignmentType.START,
          format: docx.LevelFormat.DECIMAL,
          level,
          style: { paragraph: { indent: { hanging: 360, left: 720 * (level + 1) } } },
          text: `%${level + 1}.`,
        })),
      }],
    },
    sections: [{ children }],
  });
  return new Uint8Array(await docx.Packer.toArrayBuffer(file));
}

function htmlInline(node: ChildNode, marks: JSONContent["marks"] = []): JSONContent[] {
  if (node.nodeType === 3) {
    return node.textContent ? [{ type: "text", text: node.textContent, marks }] : [];
  }
  if (!(node instanceof Element)) return [];

  const tag = node.tagName.toLowerCase();
  if (tag === "script" || tag === "style") return [];
  if (tag === "a") {
    const href = node.getAttribute("href") ?? "";
    const citation = parseCitation(href);
    if (citation) return [citation];
    const safeHref = validateUrl(href);
    const linkMarks = safeHref ? [...marks, { type: "link", attrs: { href: safeHref } }] : marks;
    return Array.from(node.childNodes).flatMap((child) => htmlInline(child, linkMarks));
  }

  const mark = tag === "strong" || tag === "b"
    ? "bold"
    : tag === "em" || tag === "i"
      ? "italic"
      : tag === "s" || tag === "del"
        ? "strike"
        : null;
  const nextMarks = mark ? [...marks, { type: mark }] : marks;
  return Array.from(node.childNodes).flatMap((child) => htmlInline(child, nextMarks));
}

function htmlParagraph(element: Element): JSONContent {
  return {
    type: "paragraph",
    content: Array.from(element.childNodes).flatMap((child) => htmlInline(child)),
  };
}

function htmlList(element: Element): JSONContent {
  const ordered = element.tagName.toLowerCase() === "ol";
  return {
    type: ordered ? "orderedList" : "bulletList",
    ...(ordered && element.getAttribute("start") ? { attrs: { start: Number(element.getAttribute("start")) || 1 } } : {}),
    content: Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((item) => {
        const content: JSONContent[] = [];
        const paragraph = Array.from(item.children).find((child) =>
          child.tagName.toLowerCase() === "p",
        );
        content.push(paragraph
          ? htmlParagraph(paragraph)
          : {
              type: "paragraph",
              content: Array.from(item.childNodes)
                .filter((child) => !(child instanceof Element) || !["ul", "ol"].includes(child.tagName.toLowerCase()))
                .flatMap((child) => htmlInline(child)),
            });
        for (const child of Array.from(item.children)) {
          if (["ul", "ol"].includes(child.tagName.toLowerCase())) content.push(htmlList(child));
        }
        return { type: "listItem", content };
      }),
  };
}

function htmlTable(element: Element): JSONContent {
  const rows = Array.from(element.querySelectorAll("tr")).map((row, rowIndex) => ({
    type: "tableRow",
    content: Array.from(row.children)
      .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
      .map((cell) => ({
        type: rowIndex === 0 || cell.tagName.toLowerCase() === "th" ? "tableHeader" : "tableCell",
        content: [htmlParagraph(cell)],
      })),
  }));
  return { type: "table", content: rows };
}

export function fromWorkspaceHtml(html: string): JSONContent {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const content: JSONContent[] = [];
  for (const element of Array.from(body.children)) {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      content.push({
        type: "heading",
        attrs: { level: Number(tag[1]) },
        content: Array.from(element.childNodes).flatMap((child) => htmlInline(child)),
      });
    } else if (tag === "p") {
      content.push(htmlParagraph(element));
    } else if (tag === "ul" || tag === "ol") {
      content.push(htmlList(element));
    } else if (tag === "table") {
      content.push(htmlTable(element), { type: "paragraph" });
    }
  }
  const parsed = workspaceSchema.nodeFromJSON({ type: "doc", content });
  parsed.check();
  return parsed.toJSON();
}

async function convertWorkspaceDocx(bytes: Uint8Array) {
  const mammoth = await import("mammoth");
  const arrayBuffer = new Uint8Array(bytes).buffer;
  const input = { arrayBuffer, buffer: bytes };
  const result = await mammoth.convertToHtml(input);
  const body = new DOMParser().parseFromString(result.value, "text/html").body;
  const unsupported = body.querySelectorAll("img,video,audio,iframe,object,embed,svg").length;
  return {
    content: fromWorkspaceHtml(result.value),
    warnings: [
      ...result.messages.map((message) => message.message),
      ...(unsupported ? [`${unsupported} unsupported embedded item(s) were omitted.`] : []),
    ],
  };
}

export async function fromWorkspaceDocx(bytes: Uint8Array): Promise<JSONContent> {
  return (await convertWorkspaceDocx(bytes)).content;
}

function validateDocxArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  let entries = 0;
  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    total += view.getUint32(offset + 24, true);
    entries += 1;
    if (total > 20 * 1024 * 1024 || entries > 2_000) throw new Error("DOCX expands beyond the safe import limit.");
    offset += 45 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (!entries) throw new Error("The file is not a valid DOCX archive.");
}

export async function previewWorkspaceImport(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("The document exceeds the 8 MB import limit.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    const markdown = await file.text();
    if (new TextEncoder().encode(markdown).byteLength > 1024 * 1024) throw new Error("Markdown exceeds the 1 MB import limit.");
    return { content: fromWorkspaceMarkdown(markdown), markdown, warnings: [] as string[] };
  }
  if (!name.endsWith(".docx")) throw new Error("Import a Markdown or DOCX speech.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateDocxArchive(bytes);
  const converted = await Promise.race([
    convertWorkspaceDocx(bytes),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DOCX parsing timed out.")), 5_000)),
  ]);
  const markdown = toWorkspaceMarkdown(converted.content);
  if (new TextEncoder().encode(JSON.stringify(converted.content)).byteLength > 1024 * 1024) throw new Error("Converted document exceeds the safe import limit.");
  return { ...converted, markdown };
}

function visibleInlineText(content: JSONContent[] = []) {
  return content.map((node) =>
    node.type === "citation"
      ? citationLabel(node.attrs ?? {})
      : node.text ?? "",
  ).join("");
}

function inlineLinks(content: JSONContent[] = []) {
  return content.flatMap((node) => {
    if (node.type === "citation" && node.attrs?.href) return [{ href: String(node.attrs.href), text: citationLabel(node.attrs) }];
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    return href ? [{ href: String(href), text: node.text || String(href) }] : [];
  });
}

function pdfLines(document: JSONContent) {
  const lines: Array<{ text: string; fontSize: number; indent: number; href?: string; pageBreakBefore?: boolean }> = [];
  const addLinks = (content: JSONContent[] = [], indent = 0) => {
    for (const link of inlineLinks(content)) lines.push({ text: `${link.text}: ${link.href}`, fontSize: 9, indent, href: link.href });
  };
  const addList = (node: JSONContent, depth = 0) => {
    for (const [index, item] of (node.content ?? []).entries()) {
      const blocks = item.content ?? [];
      const paragraph = blocks.find((block) => block.type === "paragraph");
      const marker = node.type === "orderedList" ? `${index + Number(node.attrs?.start ?? 1)}.` : "•";
      lines.push({ text: `${marker} ${visibleInlineText(paragraph?.content)}`, fontSize: 11, indent: depth * 6 });
      addLinks(paragraph?.content, depth * 6);
      for (const child of blocks) {
        if (child.type === "bulletList" || child.type === "orderedList") addList(child, depth + 1);
      }
    }
  };

  for (const node of document.content ?? []) {
    if (node.type === "heading") {
      lines.push({
        text: visibleInlineText(node.content),
        fontSize: Math.max(12, 18 - Number(node.attrs?.level || 1) * 2),
        indent: 0,
        pageBreakBefore: Number(node.attrs?.level || 1) === 1,
      });
      addLinks(node.content);
    } else if (node.type === "paragraph") {
      const text = visibleInlineText(node.content);
      if (text) lines.push({ text, fontSize: 11, indent: 0 });
      addLinks(node.content);
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      addList(node);
    } else if (node.type === "table") {
      for (const row of node.content ?? []) {
        lines.push({
          text: (row.content ?? []).map((cell) =>
            (cell.content ?? []).map((block) => visibleInlineText(block.content)).join(" "),
          ).join(" | "),
          fontSize: 10,
          indent: 0,
        });
        for (const cell of row.content ?? []) for (const block of cell.content ?? []) addLinks(block.content);
      }
    }
  }
  return lines;
}

function binaryString(bytes: Uint8Array) {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return value;
}

export async function toWorkspacePdf(
  document: JSONContent,
  options: { fontData?: Uint8Array; pageBreakBeforeTopHeadings?: boolean } = {},
): Promise<Uint8Array> {
  workspaceSchema.nodeFromJSON(document).check();
  const { jsPDF } = await import("jspdf");
  const fontData = options.fontData ?? new Uint8Array(
    await (await fetch(liberationSansUrl)).arrayBuffer(),
  );
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.addFileToVFS("LiberationSans-Regular.ttf", binaryString(fontData));
  pdf.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");
  pdf.setFont("LiberationSans", "normal");

  const margin = 20;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageBottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;
  for (const line of pdfLines(document)) {
    if (options.pageBreakBeforeTopHeadings && line.pageBreakBefore && y > margin) {
      pdf.addPage();
      pdf.setFont("LiberationSans", "normal");
      y = margin;
    }
    pdf.setFontSize(line.fontSize);
    const wrapped = Array.from(pdf.splitTextToSize(line.text, width - line.indent), String);
    const lineHeight = line.fontSize * 0.4;
    if (y + wrapped.length * lineHeight > pageBottom) {
      pdf.addPage();
      pdf.setFont("LiberationSans", "normal");
      y = margin;
    }
    if (line.href) {
      wrapped.forEach((part, index) => pdf.textWithLink(part, margin + line.indent, y + index * lineHeight, { url: line.href }));
    } else {
      pdf.text(wrapped, margin + line.indent, y);
    }
    y += wrapped.length * lineHeight + 3;
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

export interface WorkspacePacketManifest {
  artifacts: Array<{ output?: unknown; status: string; tool: string }>;
  capturedAt: string;
  documents: Array<{ assigneeId?: string | null; content: JSONContent; provenance?: Record<string, unknown> | null; side: "pro" | "con"; title: string }>;
  excluded: { archived: number; trashed: number };
  reviews?: { comments: Array<Record<string, unknown>>; proposals: Array<Record<string, unknown>> } | null;
  sources: Array<{ citationSnapshot: Record<string, unknown>; title: string }>;
  workspace: { motion: string; title?: string | null };
}

function packetContent(manifest: WorkspacePacketManifest): JSONContent {
  const paragraph = (text: string): JSONContent => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  const heading = (text: string, level = 1): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const content: JSONContent[] = [
    heading(manifest.workspace.title || manifest.workspace.motion),
    paragraph(manifest.workspace.motion),
    paragraph(`Captured ${manifest.capturedAt}. Excluded: ${manifest.excluded.archived} archived, ${manifest.excluded.trashed} trashed.`),
  ];
  for (const document of manifest.documents) {
    content.push(
      heading(`${document.side === "pro" ? "For" : "Against"} · ${document.title}`),
      paragraph(document.assigneeId ? `Assignee: ${document.assigneeId}` : "Unassigned"),
      ...(document.provenance ? [paragraph(`Imported copy provenance: ${JSON.stringify(document.provenance)}`)] : []),
      ...(document.content.content ?? []),
    );
  }
  if (manifest.sources.length) {
    content.push(heading("Bibliography"));
    for (const source of manifest.sources) {
      const href = typeof source.citationSnapshot.href === "string"
        ? source.citationSnapshot.href
        : typeof source.citationSnapshot.url === "string" ? source.citationSnapshot.url : null;
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: source.title, ...(href ? { marks: [{ type: "link", attrs: { href } }] } : {}) }],
      });
    }
  }
  if (manifest.artifacts.length) {
    content.push(heading("Selected practice appendix"));
    for (const artifact of manifest.artifacts) {
      content.push(heading(`${artifact.tool} · ${artifact.status}`, 2), paragraph(JSON.stringify(artifact.output, null, 2).slice(0, 20_000)));
    }
  }
  if (manifest.reviews) {
    content.push(heading("Review appendix"));
    for (const comment of manifest.reviews.comments) content.push(paragraph(`Comment: ${String(comment.body ?? "")}`));
    for (const proposal of manifest.reviews.proposals) content.push(paragraph(`Proposal: ${JSON.stringify(proposal.payload).slice(0, 20_000)}`));
  }
  return workspaceSchema.nodeFromJSON({ type: "doc", content }).toJSON();
}

export async function toWorkspacePacketDocx(manifest: WorkspacePacketManifest) {
  const docx = await import("docx");
  const content = packetContent(manifest);
  const children = (content.content ?? []).flatMap((source, index) => {
    const blocks = docxBlocks({ type: "doc", content: [source] }, docx);
    return source.type === "heading" && Number(source.attrs?.level) === 1 && index > 0
      ? [new docx.Paragraph({ children: [new docx.PageBreak()] }), ...blocks]
      : blocks;
  });
  const file = new docx.Document({
    numbering: {
      config: [{
        reference: "workspace-numbering",
        levels: Array.from({ length: 9 }, (_, level) => ({
          alignment: docx.AlignmentType.START,
          format: docx.LevelFormat.DECIMAL,
          level,
          style: { paragraph: { indent: { hanging: 360, left: 720 * (level + 1) } } },
          text: `%${level + 1}.`,
        })),
      }],
    },
    sections: [{ children }],
  });
  return new Uint8Array(await docx.Packer.toArrayBuffer(file));
}

export function toWorkspacePacketPdf(manifest: WorkspacePacketManifest, options: { fontData?: Uint8Array } = {}) {
  return toWorkspacePdf(packetContent(manifest), { ...options, pageBreakBeforeTopHeadings: true });
}
