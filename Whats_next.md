# What's Next: Prioritized Developer Roadmap

This document details the features selected for the next phase of development, prioritized by strategic importance.

## 1. Short Term (Weeks 1-4)

### 1.1 Usage Analytics Dashboard (Admin Insight)
**Goal:** Visualize platform health, costs, and user engagement.
**Why:** Admins need to track Token usage and error rates to manage costs.

**Technical Implementation:**
- **UI:** Add "Analytics" tab to `AdminPage`.
- **Charts:** Use `recharts` for visual data (Bar/Line charts).
- **Data:**
  - `ai_requests` table query with `count()` grouped by day.
  - New RPC function `get_daily_usage` for performance.
- **Metrics:** Total Requests, Token Usage (est), Error Rate, Active Users.

### 1.2 Onboarding Tutorial (Activation)
**Goal:** Walk new users through their first generic case generation.
**Why:** Complex UI can overwhelm first-time visitors.
~~~~`
**Technical Implementation:**
- **Library:** Install `react-joyride` or building a custom `Joyride` component using `shadcn/ui` Popover.
- **Flow:**
  1. Welcome Modal on first login.
  2. Highlight "Motion" input -> "Enter a topic".
  3. Highlight "Generate" button.
  4. Point to "Export" button after generation.
- **State:** specific boolean flag in `user_settings` table: `has_completed_onboarding`.

### 1.3 Voice Input (Accessibility & Speed)
**Goal:** Allow users to dictate motions/arguments.
**Why:** Speaking is faster than typing; simulates real debate practice.

**Technical Implementation:**
- **Status:** Partially implemented in `hooks/use-speech-to-text.ts`.
- **Next Steps:**
  - Add Microphone icon to `MotionInput` component.
  - Integrate hook to stream text into the textarea.
  - Add visual feedback (waveform or pulsing red dot) while listening.
  - **Fallback:** Ensure graceful failure on browsers without Web Speech API support.

---

## 2. Medium Term (Months 1-3)

### 2.1 Practice Mode ("Sparring Partner")
**Goal:** Interactive debate session where AI plays the opponent.
**Why:** Users need to practice *responding*, not just writing.

**Technical Implementation:**
- **UI:** A chat-like interface but with rigorous turn-taking (User -> Timer -> AI -> Timer).
- **Backend:** New Edge Function `spar` that maintains a persona (e.g., "Aggressive Negation").
- **State:** New table `practice_sessions` to store transcripts.
- **Features:**
  - Configurable speech times.
  - Real-time "Judge Feedback" sidebar (AI analyzing distinct arguments).

### 2.2 Argument Flowcharts (Visual)
**Goal:** Visualize the "flow" of a debate (Argument -> Attack -> Defense).
**Why:** Text is linear; debate logic is branching.

**Technical Implementation:**
- **Library:** `reactflow` or `@xyflow/react`.
- **Data Structure:** Convert linear AI output into a graph:
  - Nodes: Arguments, Rebuttals.
  - Edges: "Attacks", "Defends".
- **Interaction:** Users can drag/drop nodes to reorganize the flow.

### 2.3 PDF Export (Tournaments)
**Goal:** Download a print-ready "Flow Sheet" or case file.
**Why:** Word is good for editing; PDF is required for some submission formats/offline reading.

**Technical Implementation:**
- **Library:** `jspdf` or `react-pdf`.
- **Features:**
  - Multi-column layout "Flow Sheet" mode.
  - Standard headers/footers (User Name, Team Code).
- **Backend (Optional):** If client-side generation is too slow, move to a Node.js Edge Function using `puppeteer`.

---

## 3. Long Term (Months 3+)

### 3.1 Stripe Payments (Monetization)
**Goal:** Sustainable revenue model.
**Why:** AI costs scale with usage; free tier is not sustainable long-term.

**Technical Implementation:**
- **Provider:** Stripe Checkout (Subscription Mode).
- **Database:**
  - Add `subscription_tier` (enum: free, pro) to `profiles`.
  - Add `stripe_customer_id` and `stripe_subscription_id`.
- **Backend:**
  - **Webhook Handler:** Edge function `stripe-webhook` to listen for `customer.subscription.updated`.
  - **Gatekeeping:** Middleware in `ai/index.ts` to check `subscription_tier` before processing high-cost requests (like Deep Research).

### 3.2 Native Mobile Apps (Accessibility)
**Goal:** Fully native iOS and Android experience.
**Why:** Tournaments often have poor wifi; push notifications for updates.

**Technical Implementation:**
- **Framework:** Capacitor (easiest migration from React) or React Native (better performance).
- **Phase 1 (Capacitor):**
  - Wrap existing Vite app.
  - Add "Offline Mode" via Service Workers.
- **Phase 2 (Functionality):**
  - Native Auth integration.
  - Push Notifications for shared cases.
