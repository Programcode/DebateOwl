# AI Debate Trainer - Project Overview

## Project Description
The AI Debate Trainer is a React-based web application designed to help debaters improve their skills through AI-powered case generation, argument analysis, and interactive coaching. It features a modern UI, real-time speech recognition, a dedicated debate timer, and persistent history.

**Live Demo:** [https://debate.pi-stack.org](https://debate.pi-stack.org) (Assuming successful Pi deployment)

## Key Features

### 1. Generate Case
*   Creates structured debate cases (Thesis, Contentions, Rebuttals).
*   Supports the "Standard Tournament" format (4-6-6-3 speeches).
*   **Save to History:** Persist generated cases for later review.

### 2. Attack Case
*   Analyzes user-provided arguments to find logical fallacies and weak points.
*   Provides "Cross-Ex" questions to ask opponents.

### 3. Ask Coach (Chat)
*   **Context-Aware:** Remembers conversation history for natural follow-ups.
*   **File Analysis:** Supports attaching `.txt`, `.md`, and `.json` files to ask questions about specific documents.
*   **Voice Input:** Integrated Speech-to-Text for dictating questions.
*   **Save Chat:** Persist conversation threads.

### 4. Tools
*   **Debate Timer:** Dedicated stopwatch with presets for Introductor (4m), R1 (6m), R2 (6m), and Conclusor (3m).
*   **Brainstorm:** Idea generation tool for motion analysis.
*   **Factoids:** Evidence search (simulated/AI-based).

### 5. Admin & Settings
*   **System Keys:** Support for pre-configured API keys via `config.js` (Runtime Config).
*   **Admin Panel:** Unlockable via code (`debate2026`).
    *   **Prompt Override:** Inject custom global instructions into the AI.
    *   **Database Reset:** Clear all local history.
    *   **Auto-Authentication:** Admin users bypass manual key entry.

## Architecture

*   **Frontend:** React 18, Vite, TypeScript.
*   **Styling:** Tailwind CSS, shadcn/ui.
*   **State Management:** Zustand (with `persist` middleware for LocalStorage).
*   **AI Integration:** Custom client (`src/lib/ai/client.ts`) utilizing standard `fetch` for OpenAI, Anthropic, and Google Gemini APIs.
*   **Deployment:** Dockerized with Nginx. Supports Runtime Configuration for secrets.

## Development

### Prerequisites
*   Node.js 20+
*   Docker (optional, for containerization)

### Local Setup
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start development server:
    ```bash
    npm run dev
    ```

### Configuration (`public/config.js`)
To avoid baking secrets into the build, the app reads from `window.env` defined in `public/config.js`.
```javascript
window.env = {
  VITE_OPENAI_API_KEY: "sk-...",
  VITE_GOOGLE_API_KEY: "AIza...",
  VITE_ANTHROPIC_API_KEY: "sk-ant..."
};
```

## Deployment

### Docker Build
```bash
docker build -t debate-trainer .
```

### Docker Run
```bash
docker run -d -p 3000:80 --name debate-app --restart unless-stopped debate-trainer
```

### Raspberry Pi (ARM64)
The Dockerfile is compatible with ARM64 architecture.
1.  Transfer source code to Pi.
2.  Build and run locally on the Pi.
3.  Expose via Cloudflare Tunnel.