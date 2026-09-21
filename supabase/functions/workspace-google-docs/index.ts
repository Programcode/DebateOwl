import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getGoogleAccessToken } from "../_shared/google-connections.ts";

const ORIGINS = ["https://debate.pi-stack.org", "http://localhost:8080", "http://localhost:18080", "capacitor://localhost"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function requiredUuid(value: unknown, name: string) {
  const text = String(value ?? "");
  if (!UUID.test(text)) throw new HttpError(400, `Invalid ${name}`);
  return text;
}

function requiredText(value: unknown, name: string, maximum: number) {
  const text = String(value ?? "").trim();
  if (!text || new TextEncoder().encode(text).byteLength > maximum) throw new HttpError(400, `Invalid ${name}`);
  return text;
}

function escapeMarkdown(text: string) {
  return text.replace(/([\\`*_[\]()|])/g, "\\$1");
}

function googleInline(elements: unknown[]) {
  return elements.map((raw) => {
    const element = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const run = element.textRun && typeof element.textRun === "object" ? element.textRun as Record<string, unknown> : null;
    if (!run) return "";
    const style = run.textStyle && typeof run.textStyle === "object" ? run.textStyle as Record<string, unknown> : {};
    let text = escapeMarkdown(String(run.content ?? "").replace(/\n$/, ""));
    if (!text) return "";
    if (style.bold) text = `**${text}**`;
    if (style.italic) text = `*${text}*`;
    if (style.strikethrough) text = `~~${text}~~`;
    const link = style.link && typeof style.link === "object" ? String((style.link as Record<string, unknown>).url ?? "") : "";
    return link && /^https?:\/\//i.test(link) ? `[${text}](${link})` : text;
  }).join("");
}

function structuralMarkdown(content: unknown[], lists: Record<string, unknown> = {}) {
  const lines: string[] = [];
  for (const raw of content) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const paragraph = item.paragraph && typeof item.paragraph === "object" ? item.paragraph as Record<string, unknown> : null;
    if (paragraph) {
      const text = googleInline(Array.isArray(paragraph.elements) ? paragraph.elements : []);
      const style = paragraph.paragraphStyle && typeof paragraph.paragraphStyle === "object" ? paragraph.paragraphStyle as Record<string, unknown> : {};
      const named = String(style.namedStyleType ?? "");
      const heading = /^HEADING_(\d)$/.exec(named);
      const bullet = paragraph.bullet && typeof paragraph.bullet === "object" ? paragraph.bullet as Record<string, unknown> : null;
      let listPrefix = "";
      if (bullet) {
        const list = lists[String(bullet.listId)] as Record<string, unknown> | undefined;
        const properties = list?.listProperties as Record<string, unknown> | undefined;
        const levels = Array.isArray(properties?.nestingLevels) ? properties.nestingLevels : [];
        const nesting = Math.max(0, Number(bullet.nestingLevel ?? 0));
        const level = levels[nesting] && typeof levels[nesting] === "object" ? levels[nesting] as Record<string, unknown> : {};
        const ordered = /DECIMAL|ALPHA|ROMAN/i.test(String(level.glyphType ?? ""));
        listPrefix = `${"  ".repeat(nesting)}${ordered ? "1." : "-"} `;
      }
      lines.push(`${heading ? `${"#".repeat(Number(heading[1]))} ` : listPrefix}${text}`);
      continue;
    }
    const table = item.table && typeof item.table === "object" ? item.table as Record<string, unknown> : null;
    if (table) {
      const rows = Array.isArray(table.tableRows) ? table.tableRows : [];
      rows.forEach((rawRow, rowIndex) => {
        const row = rawRow && typeof rawRow === "object" ? rawRow as Record<string, unknown> : {};
        const cells = Array.isArray(row.tableCells) ? row.tableCells : [];
        lines.push(`| ${cells.map((rawCell) => {
          const cell = rawCell && typeof rawCell === "object" ? rawCell as Record<string, unknown> : {};
          return structuralMarkdown(Array.isArray(cell.content) ? cell.content : [], lists).replace(/\n+/g, " ").trim();
        }).join(" | ")} |`);
        if (rowIndex === 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      });
    }
  }
  return lines.join("\n");
}

export function tabsMarkdown(document: Record<string, unknown>) {
  const tabs = Array.isArray(document.tabs) ? document.tabs : [];
  if (!tabs.length) {
    const body = document.body && typeof document.body === "object" ? document.body as Record<string, unknown> : {};
    const lists = document.lists && typeof document.lists === "object" ? document.lists as Record<string, unknown> : {};
    return [{ title: String(document.title ?? "Google document"), markdown: structuralMarkdown(Array.isArray(body.content) ? body.content : [], lists) }];
  }
  const output: Array<{ title: string; markdown: string }> = [];
  const visit = (raw: unknown) => {
    const tab = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const properties = tab.tabProperties && typeof tab.tabProperties === "object" ? tab.tabProperties as Record<string, unknown> : {};
    const content = tab.documentTab && typeof tab.documentTab === "object" ? tab.documentTab as Record<string, unknown> : {};
    const body = content.body && typeof content.body === "object" ? content.body as Record<string, unknown> : {};
    const lists = content.lists && typeof content.lists === "object" ? content.lists as Record<string, unknown> : {};
    output.push({ title: String(properties.title ?? "Tab"), markdown: structuralMarkdown(Array.isArray(body.content) ? body.content : [], lists) });
    if (Array.isArray(tab.childTabs)) tab.childTabs.forEach(visit);
  };
  tabs.forEach(visit);
  return output;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeLink(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("debatelab-citation:")) return null;
  try {
    const query = value.split("?", 2)[1] ?? "";
    const href = new URLSearchParams(query).get("href");
    return href && /^https?:\/\//i.test(href) ? href : null;
  } catch {
    return null;
  }
}

function inlineHtml(value: string): string {
  const links: string[] = [];
  const withPlaceholders: string = value.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string, destination: string): string => {
    const href = safeLink(destination);
    const html: string = href ? `<a href="${escapeHtml(href)}">${inlineHtml(label)}</a>` : inlineHtml(label);
    const index: number = links.push(html) - 1;
    return `\uE000LINK${index}\uE000`;
  });
  return escapeHtml(withPlaceholders)
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\uE000LINK(\d+)\uE000/g, (_match, index: string) => links[Number(index)] ?? "");
}

function splitMarkdownRow(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function listHtml(lines: string[]) {
  let html = "";
  const stack: Array<"ol" | "ul"> = [];
  let currentDepth = -1;
  for (const line of lines) {
    const match = /^(\s*)([-+*]|\d+\.)\s+(.*)$/.exec(line)!;
    const depth = Math.floor(match[1].length / 2);
    const type = /\d+\./.test(match[2]) ? "ol" : "ul";
    while (currentDepth > depth) {
      html += `</li></${stack.pop()}>`;
      currentDepth -= 1;
    }
    if (currentDepth === depth && currentDepth >= 0) html += "</li>";
    if (stack[depth] && stack[depth] !== type) {
      html += `</${stack.pop()}>`;
      currentDepth -= 1;
    }
    while (currentDepth < depth) {
      stack.push(type);
      html += `<${type}>`;
      currentDepth += 1;
    }
    if (currentDepth < 0) {
      stack.push(type);
      html += `<${type}>`;
      currentDepth = 0;
    }
    html += `<li>${inlineHtml(match[3])}`;
  }
  while (currentDepth >= 0) {
    html += `</li></${stack.pop()}>`;
    currentDepth -= 1;
  }
  return html;
}

export function markdownToGoogleHtml(markdown: string, title: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(`<h${heading[1].length}>${inlineHtml(heading[2])}</h${heading[1].length}>`);
      index += 1;
      continue;
    }
    if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) {
      const start = index;
      while (index < lines.length && /^\s*(?:[-+*]|\d+\.)\s+/.test(lines[index])) index += 1;
      blocks.push(listHtml(lines.slice(start, index)));
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1] ?? "")) {
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        if (!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index])) rows.push(splitMarkdownRow(lines[index]));
        index += 1;
      }
      blocks.push(`<table>${rows.map((row, rowIndex) => `<tr>${row.map((cell) => `<${rowIndex ? "td" : "th"}>${inlineHtml(cell)}</${rowIndex ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    blocks.push(`<p>${inlineHtml(line)}</p>`);
    index += 1;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${blocks.join("\n")}</body></html>`;
}

export async function findOrCreateGoogleDocument(accessToken: string, requestId: string, title: string, markdown: string) {
  const markerQuery = `appProperties has { key='debatelabRequestId' and value='${requestId}' } and trashed = false`;
  const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
  searchUrl.search = new URLSearchParams({ fields: "files(id)", pageSize: "2", q: markerQuery, spaces: "drive" }).toString();
  const searchResponse = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const search = await searchResponse.json() as { files?: Array<{ id?: string }> };
  if (!searchResponse.ok) throw new Error("Google export reconciliation failed");
  const existing = search.files?.find((file) => file.id)?.id;
  if (existing) return existing;

  const boundary = `debatelab_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    appProperties: { debatelabRequestId: requestId },
    mimeType: "application/vnd.google-apps.document",
    name: title,
  });
  const media = markdownToGoogleHtml(markdown, title);
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    media,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const createdResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    body,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    method: "POST",
  });
  const created = await createdResponse.json() as { id?: string };
  if (!createdResponse.ok || !created.id) throw new Error("Google document creation failed");
  return created.id;
}

export async function handleRequest(req: Request) {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const auth = await requireUser(req);
    const body = await req.json() as Record<string, unknown>;
    const connectionId = requiredUuid(body.connectionId, "connection");
    const accessToken = await getGoogleAccessToken(auth.adminClient as never, auth.user.id, connectionId);
    if (body.action === "import") {
      const fileId = requiredText(body.fileId, "file", 300);
      const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,version,webViewLink`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const metadata = await metadataResponse.json() as Record<string, unknown>;
      if (!metadataResponse.ok) throw new HttpError(403, "Select the Google Doc with the account picker first");
      if (metadata.mimeType !== "application/vnd.google-apps.document") throw new HttpError(400, "Select a Google Doc");
      const documentResponse = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}?includeTabsContent=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const document = await documentResponse.json() as Record<string, unknown>;
      if (!documentResponse.ok) throw new HttpError(403, "Google Doc access was denied");
      return json({
        accountConnectionId: connectionId,
        modifiedTime: metadata.modifiedTime,
        revision: metadata.version,
        sourceUrl: metadata.webViewLink,
        tabs: tabsMarkdown(document),
        title: metadata.name,
      }, 200, headers);
    }
    if (body.action === "export") {
      const requestId = requiredUuid(body.requestId, "request");
      const markdown = requiredText(body.markdown, "document", 1024 * 1024);
      const title = requiredText(body.title, "title", 300);
      const { data: inserted, error: insertError } = await auth.adminClient.from("google_file_operations").insert({
        connection_id: connectionId,
        kind: "export",
        request_id: requestId,
        user_id: auth.user.id,
      }).select("id,provider_file_id,status").maybeSingle();
      const operation = inserted ?? (await auth.adminClient.from("google_file_operations")
        .select("id,provider_file_id,status").eq("user_id", auth.user.id).eq("request_id", requestId).single()).data;
      if (!operation || insertError && insertError.code !== "23505") throw new Error("Google export could not start");
      let fileId = operation.provider_file_id as string | null;
      if (!fileId) {
        fileId = await findOrCreateGoogleDocument(accessToken, requestId, title, markdown);
      }
      const saved = await auth.adminClient.from("google_file_operations")
        .update({ provider_file_id: fileId, status: "complete", updated_at: new Date().toISOString() }).eq("id", operation.id);
      if (saved.error) throw new Error("Google export confirmation failed");
      return json({ documentId: fileId, url: `https://docs.google.com/document/d/${fileId}/edit` }, 200, headers);
    }
    throw new HttpError(400, "Invalid action");
  } catch (error) {
    return jsonError(error, headers);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
