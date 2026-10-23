// The testing agent marks Anthropic prompt-cache breakpoints on the system
// prompt and on the newest message. @openrouter/ai-sdk-provider sends a tool
// message as one OpenRouter message per tool result and copies the message's
// breakpoint onto each, so an actor turn with parallel tool calls asks
// Anthropic for more than its limit of four breakpoints and the call fails
// ("A maximum of 4 blocks with cache_control may be provided"). Moving the
// breakpoint onto the last tool result keeps one per message, which caches
// the same prefix.

type Options = Record<string, Record<string, unknown> | undefined>;
type Part = { providerOptions?: Options } & Record<string, unknown>;
type Message = { role: string; content: unknown; providerOptions?: Options };
type CallOptions = { prompt: Message[] } & Record<string, unknown>;

export function oneBreakpointPerToolMessage(message: Message): Message {
  if (message.role !== "tool" || !Array.isArray(message.content) || message.content.length < 2) return message;
  const anthropic = message.providerOptions?.anthropic;
  const breakpoint = anthropic?.cacheControl ?? anthropic?.cache_control;
  if (!anthropic || breakpoint === undefined) return message;
  const { cacheControl: _camel, cache_control: _snake, ...rest } = anthropic;
  const parts = message.content as Part[];
  const last = parts.length - 1;
  return {
    ...message,
    providerOptions: { ...message.providerOptions, anthropic: rest },
    content: parts.map((part, index) =>
      index === last
        ? { ...part, providerOptions: { ...part.providerOptions, anthropic: { ...part.providerOptions?.anthropic, cacheControl: breakpoint } } }
        : part,
    ),
  };
}

/** The same model, with every call's prompt passed through oneBreakpointPerToolMessage. */
export function withAnthropicCacheLimit<M extends object>(model: M): M {
  const fix = (options: CallOptions): CallOptions => ({ ...options, prompt: options.prompt.map(oneBreakpointPerToolMessage) });
  return new Proxy(model, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if ((property === "doGenerate" || property === "doStream") && typeof value === "function") {
        return (options: CallOptions) => value.call(target, fix(options));
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
