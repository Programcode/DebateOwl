// Plain-text helpers for prompts and provider output.

export function truncateTextToBudget(text: string, budget: number): { text: string; truncated: boolean } {
  if (budget <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= budget) return { text, truncated: false };
  return { text: text.slice(0, budget) + "\n[Context truncated to fit request limits.]", truncated: true };
}

export function cleanGeneratedText(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[—–]/g, ", ")
      .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (Array.isArray(value)) return value.map(cleanGeneratedText);
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cleaned[key] = cleanGeneratedText(child);
    }
    return cleaned;
  }
  return value;
}

export function extractUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []).map((url) => url.replace(/[),.;!?]+$/g, ""));
}

// Dynamic date context for prompts - ensures AI knows the current year
export function getCurrentDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  return `CURRENT DATE: ${now.toLocaleDateString('en-US', options)} (${now.getFullYear()})`;
}
