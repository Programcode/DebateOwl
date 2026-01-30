# DebateLab - Project Overview

## Project Description
DebateLab is a comprehensive AI-powered research and preparation suite for competitive debaters. It combines advanced large language models with real-time web search and document analysis to help users build, critique, and practice debate cases.

**Live URL:** [https://debate.pi-stack.org](https://debate.pi-stack.org)

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   React App     │───▶│ Supabase Edge   │───▶│  AI Providers    │
│   (Vite/TS)     │    │   Functions     │    │  OpenAI/Google   │
└─────────────────┘    └─────────────────┘    └──────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│   Nginx/Docker  │    │ Supabase Auth   │
│   (Production)  │    │  (Google OAuth) │
└─────────────────┘    └─────────────────┘
```

**Stack:**
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend:** Supabase Edge Functions (Deno)
- **Auth:** Supabase Auth with Google OAuth
- **AI Providers:** OpenAI, Google Gemini (via Edge Function)
- **Deployment:** Docker + Nginx + Cloudflare Tunnel + Watchtower

## Key Features

### 1. Source Library & Deep Grounding
- **Persistent Knowledge Base:** Save URLs, text snippets, and AI responses to a library
- **Active Grounding:** Active sources are injected into AI context
- **URL Reading:** Jina Reader extracts clean text from web pages

### 2. Case Generation & Export
- **Tournament Ready:** 4-6-6-3 speech format
- **Word Export:** Download as formatted `.docx` files
- **Context Transfer:** "Discuss" button sends results to Coach Chat

### 3. Argument Analysis (Attack)
- Ruthless critique with fallacy detection
- Judge paradigms: Logic-Heavy, Values-Focused, Policy-based

### 4. Interactive Coaching (Ask)
- Summarized context for long conversations
- Voice input and file attachments

### 5. Research Tools (Factoids)
- Deep web search with Jina AI
- Multi-round research with AI query refinement
- URL verification

## Security Model

- **API Keys:** Stored as Supabase Edge Function secrets (never exposed to browser)
- **Authentication:** JWT tokens via Supabase Auth
- **Input Sanitization:** Prompt injection detection in Edge Function
- **Nginx Hardening:** CSP headers, blocks sensitive files

## Deployment Commands

```bash
# Build
docker build -t debate-trainer .

# Run
docker run -d -p 3001:80 --name debate-app --restart unless-stopped debate-trainer
```

## Admin Access
Code `debate2026` in Settings unlocks:
- Global system prompt override
- Database reset tools
