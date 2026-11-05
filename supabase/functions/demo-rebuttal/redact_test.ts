import { assertEquals } from "jsr:@std/assert@1.0.19";
import { redactPersonalData } from "./redact.ts";

Deno.test("contact details, links, handles and introduced names are removed", () => {
  const cases: Array<[string, string]> = [
    ["Write to anna.k@example.com today.", "Write to [email removed] today."],
    ["See https://example.com/a?b=1 and www.school.hu.", "See [link removed] and [link removed]"],
    ["My school blog is kovacs-debate.com/posts.", "My school blog is [link removed]"],
    ["Buy now at cheap-pills.xyz today", "Buy now at [link removed] today"],
    ["Visit best.shop.online for deals", "Visit [link removed] for deals"],
    ["Go to EVIL.COM, Evil.Com/path or cheap-pills.XYZ", "Go to [link removed], [link removed] or [link removed]"],
    ["Follow @debate_anna for more.", "Follow [handle removed] for more."],
    ["Call +36 30 123 4567 or 555-123-4567.", "Call [number removed] or [number removed]."],
    ["My name is Anna Kovács and I think", "My name is [name removed] and I think"],
    ["my name is anna kovács and I think", "my name is [name removed] and I think"],
    ["MY NAME IS ANNA, and", "MY NAME IS [name removed], and"],
    ["Visit пример.рф now", "Visit [link removed] now"],
    ["See example.भारत today", "See [link removed] today"],
    ["Call me Anna Kovács, I argue", "Call me [name removed], I argue"],
    ["Call me A\u0301ron Szabo, I argue", "Call me [name removed], I argue"],
    ["my name is a\u0301ron szabo and", "my name is [name removed] and"],
    ["My key is sk-ant-abcdef123456 ok", "My key is [key removed] ok"],
    ["Hola, me llamo Lucía Pérez y creo", "Hola, me llamo [name removed] y creo"],
    ["Szia, a nevem Péter, és szerintem", "Szia, a nevem [name removed], és szerintem"],
    ["As Mr Smith told our class,", "As [name removed] told our class,"],
    ["La Sra. García dice que", "La [name removed] dice que"],
  ];
  for (const [input, expected] of cases) assertEquals(redactPersonalData(input).text, expected, input);
});

Deno.test("ordinary debate content is left alone", () => {
  for (const text of [
    "Between 1990-2020 the rate fell by 45%, and in 2019 alone 3,000 schools changed policy.",
    "Social media e.g. Instagram harms sleep; studies in the U.K. and U.S. agree.",
    "Call me old-fashioned, but homework works.",
    "A 10 000 student survey is not proof.",
  ]) {
    assertEquals(redactPersonalData(text), { text, redactions: 0 }, text);
  }
});
