# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DebateLab is an AI-powered debate preparation suite for competitive debaters. It's a pure frontend React application with no backend, using multi-provider AI integration (OpenAI, Anthropic, Google Gemini) and localStorage for persistence. The app supports five main features: Case Generator, Attack Mode, Brainstorm, Factoids (evidence research), and Coach Chat.

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server on port 8080
npm run build           # Production build to dist/
npm run build:dev       # Development build with source maps

# Quality
npm run lint            # Run ESLint
npm test                # Run tests once with Vitest
npm run test:watch      # Run tests in watch mode

# Preview
npm run preview         # Preview production build locally

# Docker
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app debate-trainer
```

## Architecture Overview

### State Management (Zustand)

Two main stores with localStorage persistence:

**Session Store** (`src/lib/stores/session-store.ts`):
- Storage key: `debate-trainer-storage`
- Active results for each feature (generateResult, attackResult, brainstormResult, factoidsResult, askMessages)
- History arrays (savedCases, savedAttacks, savedBrainstorms, savedFactoids, savedChats)
- Source Library with toggle states for knowledge base grounding
- Actions: setGenerateResult(), saveCurrentCase(), deleteSavedCase(), etc.

**Settings Store** (`src/lib/stores/settings-store.ts`):
- Storage key: `debate-trainer-settings`
- Per-feature AI provider configuration (ProviderConfig for each of 5 features)
- API key management with 2-tier fallback: user keys → system keys (from window.env)
- Admin mode (code: `debate2026`) auto-upgrades features to Gemini 3 Flash
- Custom system prompt support
- Theme, language, and global settings

### AI Integration Layer

**Unified Dispatcher Pattern** (`src/lib/ai/client.ts`):

The core is `dispatchAI()` which handles:
1. **Knowledge Base Injection**: Prepends active sources from sourceLibrary to system prompt
2. **Custom Prompt Merging**: Combines user custom prompts with technical instructions
3. **Provider Routing**: Routes to callOpenAI(), callAnthropic(), or callGoogle()
4. **Error Handling**: Unified error messages across providers

**Feature Functions**:
Each feature (generateCase, attackCase, brainstorm, factoids, askChat) follows this pattern:
1. Check for mock mode
2. Build system prompt with format requirements
3. Build user prompt with feature-specific parameters
4. Call dispatchAI() with configuration
5. Return typed output (validated by Zod schemas in `src/lib/ai/schemas/`)

**Provider Handlers**:
- `callOpenAI()`: Uses `response_format: { type: "json_object" }` for structured output
- `callAnthropic()`: Extracts JSON from response text with regex fallback
- `callGoogle()`: Maps messages to Gemini format (user/model roles)

**Web Integration** (Jina AI):
- `callJinaReader()`: Extracts content from URLs (used in Ask Chat for automatic URL fetching)
- `callJinaSearch()`: Performs web searches (used in Factoids for evidence research)

### Feature Organization

Five main features under `src/components/features/`:
- **generate/**: Case generation with contentions and counters
- **attack/**: Critical analysis with fallacy detection
- **brainstorm/**: Idea generation (mindmap/buckets/topfive modes)
- **factoids/**: Evidence research with web search
- **ask/**: Coach chat with conversation history

Each feature follows the pattern:
- `FeaturePage.tsx`: Container component with routing
- `FeatureForm.tsx`: Input form with react-hook-form + Zod validation
- `FeatureResults.tsx`: Structured output display

### Data Persistence

All data stored in browser localStorage via Zustand persist middleware:

**Saved Items Structure**:
```typescript
interface SavedItem<T> {
  id: string;           // Random 7-char ID
  data: T;              // Feature output (GenerateOutput, etc.)
  createdAt: number;    // Unix timestamp
  title: string;        // User-provided name
}
```

**Source Structure**:
```typescript
interface Source {
  id: string;
  title: string;
  content: string;
  type: 'url' | 'file' | 'text';
  origin?: string;
  createdAt: number;
  isActive: boolean;    // Toggle for grounding
}
```

No database - everything persists in browser storage.

## Key Patterns and Conventions

### Runtime Configuration Pattern

**Critical for Deployment**: API keys are NOT baked into the Docker image.

`public/config.js` is loaded at runtime via `<script>` tag in `index.html`:
```javascript
window.env = {
  VITE_OPENAI_API_KEY: "sk-...",
  VITE_GOOGLE_API_KEY: "AIza...",
  VITE_ANTHROPIC_API_KEY: "sk-ant...",
  VITE_JINA_API_KEY: "jina_..."
};
```

This enables:
- Updating keys without rebuilding Docker images
- Volume mounting config.js for different environments
- Admin mode fallback to system keys

The nginx.conf explicitly disables caching for `/config.js` to ensure updates are picked up.

### Knowledge Base Grounding System

Active sources (where `isActive: true`) are automatically prepended to ALL AI requests:

```
LOCAL KNOWLEDGE BASE (Use this information as your primary factual source):
--- SOURCE: [title] ([origin]) ---
[content]
```

This allows users to ground AI responses in specific research. Toggle sources in the Library page.

### Provider Config and API Key Management

Each feature has a ProviderConfig:
```typescript
interface ProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mock';
  model: string;
  temperature: number;
  apiKey: string;
}
```

Key resolution order:
1. User-provided key (entered in Settings)
2. System key from `window.env` (if admin mode enabled)
3. Error if neither available

Admin code `debate2026` in Settings unlocks:
- System key fallback
- Auto-upgrade all features to Gemini 3 Flash
- Global custom system prompt
- Database reset option

### Component Library

Uses shadcn/ui components (45+ from @radix-ui) with TailwindCSS. Components are in `src/components/ui/`. The project uses the `@/` path alias for imports.

### Testing

Vitest with @testing-library/react. Tests use jsdom environment. Run single test:
```bash
npm test -- path/to/test.spec.tsx
```

## Docker Deployment

**Two-stage build**:
1. Node:20-alpine builder: `npm ci` → `npm run build` → produces `dist/`
2. nginx:alpine runtime: serves static files from `/usr/share/nginx/html`

**Nginx Configuration** (`nginx.conf`):
- SPA routing: `try_files $uri $uri/ /index.html`
- `/config.js`: no cache (allows runtime updates)
- `.js/.css`: 1-year cache (Vite adds content hashes)
- Port 80 exposed

**Deployment Pattern**:
```bash
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app --restart unless-stopped debate-trainer
```

For Raspberry Pi: Use Watchtower for auto-updates from Docker Hub. Expose via Cloudflare Tunnel (see DEPLOYMENT.md).

## Critical Files

- **AI Layer**: `src/lib/ai/client.ts` - All AI integration logic
- **State**: `src/lib/stores/session-store.ts`, `src/lib/stores/settings-store.ts`
- **Schemas**: `src/lib/ai/schemas/` - Zod validation for all feature inputs/outputs
- **Routing**: `src/App.tsx` - React Router v6 setup
- **Config**: `public/config.js` - Runtime API keys (not in git, created at deploy time)
- **Deployment**: `Dockerfile`, `nginx.conf` - Container setup

## Development Notes

- Dev server runs on port 8080 with IPv6 support (`::`).
- HMR overlay disabled for better UX.
- TypeScript with relaxed strictness (not full strict mode).
- ESLint configured with React hooks and React Refresh plugins.
- Path alias: `@/*` maps to `./src/*`.
- Component tagging enabled in dev mode (lovable-tagger integration).

## Localization

The app supports English and Spanish. Text constants are in components, not a separate i18n file. Settings store maintains `language` state ('en' | 'es').
