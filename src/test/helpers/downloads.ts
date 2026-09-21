import { vi } from "vitest";

export interface CapturedDownload {
  blob: Blob;
  filename: string;
}

/**
 * Captures downloads triggered by the `URL.createObjectURL` + `<a download>`
 * path used across the export helpers, so tests can assert on filenames
 * without mocking a module.
 */
export function captureDownloads(): CapturedDownload[] {
  const downloads: CapturedDownload[] = [];
  let lastBlob: Blob | undefined;

  vi.spyOn(URL, "createObjectURL").mockImplementation((source: Blob | MediaSource) => {
    if (source instanceof Blob) lastBlob = source;
    return "blob:mock";
  });

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (!this.download) return;
    downloads.push({ blob: lastBlob ?? new Blob(), filename: this.download });
  });

  return downloads;
}
