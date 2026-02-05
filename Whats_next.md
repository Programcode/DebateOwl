# What's Next: Prioritized Developer Roadmap

This document details the features selected for the next phase of development, prioritized by strategic importance.

## 1. Short Term (Weeks 1-4)

### 1.1 Dark/Light Mode Toggle
**Goal:** User-controlled theme switching.
**Why:** Personal preference, reduced eye strain.

**Technical Implementation:**
- **Status:** Already have `theme` in settings store.
- **Next Steps:** Add toggle to settings page and persist preference.

### 1.2 Debate Timer Improvements
**Goal:** Audio cues, custom formats, keyboard control.
**Why:** Better practice experience with timing.

**Technical Implementation:**
- Enhance existing `TimerPage` with audio/visual cues.
- Add custom format presets (Lincoln-Douglas, Policy, PF).
- Keyboard shortcuts for start/stop/reset.

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

### 2.2 Team Workspaces
**Goal:** Shared workspaces for debate teams.
**Why:** Collaborate on case development.

**Technical Implementation:**
- Multi-tenant architecture with team tables.
- Team invitations via email.
- Role-based permissions (coach, captain, member).

### 2.3 Real-time Collaboration
**Goal:** Multiple users editing cases simultaneously.
**Why:** Team preparation sessions.

**Technical Implementation:**
- Supabase Realtime subscriptions.
- CRDT-based conflict resolution.
- Presence indicators.

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

---

## Recently Completed ✅

The following features have been implemented:
- **Usage Analytics Dashboard** - Admin can view platform health, costs, user activity
- **Onboarding Tutorial** - Interactive walkthrough for new users
- **Voice Input** - Microphone input for motion field
- **PDF Export** - Professional PDF export for all features
- **Argument Flowcharts** - Visual debate flow with React Flow
