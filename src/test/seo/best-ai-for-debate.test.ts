import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import site from "@/config/site.json";

const html = readFileSync(resolve(process.cwd(), "public/best-ai-for-debate/index.html"), "utf8");
const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])["@graph"] as {
  "@type": string;
  mainEntity?: { name: string; acceptedAnswer: { text: string } }[];
  itemListElement?: { name?: string; url?: string; position: number }[];
  dateModified?: string;
  headline?: string;
}[];
const byType = (type: string) => graph.find((node) => node["@type"] === type)!;

function decode(text: string): string {
  return text
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const PRICING_SENTENCE = "The DebateOwl app has no free plan (3-day free trial, then $5/month); the separate tools at /tools are free with no account.";

describe("/best-ai-for-debate", () => {
  it("uses the specified title, question, description and canonical URL", () => {
    expect(html).toContain("<title>Which AI Is Best for Debate? (2026 Guide) | DebateOwl</title>");
    expect(html).toContain("<h1>Which AI is best for debate?</h1>");
    expect(html).toContain('<link rel="canonical" href="https://debateowl.com/best-ai-for-debate" />');
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    expect(description).toBe("The best AI for debate depends on your goal. Claude and ChatGPT for sparring, SchoolAI for classrooms, and dedicated tools for rounds and case prep.");
    expect(description.length).toBeLessThanOrEqual(155);
    expect(html).toContain('By the <a href="/">DebateOwl team</a> · Updated <time datetime="2026-10-29">October 29, 2026</time>');
    expect(html).toContain("DebateOwl makes one of the tools on this list. Facts about other products come from their own websites as of October 2026. Check them before you pay.");
  });

  it("puts the direct answer in a plain paragraph and states the pricing sentence", () => {
    const visible = decode(html);
    expect(visible).toContain('<p id="short-answer" class="direct">There\'s no single best AI for debate.');
    expect(html).not.toContain('class="answer"');
    expect(visible).toContain(PRICING_SENTENCE);
    expect(site.freePlan.replaceAll("{{product}}", "DebateOwl").replaceAll("{{trialDays}}", "3").replaceAll("{{proMonthly}}", "5")).toBe(PRICING_SENTENCE);
    expect(html).not.toMatch(/\b(framework|contention|warrant)s?\b/i);
  });

  it("publishes FAQPage, ItemList and BreadcrumbList that match the page", () => {
    expect(graph.map((node) => node["@type"])).toEqual(["Article", "FAQPage", "ItemList", "BreadcrumbList"]);
    expect(byType("Article").headline).toBe("Which AI is best for debate?");
    expect(byType("Article").dateModified).toBe("2026-10-29");
    const visible = decode(html);
    const faqs = byType("FAQPage").mainEntity ?? [];
    expect(faqs.map((entry) => entry.name)).toEqual([
      "Which AI is best for debate?",
      "Is ChatGPT or Claude better for debate practice?",
      "What is the best AI debate app for students?",
      "Is there a free AI for debate practice?",
      "What does a DebateOwl case include?",
      "Can AI replace practicing with real people?",
    ]);
    for (const entry of faqs) {
      expect(visible).toContain(entry.name);
      expect(visible).toContain(entry.acceptedAnswer.text);
    }
    expect(byType("ItemList").itemListElement?.map((item) => [item.name, item.url])).toEqual([
      ["Claude", "https://claude.ai"],
      ["ChatGPT", "https://chatgpt.com"],
      ["DebateOwl", "https://debateowl.com/"],
      ["SchoolAI", "https://schoolai.com"],
      ["Debate Ladder", "https://debateladder.com"],
      ["ArguFight", "https://argufight.com"],
      ["HyperWrite Debate Assistant", "https://hyperwriteai.com/aitools/debate-assistant"],
      ["PublicForumAI", "https://publicforumai.com"],
    ]);
    expect(byType("BreadcrumbList").itemListElement?.map((item) => item.name)).toEqual(["Home", "Best AI for debate"]);
  });
});
