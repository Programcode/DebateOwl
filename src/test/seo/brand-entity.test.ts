import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import site from "@/config/site.json";
import { BUILT_IN_FORMATS, questioningSegments, speakingSegments } from "@/lib/free-tools/formats";
import { organizationNode } from "@/lib/seo/pages";

// The generated guides in public/<slug>/index.html (scripts/generate_seo_content.py).
const PUBLIC = resolve(process.cwd(), "public");
const guides = readdirSync(PUBLIC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      return [{ slug: entry.name, html: readFileSync(resolve(PUBLIC, entry.name, "index.html"), "utf8") }];
    } catch {
      return [];
    }
  });
const guide = (slug: string) => guides.find((page) => page.slug === slug)!.html;
const graphOf = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])["@graph"];
const headOf = (html: string) => html.slice(0, html.indexOf("<body"));
const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("brand entity", () => {
  it("names the Organization for the product, with Pi-Stack as its parent and not a sameAs", () => {
    const node = organizationNode();
    expect(node).toMatchObject({
      "@id": `${site.origin}/#organization`,
      name: "DebateOwl",
      alternateName: "Debate Owl",
      url: `${site.origin}/`,
      logo: { "@type": "ImageObject", url: `${site.origin}/icon-512.png`, width: 512, height: 512 },
      parentOrganization: { "@type": "Organization", name: "Pi-Stack", url: "https://pi-stack.org/" },
    });
    // Only profiles that spell the name "DebateOwl" belong here, so the list may be empty; then the key is left out.
    const sameAs: string[] = site.organization.sameAs;
    expect(node).toEqual(sameAs.length ? expect.objectContaining({ sameAs }) : expect.not.objectContaining({ sameAs: expect.anything() }));
    expect(sameAs).not.toContain("https://pi-stack.org/");
  });

  it("finds the guides", () => {
    expect(guides.length).toBeGreaterThan(20);
  });

  it("gives every guide the icon links, the DebateOwl author and no Pi-Stack", () => {
    for (const { slug, html } of guides) {
      const head = headOf(html);
      expect(head, slug).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
      expect(head, slug).toContain('<link rel="icon" type="image/png" href="/icon-192.png" sizes="192x192" />');
      expect(head, slug).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />');
      expect(head, slug).toContain('<meta name="author" content="DebateOwl" />');
      expect(html, slug).not.toContain("Pi-Stack");
    }
  });

  it("credits every Article to the DebateOwl organization and links the brand name home", () => {
    for (const { slug, html } of guides) {
      const article = graphOf(html).find((node: { "@type": string }) => node["@type"] === "Article");
      for (const key of ["author", "publisher"]) {
        expect(article[key], `${slug} ${key}`).toMatchObject({ "@id": `${site.origin}/#organization`, name: "DebateOwl" });
      }
      expect(html, slug).toMatch(/<aside[^>]*aria-labelledby="about"[^>]*><h2 id="about">About DebateOwl<\/h2><p><a href="\/">DebateOwl<\/a>/);
      expect(html, slug).toContain('By the <a href="/">DebateOwl team</a>');
    }
  });

  it("names DebateOwl in the first answer sentence of the case generator and coach guides", () => {
    for (const slug of ["ai-debate-case-generator", "ai-debate-coach"]) {
      const answer = textOf(guide(slug).match(/<section class="answer"[\s\S]*?<p>([\s\S]*?)<\/p>/)![1]);
      const first = answer.split(/(?<=[.;])\s/).slice(0, 2).join(" ");
      expect(first, slug).toContain("DebateOwl's");
    }
  });
});

describe("speech times on /online-debate-timer", () => {
  const html = guide("online-debate-timer");
  const table = html.match(/<table><caption>Debate speech times by format[\s\S]*?<\/table>/)?.[0] ?? "";
  const rows = [...table.matchAll(/<tr>(<td[\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => textOf(cell)));

  it("lists every timer format in the timer's order", () => {
    expect(rows.map((row) => row[0])).toEqual(BUILT_IN_FORMATS.map((format) => format.name));
  });

  it("states the same speeches, questioning and prep as the free timer", () => {
    BUILT_IN_FORMATS.forEach((format, index) => {
      const [, speeches, questioning, prep] = rows[index];
      const expected = speakingSegments(format).map((segment) => `${segment.short}: ${segment.seconds / 60}`).join(", ");
      expect(speeches, format.id).toBe(format.graceSeconds ? `${expected} (${format.graceSeconds} s grace)` : expected);
      const periods = questioningSegments(format);
      expect(questioning.startsWith(periods.length ? `${periods.length} × ` : "None"), format.id).toBe(true);
      expect(prep, format.id).toBe(format.prepSeconds ? `${format.prepSeconds / 60} min` : "None in round");
    });
  });

  it("points at the timer itself in the first sentence under the H1", () => {
    expect(html).toMatch(/<p class="lead">Need the timer itself\? The free DebateOwl debate timer at <a href="\/tools\/debate-timer">/);
  });
});
