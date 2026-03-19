# Android Office Back Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Android app show a one-time hint on the first back gesture in `/office`, then exit the app only if the user backs again within a short window.

**Architecture:** Keep the behavior isolated in the React app shell instead of scattering route-specific logic into Office or Terminal pages. Add a tiny pure helper for the double-back timing rules so the Android-specific UI behavior has direct unit coverage without needing a browser/device test harness.

**Tech Stack:** React 18, TypeScript, React Router, Capacitor App plugin, `node --experimental-strip-types --test`, Vite build

---

## File Map

- Create: `docs/superpowers/plans/2026-03-19-android-office-back-exit.md`
- Create: `apps/app/src/lib/android-back-exit.ts`
- Create: `apps/app/src/lib/android-back-exit.test.ts`
- Modify: `apps/app/src/App.tsx`

### Task 1: Lock The Double-Back Rule With Failing Tests

**Files:**
- Create: `apps/app/src/lib/android-back-exit.ts`
- Create: `apps/app/src/lib/android-back-exit.test.ts`

- [ ] **Step 1: Write the failing test for first back press showing the hint**
- [ ] **Step 2: Write the failing test for second back press inside the timeout exiting**
- [ ] **Step 3: Run `node --experimental-strip-types --test apps/app/src/lib/android-back-exit.test.ts` and confirm it fails because the helper does not exist yet**
- [ ] **Step 4: Implement the minimal helper for Android platform detection and double-back timing**
- [ ] **Step 5: Re-run the helper test and confirm it passes**

### Task 2: Wire The Office-Only Android Back Handler Into The App Shell

**Files:**
- Modify: `apps/app/src/App.tsx`
- Use: `apps/app/src/lib/android-back-exit.ts`

- [ ] **Step 1: Mount a lightweight in-app hint surface in the app shell**
- [ ] **Step 2: Register a Capacitor Android `backButton` listener only once in the app shell**
- [ ] **Step 3: Restrict interception to the `/office` route and keep other routes on existing navigation behavior**
- [ ] **Step 4: On first back, show the hint and arm the exit window; on second back within the timeout, call `App.exitApp()`**
- [ ] **Step 5: Clear the armed state when leaving `/office` so the rule does not leak across routes**

### Task 3: Verify The Whole App Still Builds

**Files:**
- Modify: `apps/app/src/App.tsx`
- Test: `apps/app/src/lib/android-back-exit.test.ts`

- [ ] **Step 1: Run `node --experimental-strip-types --test apps/app/src/lib/android-back-exit.test.ts`**
- [ ] **Step 2: Run `pnpm --filter @agent-office/app build`**
- [ ] **Step 3: Review the diff and keep the change limited to Android `/office` back handling**
