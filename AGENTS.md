# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript app.
- `src/pages/` contains route-level screens (React Router).
- `src/components/` is shared UI and feature components; `src/components/ui/` is the shadcn/ui layer.
- `src/lib/` stores app logic (AI clients, stores, schemas); `src/hooks/` contains custom hooks.
- `src/test/` contains Vitest tests.
- `public/` holds static assets and runtime config like `config.js` (not committed).

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server (port 8080).
- `npm run build` creates a production build in `dist/`.
- `npm run build:dev` builds with development mode and source maps.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint across the repo.
- `npm test` runs Vitest once; `npm run test:watch` runs in watch mode.
- `docker build -t debate-trainer .` builds the container; `docker run -d -p 3001:80 --name debate-app debate-trainer` serves it.

## Coding Style & Naming Conventions
- TypeScript + React with 2-space indentation (match existing files).
- Use named exports by default, and `@/` alias for `src/` imports.
- File naming: `PascalCase.tsx` for components, `kebab-case.ts` for utilities.
- TailwindCSS for styling; avoid ad-hoc inline styles.
- Keep ESLint clean (`npm run lint`).

## Testing Guidelines
- Framework: Vitest + Testing Library (jsdom).
- Test files use `*.test.ts`/`*.test.tsx` (example: `src/test/example.test.ts`).
- Run a single test with `npm test -- path/to/file.test.tsx`.

## Commit & Pull Request Guidelines
- Commit messages are short and descriptive; common prefixes include `feat:`, `fix:`, and `WIP:`.
- PRs should include: summary of changes, testing notes, and screenshots for UI changes.
- Link relevant issues or tasks when available.

## Configuration & Secrets
- Runtime keys live in `public/config.js` (loaded via `index.html`).
- Do not commit API keys; use `window.env` in `config.js` for deployments.
