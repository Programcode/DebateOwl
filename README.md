# DebateLab

The ultimate AI-powered research and preparation suite for competitive debaters.

## 🚀 Key Features

*   **Case Generator:** Build complete cases for the standard 4-6-6-3 tournament format.
*   **Attack Mode:** Get ruthless critiques, fallacy detection, and cross-ex questions.
*   **Source Library:** Build a local "Knowledge Base" of articles and research for the AI to use.
*   **Factoids:** Active web search for real evidence with clickable source links.
*   **Coach Chat:** Advanced interactive coaching with voice input and file analysis.
*   **Word Export:** Download your preparation as professionally formatted `.docx` documents.
*   **Debate Timer:** specialized stopwatch for tournament speech intervals.

## 🛠️ Setup

### Local Development
1.  `npm install`
2.  `npm run dev`
3.  Go to **Settings** -> Enter Admin Code `debate2026` to unlock system keys (if configured) or add your own.

### Docker Deployment
The project is optimized for deployment on Raspberry Pi or any VPS.
```bash
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app debate-trainer
```

## 🔒 Secrets & Admin
*   **Runtime Config:** Add keys to `public/config.js` to avoid rebuilding images when keys change.
*   **Admin Code:** `debate2026`
*   **Grounding:** Enable sources in the **Library** tab to make the AI use specific data.

## 🌐 Live Access
Managed via Cloudflare Tunnel. Default local port is `3001`.
