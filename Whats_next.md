# What's Next: Prioritized Developer Roadmap

This document details the features selected for the next phase of development, prioritized by strategic importance.



### 1.3 Export to Google Docs
**Goal:** Direct export of cases to Google Docs.
**Why:** Easier collaboration and sharing with teammates.

**Technical Implementation:**
- **Auth:** Expand Google OAuth scopes to include `drive.file`.
- **Backend:** New Edge Function `export-gdoc` using Google Drive API.
- **Conversion:** Convert internal HTML/Markdown format to Google Docs structure.
- **Style:** Professional, minimalist formatting (black/white, standard fonts) similar to legal briefs, avoiding UI colors.

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


### 2.3 Real-time Collaboration
**Goal:** Multiple users editing cases simultaneously.
**Why:** Team preparation sessions.

**Technical Implementation:**
- Supabase Realtime subscriptions.
- CRDT-based conflict resolution.
- Presence indicators.

### 2.4 Integration with Debate Wikis
**Goal:** Pull evidence and cases from WikiDebate, NDCA Wiki, and curated sources.
**Why:** Access to community standard arguments and evidence.

**Technical Implementation:**
- **WikiDebate:** Use MediaWiki API to search and retrieve articles.
- **NDCA Wiki:** Scraper/Indexer for open/recent case disclosures (caselist).
- **Curated Sources:** New `curated_sources` table for admin-managed high-quality feeds.
- **Search Integration:** Add specific "Wiki" tab to research tools.

---

## 3. Long Term (Months 3+)

### 3.1 Stripe Payments (Monetization)
**Goal:** Sustainable revenue model with tiered access.
**Why:** AI costs scale with usage; free tier is not sustainable long-term.

**Usage Limits & Tiers:**
1.  **Free Trial (Default):**
    - Duration: 3 Days.
    - Limit: 5 uses/day.
2.  **Pro Subscription ($5/month):**
    - Limit: 50 uses/day.
    - Features: Access to Deep Research and Advanced Models.

**Promo Code System:**
- Admin can generate custom codes (e.g., "CIT").
- Codes grant special access (e.g., "1 month free trial with 15 uses/day").
- Codes used for demos and partners.

**Technical Implementation:**
- **Provider:** Stripe Checkout.
- **Database:**
  - Update `rate_limits` to handle custom daily limits.
  - New table `promo_codes` (code, duration_days, daily_limit, max_redemptions).
  - Add `subscription_status`, `trial_ends_at`, `custom_limit` to `profiles`.
- **Backend:**
  - `stripe-webhook` for subscription updates.
  - Middleware logic: Check `custom_limit` > `subscription_tier` > `default_trial`.

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
