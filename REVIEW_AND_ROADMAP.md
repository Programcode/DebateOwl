# DebateLab: Roadmap & Remaining Work

**Last Updated:** 2026-01-30  
**Status:** Production (Supabase backend deployed)

---

## ✅ Completed Security & Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| API Keys Exposed | ✅ **FIXED** | Moved to Supabase Edge Function secrets |
| Missing CSP Headers | ✅ **FIXED** | Added to nginx.conf |
| URL Validation | ✅ **FIXED** | `validateUrl()` utility added |
| File Upload Validation | ✅ **FIXED** | Size/type/extension checks |
| Request Timeouts | ✅ **FIXED** | `fetchWithTimeout()` utility |
| Prompt Injection | ✅ **FIXED** | Sanitization in Edge Function |
| Supabase Auth | ✅ **DONE** | Google OAuth implemented |
| Edge Function AI Proxy | ✅ **DONE** | All AI calls go through backend |

---

## 🔴 Remaining Critical Issues

### 1. Hardcoded Admin Password
**File:** `src/pages/SettingsPage.tsx`
```typescript
if (adminCode === 'debate2026') // Hardcoded
```
**Fix:** Move admin check to Supabase RLS or remove admin mode for public deployment.

### 2. TypeScript Strict Mode Disabled
**File:** `tsconfig.json`
- `noImplicitAny: false`
- `strictNullChecks: false`

**Impact:** Defeats purpose of TypeScript.

---

## 🟡 Remaining Medium Priority

### Code Quality
- [ ] Enable TypeScript strict mode incrementally
- [ ] Replace `any` types with proper interfaces
- [ ] Add React.memo to message list components
- [ ] Route code-splitting with React.lazy

### Testing
- [ ] Add AI client unit tests
- [ ] Add Zustand store tests
- [ ] Add component integration tests

### Performance
- [ ] Virtual scrolling for long lists (react-window)
- [ ] Debounce localStorage writes
- [ ] Bundle size optimization

### Accessibility  
- [ ] ARIA labels for all interactive elements
- [ ] Keyboard navigation
- [ ] Screen reader testing

---

## 🚀 Future Features Roadmap

### Short-term (Next 3 months)
1. **Usage Analytics Dashboard** - Track AI token usage per user
2. **Team Workspaces** - Share cases with team members  
3. **Offline Mode (PWA)** - Service worker for offline access

### Medium-term (6-12 months)
1. **AI Debate Judge** - Analyze debate recordings, provide feedback
2. **Evidence Database** - Searchable evidence card repository
3. **Tournament Integration** - Tabroom.com export

### Long-term (12+ months)
1. **AI Debate Partner** - Practice debates via voice
2. **Mobile Apps** - iOS/Android with React Native

---

## 📊 Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Lighthouse Score | 90+ | ~70 |
| Test Coverage | 80%+ | <1% |
| Bundle Size | <300KB | ~800KB |
| API Latency p95 | <2s | ~3s |

---

## Infrastructure

### Current Stack
- **Frontend:** React + Vite + TailwindCSS
- **Auth:** Supabase Auth (Google OAuth)
- **Backend:** Supabase Edge Functions (Deno)
- **Deployment:** Docker + Nginx + Cloudflare Tunnel
- **CI/CD:** GitHub Actions → Docker Hub → Watchtower

### Live URL
[https://debate.pi-stack.org](https://debate.pi-stack.org)
