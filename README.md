# AI Debate Trainer

A comprehensive AI-powered assistant for competitive debaters.

## Features

*   **Case Generator:** Instantly create structured 4-6-6-3 debate cases.
*   **Case Attack:** Get ruthless critiques and cross-examination questions for your arguments.
*   **Coach Chat:** Interactive chat with context memory, file attachment support, and voice input.
*   **Debate Timer:** specialized stopwatch for Standard Tournament formats.
*   **History:** Save your best cases and chats to your local database.
*   **Admin Mode:** Unlock advanced settings and system prompt overrides.

## Getting Started

### Web Version
Visit [https://debate.pi-stack.org](https://debate.pi-stack.org) (if deployed).

### Local Development

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/Programcode/debate-navigator.git
    cd debate-navigator
    ```

2.  **Install:**
    ```bash
    npm install
    ```

3.  **Run:**
    ```bash
    npm run dev
    ```

4.  **Configure AI:**
    Go to **Settings** in the app. Enter your OpenAI, Anthropic, or Google Gemini API key.
    *Admin Code:* `debate2026` (Unlocks advanced features and pre-configured keys if set up).

## Deployment (Docker)

This app is designed to run anywhere using Docker.

1.  **Build:**
    ```bash
    docker build -t debate-trainer .
    ```

2.  **Run:**
    ```bash
    docker run -d -p 3000:80 --name debate-app debate-trainer
    ```

3.  **Secrets:**
    Secrets are handled via `public/config.js`. This file is mounted or copied into the container.
    *   **Development:** Edit `public/config.js` directly.
    *   **Production:** Mount a secure file:
        ```bash
        docker run -v $(pwd)/prod-config.js:/usr/share/nginx/html/config.js ...
        ```

## Tech Stack
*   React + Vite
*   TypeScript
*   Tailwind CSS
*   Zustand (State)
*   Docker + Nginx