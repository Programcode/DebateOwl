# What's Next: Prioritized Developer Roadmap

This document details the features selected for the next phase of development, prioritized by strategic importance.


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

**Goal:** Sustainable revenue model with tiered access.
**Why:** AI costs scale with usage; free tier is not sustainable long-term.

> [!IMPORTANT]
> A comprehensive, 450+ line implementation plan has been created at [stripe_implementation.md](stripe_implementation.md). This file details every step of the integration including manual setup, database changes, and code.

**Key Features (Summary):**
- **Free Tier:** 5 requests/day.
- **Pro Tier ($5/mo):** 50 requests/day + Advanced Models (Claude 3.5 Sonnet, GPT-4o).
- **Trial:** 3-Day Cardless Free Trial.
- **Promo Codes:** Flexible system for overrides and discounts.


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
