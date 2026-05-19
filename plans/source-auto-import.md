# Source Auto-Import — Implementation Plan

## Overview
Allow users to paste a URL and automatically extract, clean, and store the content in their Source Library for use in Active Grounding™ during AI generation.

## User Flow

1. User pastes a URL in the Library page (or a dedicated "Import URL" button)
2. System fetches the page, extracts main content (strips nav, ads, boilerplate)
3. Shows a preview of extracted content with title, word count, and source metadata
4. User confirms → content saved to Source Library
5. Source is immediately available for grounding in all AI features

## Architecture

### New/Modified Files
- `supabase/functions/import-source/index.ts` — Edge function that fetches + extracts
- `src/pages/LibraryPage.tsx` — Add URL import UI
- `src/lib/ai/schemas/source-import.ts` — Zod schema for import response
- `src/test/pages/LibraryPage-import.test.tsx` — Tests

### Edge Function: `import-source`
```typescript
// Input
{ url: string }

// Output
{
  title: string;
  content: string;       // Cleaned main text
  wordCount: number;
  author?: string;
  publishedDate?: string;
  domain: string;
  excerpt: string;       // First 200 chars
}
```

### Content Extraction Strategy
1. Fetch the URL with a timeout (10s)
2. Use a lightweight HTML-to-text approach:
   - Strip `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>` tags
   - Extract `<article>` or `<main>` content if present
   - Fall back to `<body>` with boilerplate removal
3. Extract metadata from `<meta>` tags (og:title, author, published_time)
4. Clean whitespace, limit to 50,000 chars max
5. Return structured response

### Alternative: Use Exa's content extraction
Since we already have Exa API integration for research, we could use Exa's `getContents` endpoint which does professional content extraction. This would be simpler and higher quality.

```typescript
// Using existing Exa integration
const response = await fetch('https://api.exa.ai/contents', {
  method: 'POST',
  headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls: [url] })
});
```

## UI Design

### Library Page Changes
- Add "Import URL" button next to "Add Source"
- URL input field with paste detection
- Loading state while fetching
- Preview card showing:
  - Title (editable)
  - Domain + publish date
  - Word count
  - Content preview (first 500 chars, expandable)
  - "Save to Library" / "Cancel" buttons

### Batch Import (Future)
- Allow pasting multiple URLs (one per line)
- Process in parallel with progress indicator
- Show success/failure per URL

## Security Considerations
- Rate limit: max 10 imports per hour per user
- URL validation: only http/https, no localhost/private IPs
- Content size limit: 50KB max extracted text
- Timeout: 10s fetch timeout
- Sanitize extracted content (no script injection)

## Integration with Existing System
- Imported sources get `type: 'url'` and `origin: <url>` in the Source Library
- They participate in Active Grounding™ the same as manually added sources
- The AI edge function already reads sources from the request body — no changes needed there

## Estimated Effort
- Edge function (import-source): 2 hours
- Library page UI changes: 2 hours
- Preview + confirmation flow: 1 hour
- Error handling + validation: 1 hour
- Tests: 1 hour
- **Total: ~7 hours**

## Dependencies
- Exa API key (already configured) OR custom HTML extraction
- No new npm packages needed (fetch is built into Deno edge runtime)
