export function getWebAppRedirectUrl(path = '/app'): string {
  return `${window.location.origin}${path}`;
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

function getSafeExternalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to open a malformed URL.');
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Refusing to open an unsupported URL scheme: ${parsed.protocol}`);
  }

  return parsed.toString();
}

export async function openExternalUrl(url: string, { newWindow = false }: { newWindow?: boolean } = {}): Promise<void> {
  const safeUrl = getSafeExternalUrl(url);

  if (newWindow) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  window.location.assign(safeUrl);
}
