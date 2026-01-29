# DebateLab - Project Overview

## Project Description
DebateLab is a comprehensive AI-powered research and preparation suite for competitive debaters. It combines advanced large language models with real-time web search and document analysis to help users build, critique, and practice debate cases.

**Live URL:** [https://debate.pi-stack.org](https://debate.pi-stack.org)

## Key Features

### 1. Source Library & Deep Grounding (New)
*   **Persistent Knowledge Base:** Save URLs, text snippets, and assistant responses to a local library.
*   **Active Grounding:** Active sources are automatically injected into the AI's context for all features, ensuring the AI "remembers" your research.
*   **URL Reading:** Powered by Jina Reader (`r.jina.ai`) to extract clean text from any web page or PDF link.

### 2. Case Generation & Export
*   **Tournament Ready:** Generates cases for the 4-6-6-3 speech format.
*   **Word Export:** Download your generated cases as professionally formatted `.docx` files.
*   **Context Transfer:** Use the "Discuss" button to move any result into the Chat for follow-up coaching.

### 3. Argument Analysis (Attack)
*   Ruthless critique of case logic, evidence, and structural weaknesses.
*   **Judge Paradigms:** Choose between Logic-Heavy, Values-Focused, or Policy-based analysis.
*   **Fallacy Detection:** Automatic identification of logical errors.

### 4. Interactive Coaching (Ask)
*   **Summarized Context:** Intelligent memory management that summarizes older messages while keeping the last 20 verbatim to prevent confusion.
*   **Voice & Files:** Supports real-time speech-to-text and file attachments for a multimodal experience.

### 5. Research Tools
*   **Factoids:** Active web search (via Jina Search) to find real, verifiable evidence with clickable citations.
*   **Brainstorm:** Multi-mode ideation (Mindmap, Buckets, Top 5) for motion analysis.
*   **Timer:** Dedicated debate stopwatch with role-specific presets.

## Architecture & Deployment

*   **Runtime Config:** API keys are managed via `public/config.js` at runtime, allowing for a simplified Docker build process.
*   **Admin Panel:** Code `debate2026` unlocks prompt overrides and database reset tools.
*   **Persistent State:** Zustand + LocalStorage keeps all data (history, library, settings) safe across sessions.
*   **CI/CD:** Automated builds via GitHub Actions pushing to Docker Hub, with Watchtower auto-updating the Raspberry Pi deployment.

## Deployment Commands
```bash
# Build
docker build -t debate-trainer .

# Run
docker run -d -p 3001:80 --name debate-app --restart unless-stopped debate-trainer
```
