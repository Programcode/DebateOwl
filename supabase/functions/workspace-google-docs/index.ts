import { HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { getGoogleAccessToken } from "../_shared/google-connections.ts";

const ORIGINS = ["https://debate.pi-stack.org", "http://localhost:8080", "http://localhost:18080"];
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
    const link = style.link && typeof style.link === "object" ? String((style.link as Record<string, unknown>).url ?? "") : "";
    return link && /^https?:\/\//i.test(link) ? `[${text}](${link})` : text;
  }).join("");
}

function structuralMarkdown(content: unknown[]) {
  const lines: string[] = [];
  for (const raw of content) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const paragraph = item.paragraph && typeof item.paragraph === "object" ? item.paragraph as Record<string, unknown> : null;
    if (paragraph) {
      const text = googleInline(Array.isArray(paragraph.elements) ? paragraph.elements : []);
      const style = paragraph.paragraphStyle && typeof paragraph.paragraphStyle === "object" ? paragraph.paragraphStyle as Record<string, unknown> : {};
      const named = String(style.namedStyleType ?? "");
      const heading = /^HEADING_(\d)$/.exec(named);
      const bullet = paragraph.bullet ? "- " : "";
      lines.push(`${heading ? `${"#".repeat(Number(heading[1]))} ` : bullet}${text}`);
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
          return structuralMarkdown(Array.isArray(cell.content) ? cell.content : []).replace(/\n+/g, " ").trim();
        }).join(" | ")} |`);
        if (rowIndex === 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      });
    }
  }
  return lines.join("\n");
}

function tabsMarkdown(document: Record<string, unknown>) {
  const tabs = Array.isArray(document.tabs) ? document.tabs : [];
  if (!tabs.length) {
    const body = document.body && typeof document.body === "object" ? document.body as Record<string, unknown> : {};
    return [{ title: String(document.title ?? "Google document"), markdown: structuralMarkdown(Array.isArray(body.content) ? body.content : []) }];
  }
  const output: Array<{ title: string; markdown: string }> = [];
  const visit = (raw: unknown) => {
    const tab = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const properties = tab.tabProperties && typeof tab.tabProperties === "object" ? tab.tabProperties as Record<string, unknown> : {};
    const content = tab.documentTab && typeof tab.documentTab === "object" ? tab.documentTab as Record<string, unknown> : {};
    const body = content.body && typeof content.body === "object" ? content.body as Record<string, unknown> : {};
    output.push({ title: String(properties.title ?? "Tab"), markdown: structuralMarkdown(Array.isArray(body.content) ? body.content : []) });
    if (Array.isArray(tab.childTabs)) tab.childTabs.forEach(visit);
  };
  tabs.forEach(visit);
  return output;
}

function markdownRequests(markdown: string) {
  const requests: Record<string, unknown>[] = [];
  let text = "";
  const paragraphs: Array<{ start: number; end: number; heading?: number; bullet?: boolean }> = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(rawLine);
    const bullet = /^\s*(?:[-+*]|\d+\.)\s+(.*)$/.exec(rawLine);
    const line = heading?.[2] ?? bullet?.[1] ?? rawLine;
    const plain = line.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/~~([^~]+)~~/g, "$1");
    const start = text.length + 1;
    text += `${plain}\n`;
    paragraphs.push({ start, end: text.length + 1, heading: heading?.[1].length, bullet: Boolean(bullet) });
  }
  requests.push({ insertText: { endOfSegmentLocation: {}, text } });
  for (const paragraph of paragraphs) {
    if (paragraph.heading) requests.push({ updateParagraphStyle: { fields: "namedStyleType", paragraphStyle: { namedStyleType: `HEADING_${paragraph.heading}` }, range: { startIndex: paragraph.start, endIndex: paragraph.end } } });
    if (paragraph.bullet) requests.push({ createParagraphBullets: { bulletPreset: "BULLET_DISC_CIRCLE_SQUARE", range: { startIndex: paragraph.start, endIndex: paragraph.end } } });
  }
  return requests;
}

Deno.serve(async (req) => {
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
        const createdResponse = await fetch("https://docs.googleapis.com/v1/documents", {
          body: JSON.stringify({ title }),
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          method: "POST",
        });
        const created = await createdResponse.json() as { documentId?: string };
        if (!createdResponse.ok || !created.documentId) throw new Error("Google document creation failed");
        fileId = created.documentId;
        await auth.adminClient.from("google_file_operations").update({ provider_file_id: fileId, updated_at: new Date().toISOString() }).eq("id", operation.id);
      }
      const currentResponse = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const current = await currentResponse.json() as { body?: { content?: Array<{ endIndex?: number }> } };
      const endIndex = current.body?.content?.at(-1)?.endIndex ?? 1;
      const requests = [
        ...(endIndex > 2 ? [{ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } }] : []),
        ...markdownRequests(markdown),
      ];
      const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}:batchUpdate`, {
        body: JSON.stringify({ requests }),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        method: "POST",
      });
      if (!updateResponse.ok) throw new Error("Google document formatting failed");
      await auth.adminClient.from("google_file_operations").update({ status: "complete", updated_at: new Date().toISOString() }).eq("id", operation.id);
      return json({ documentId: fileId, url: `https://docs.google.com/document/d/${fileId}/edit` }, 200, headers);
    }
    throw new HttpError(400, "Invalid action");
  } catch (error) {
    return jsonError(error, headers);
  }
});
