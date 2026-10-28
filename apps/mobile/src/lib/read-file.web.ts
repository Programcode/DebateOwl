/** The web preview reads the browser File the picker hands back. */
export function readPickedText(asset: { uri: string; file?: Blob }): Promise<string> {
  return asset.file ? asset.file.text() : fetch(asset.uri).then((response) => response.text());
}
