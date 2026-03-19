# Floating Route Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a fixed left-corner route control on every mobile/web route, using a menu button on Office and Dashboard and a back button on Terminal, while making the left sheet animate cleanly and respect safe-area insets.

**Architecture:** Add a tiny route-mode helper so the page chrome rule is testable without rendering full React routes. Then move the floating control into the app shell and simplify route headers so buttons do not fight each other. Keep the existing Radix Sheet, but tighten its left-side animation and safe-area padding in one place.

**Tech Stack:** React 18, TypeScript, React Router, Radix Dialog/Sheet, `node --experimental-strip-types --test`, Vite build

---

## File Map

- Create: `docs/superpowers/plans/2026-03-19-floating-route-nav.md`
- Create: `apps/app/src/lib/route-nav.test.ts`
- Create: `apps/app/src/lib/route-nav.ts`
- Modify: `apps/app/src/App.tsx`
- Modify: `apps/app/src/components/layout/NavSheet.tsx`
- Modify: `apps/app/src/routes/DashboardPage.tsx`
- Modify: `apps/app/src/routes/OfficePage.tsx`
- Modify: `apps/app/src/routes/TerminalPage.tsx`

### Task 1: Lock The Route Button Rule With Failing Tests

**Files:**
- Create: `apps/app/src/lib/route-nav.ts`
- Create: `apps/app/src/lib/route-nav.test.ts`

- [ ] **Step 1: Write a failing test for Office and Dashboard returning `menu`**
- [ ] **Step 2: Write a failing test for Terminal returning `back`**
- [ ] **Step 3: Run `node --experimental-strip-types --test apps/app/src/lib/route-nav.test.ts` and confirm it fails before implementation**
- [ ] **Step 4: Implement the minimal pathname helper**
- [ ] **Step 5: Re-run the test and confirm it passes**

### Task 2: Move The Floating Route Control Into The App Shell

**Files:**
- Modify: `apps/app/src/App.tsx`
- Use: `apps/app/src/lib/route-nav.ts`

- [ ] **Step 1: Render a fixed top-left control that respects safe-area top/left padding**
- [ ] **Step 2: Show menu on `/office` and `/dashboard`, and back on `/terminal/:id`**
- [ ] **Step 3: Keep Terminal on back-only mode and do not show the menu there**
- [ ] **Step 4: Add enough top padding to route content so the floating control never overlaps the first interactive row**

### Task 3: Tighten The Left Sheet Motion And Safe Area

**Files:**
- Modify: `apps/app/src/components/ui/sheet.tsx`
- Modify: `apps/app/src/components/layout/NavSheet.tsx`

- [ ] **Step 1: Make the left sheet open from left-to-right and close back to the left with a consistent duration**
- [ ] **Step 2: Add top safe-area padding to the sheet container and close button region**
- [ ] **Step 3: Keep the close affordance tappable on notch devices**

### Task 4: Remove Per-Page Button Duplication And Verify Build

**Files:**
- Modify: `apps/app/src/routes/DashboardPage.tsx`
- Modify: `apps/app/src/routes/OfficePage.tsx`
- Modify: `apps/app/src/routes/TerminalPage.tsx`

- [ ] **Step 1: Remove duplicate menu buttons from Office and Dashboard headers**
- [ ] **Step 2: Remove duplicate menu button from Terminal so it stays back-only**
- [ ] **Step 3: Run `node --experimental-strip-types --test apps/app/src/lib/route-nav.test.ts`**
- [ ] **Step 4: Run `pnpm --filter @agent-office/app build`**
