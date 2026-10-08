// Globals that both browsers and React Native's Hermes provide but the ES lib
// does not declare. Declare only what package code uses; never add DOM types.
declare const console: {
  warn(...data: unknown[]): void;
};

declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
  readonly protocol: string;
}
