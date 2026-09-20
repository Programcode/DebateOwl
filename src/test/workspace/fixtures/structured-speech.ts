import type { JSONContent } from "@tiptap/core";

export const STRUCTURED_SPEECH_TEXT = [
  "A fair transition",
  "English opening with café evidence",
  "Español: la niñez y la acción pública",
  "Magyar: árvíztűrő tükörfúrógép",
  "First response",
  "Nested reply",
  "Metric",
  "Value",
  "Access",
  "Equal",
] as const;

export const STRUCTURED_SPEECH: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[0] }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: `${STRUCTURED_SPEECH_TEXT[1]} ` },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com/evidence",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
                title: null,
              },
            },
          ],
          text: "source",
        },
        { type: "text", text: ". " },
        {
          type: "citation",
          attrs: {
            sourceId: "source-1",
            title: "Public evidence",
            locator: "p. 7",
            quote: "Equal access",
            href: "https://example.com/evidence",
          },
        },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[2] }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[3] }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[4] }],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: STRUCTURED_SPEECH_TEXT[5] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[6] }],
                },
              ],
            },
            {
              type: "tableHeader",
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[7] }],
                },
              ],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[8] }],
                },
              ],
            },
            {
              type: "tableCell",
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: STRUCTURED_SPEECH_TEXT[9] }],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ],
};
