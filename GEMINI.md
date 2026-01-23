# Lovable Prototype - Debate Trainer

## Project Overview

This project is a React-based web application designed as a prototype for an "Innovation Fair" or "Debate Trainer". It provides a suite of AI-powered tools to assist users in debating and critical thinking tasks. The application is built using Vite, TypeScript, and Tailwind CSS.

### Key Features
*   **Generate:** Create structured debate cases with customizable parameters (side, format, role, etc.).
*   **Attack:** Generate counter-arguments or rebuttal points (inferred).
*   **Brainstorm:** Generate ideas and arguments.
*   **Factoids:** Retrieve relevant facts and statistics.
*   **Ask:** A chat interface for general AI interaction.
*   **Settings:** Configure AI providers (Mock, Lovable, OpenAI) and application preferences.

### Architecture
*   **Frontend Framework:** React 18 with TypeScript.
*   **Build Tool:** Vite.
*   **Styling:** Tailwind CSS with `shadcn-ui` components.
*   **State Management:** `zustand` for global state (settings, sessions) and persistence.
*   **Routing:** `react-router-dom`.
*   **Form Handling:** `react-hook-form` with `zod` schema validation.
*   **AI Integration:** A flexible abstraction layer (`src/lib/ai`) supporting multiple providers and per-feature configuration.
*   **Testing:** Vitest and React Testing Library.

## Building and Running

### Prerequisites
*   Node.js (LTS version recommended)
*   npm

### Commands

*   **Install Dependencies:**
    ```bash
    npm install
    ```

*   **Start Development Server:**
    ```bash
    npm run dev
    ```
    This starts the local development server (usually at http://localhost:5173).

*   **Build for Production:**
    ```bash
    npm run build
    ```
    Builds the application to the `dist` folder.

*   **Run Tests:**
    ```bash
    npm test
    ```
    Runs unit tests using Vitest.

*   **Lint Code:**
    ```bash
    npm run lint
    ```
    Runs ESLint to check for code quality issues.

## Development Conventions

### File Structure
*   `src/components/features/`: Contains feature-specific components (e.g., `generate/GenerateForm.tsx`). Each feature typically has its own directory.
*   `src/components/ui/`: Reusable UI components (buttons, inputs, cards) built with `shadcn-ui`.
*   `src/lib/ai/`: AI integration logic, including provider definitions (`providers/`), schemas (`schemas/`), and prompt templates (`prompts/`).
*   `src/lib/stores/`: Global state management using Zustand (e.g., `settings-store.ts`).
*   `src/pages/`: Top-level page components corresponding to routes.
*   `src/hooks/`: Custom React hooks (e.g., `use-mobile.tsx`, `use-toast.ts`).

### Coding Style
*   **Components:** Functional components using React hooks.
*   **Types:** Extensive use of TypeScript interfaces and types.
*   **Forms:** Use `react-hook-form` wrapped with `zod` resolvers for validation.
*   **Styling:** Utility-first CSS using Tailwind classes.

### AI Integration
The project uses a provider pattern for AI services. New providers can be added in `src/lib/ai/providers`. Each feature can be configured to use a specific provider and model via the Settings page, persisted in local storage.
