// Globals that both browsers and React Native's Hermes provide but the ES lib
// does not declare. Declare only what package code uses; never add DOM types.
declare function setTimeout(callback: () => void, ms?: number): number;
declare function clearTimeout(id: number | undefined): void;

declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

declare const console: {
  warn(...data: unknown[]): void;
};

declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
  readonly protocol: string;
  readonly host: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}

// WHATWG URL parameters are also available in Hermes.
declare class URLSearchParams {
  constructor(init?: string);
  append(name: string, value: string): void;
  get(name: string): string | null;
  set(name: string, value: string): void;
  forEach(callback: (value: string, key: string) => void): void;
  toString(): string;
}
