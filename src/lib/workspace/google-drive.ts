import { z } from "zod";
import { supabase } from "@/lib/supabase/client";

const connectionSchema = z.object({
  account_label: z.string(),
  email: z.string(),
  id: z.string().uuid(),
  scopes: z.array(z.string()),
  status: z.enum(["active", "revoked"]),
});
export type GoogleConnection = z.infer<typeof connectionSchema>;

type GooglePickerBuilder = {
  addView(view: unknown): GooglePickerBuilder;
  build(): { setVisible(value: boolean): void };
  disableFeature(feature: string): GooglePickerBuilder;
  setCallback(callback: (data: Record<string, unknown>) => void): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
};

async function invoke<T>(name: "google-connections" | "workspace-google-docs", body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}

export async function listGoogleConnections() {
  const { data, error } = await supabase.from("google_connections")
    .select("account_label,email,id,scopes,status").eq("status", "active").order("created_at");
  if (error) throw error;
  return connectionSchema.array().parse(data ?? []);
}

export async function connectGoogleAccount(returnTo: string) {
  const result = await invoke<{ url: string }>("google-connections", { action: "authorize", returnTo });
  window.location.assign(result.url);
}

export async function disconnectGoogleAccount(connectionId: string) {
  await invoke("google-connections", { action: "disconnect", connectionId });
}

declare global {
  interface Window {
    gapi?: { load(name: string, callback: () => void): void };
    google?: {
      picker: {
        Action: { PICKED: string };
        DocsView: new (viewId: string) => { setMimeTypes(types: string): unknown };
        Feature: { MULTISELECT_ENABLED: string };
        PickerBuilder: new () => GooglePickerBuilder;
        Response: { ACTION: string; DOCUMENTS: string };
        ViewId: { DOCUMENTS: string };
      };
    };
  }
}

function loadPickerScript() {
  if (window.gapi) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Picker could not load"));
    document.head.appendChild(script);
  });
}

export async function pickGoogleDocument(connectionId: string) {
  const pickerKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;
  if (!pickerKey) throw new Error("Google Picker is not configured");
  const { accessToken } = await invoke<{ accessToken: string }>("google-connections", { action: "picker-token", connectionId });
  await loadPickerScript();
  await new Promise<void>((resolve) => window.gapi!.load("picker", resolve));
  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const picker = window.google!.picker;
    const view = new picker.DocsView(picker.ViewId.DOCUMENTS);
    view.setMimeTypes("application/vnd.google-apps.document");
    const built = new picker.PickerBuilder()
      .addView(view)
      .disableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(pickerKey)
      .setOAuthToken(accessToken)
      .setCallback((data) => {
        if (data[picker.Response.ACTION] !== picker.Action.PICKED) return;
        const selected = (data[picker.Response.DOCUMENTS] as Array<Record<string, unknown>> | undefined)?.[0];
        if (!selected?.id) reject(new Error("Google Picker returned no document"));
        else resolve({ id: String(selected.id), name: String(selected.name ?? "Google document") });
      })
      .build();
    built.setVisible(true);
  });
}

const importSchema = z.object({
  accountConnectionId: z.string().uuid(),
  modifiedTime: z.string().optional(),
  revision: z.union([z.string(), z.number()]).optional(),
  sourceUrl: z.string().url(),
  tabs: z.array(z.object({ markdown: z.string(), title: z.string() })).min(1),
  title: z.string(),
});

export async function importGoogleDocument(connectionId: string, fileId: string) {
  return importSchema.parse(await invoke("workspace-google-docs", { action: "import", connectionId, fileId }));
}

export async function exportGoogleDocument(input: { connectionId: string; markdown: string; requestId: string; title: string }) {
  return z.object({ documentId: z.string(), url: z.string().url() }).parse(await invoke("workspace-google-docs", { action: "export", ...input }));
}
