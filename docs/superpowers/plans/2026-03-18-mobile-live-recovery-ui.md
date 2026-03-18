# Mobile Live Recovery And Platform Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app recover office/terminal live connections aggressively on foreground and add clear iOS/Android background-behavior guidance in the UI.

**Architecture:** Keep the existing React + Capacitor app structure, but extract small client-side liveness helpers so office and terminal resume logic share the same stale-socket rules. Add a lightweight mobile guidance surface in the Office UI instead of trying to implement the full notification backend from the spec in this pass.

**Tech Stack:** React 18, TypeScript, Zustand, Capacitor App lifecycle hooks, `node --experimental-strip-types --test`, Vite build

---

## File Map

- Create: `docs/superpowers/plans/2026-03-18-mobile-live-recovery-ui.md`
- Create: `apps/app/src/lib/live-recovery.ts`
- Create: `apps/app/src/lib/live-recovery.test.ts`
- Modify: `apps/app/src/store/sessions.ts`
- Modify: `apps/app/src/routes/TerminalPage.tsx`
- Modify: `apps/app/src/routes/OfficePage.tsx`

### Task 1: Lock In Foreground Recovery Rules With Failing Tests

**Files:**
- Create: `apps/app/src/lib/live-recovery.ts`
- Create: `apps/app/src/lib/live-recovery.test.ts`

- [ ] **Step 1: Write the failing test for stale socket detection on resume**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { shouldReplaceSocketOnResume } from "./live-recovery";

test("resume replaces an apparently open socket when it is stale", () => {
  assert.equal(
    shouldReplaceSocketOnResume({ readyState: 1, lastMessageAt: Date.now() - 5000, staleAfterMs: 1500 }),
    true,
  );
});
```

- [ ] **Step 2: Write the failing test for platform guidance copy selection**

```ts
import { platformRecoveryMessage } from "./live-recovery";

test("platform guidance calls out stricter iOS background limits", () => {
  assert.match(platformRecoveryMessage("ios"), /iOS/i);
  assert.match(platformRecoveryMessage("ios"), /push/i);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test apps/app/src/lib/live-recovery.test.ts`
Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 4: Write the minimal helper implementation**

```ts
export function shouldReplaceSocketOnResume(...) { ... }
export function platformRecoveryMessage(...) { ... }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test apps/app/src/lib/live-recovery.test.ts`
Expected: PASS

### Task 2: Make Office Resume Use Freshness Instead Of `OPEN`

**Files:**
- Modify: `apps/app/src/store/sessions.ts`
- Modify: `apps/app/src/components/SessionsRuntime.tsx`
- Use: `apps/app/src/lib/live-recovery.ts`

- [ ] **Step 1: Track socket freshness in the sessions store**
- [ ] **Step 2: On every events message, update `lastMessageAt`**
- [ ] **Step 3: Change `reconnectNow()` so resume logic replaces stale sockets even when `readyState === OPEN`**
- [ ] **Step 4: Force a snapshot fetch before or alongside reconnect on foreground resume**
- [ ] **Step 5: Run the app test plus build verification**

Run: `node --experimental-strip-types --test apps/app/src/lib/live-recovery.test.ts && pnpm --filter @agent-office/app build`
Expected: PASS

### Task 3: Make Terminal Resume Follow The Same Rule

**Files:**
- Modify: `apps/app/src/routes/TerminalPage.tsx`
- Use: `apps/app/src/lib/live-recovery.ts`

- [ ] **Step 1: Track `lastMessageAt` and `lastOpenAt` for the terminal socket**
- [ ] **Step 2: On resume or visibility restore, replace the socket if it is stale, not only if it is closed**
- [ ] **Step 3: Add a short first-message timeout so a zombie reconnect is retried immediately**
- [ ] **Step 4: Keep the current snapshot-first terminal UX intact**
- [ ] **Step 5: Run build verification**

Run: `pnpm --filter @agent-office/app build`
Expected: PASS

### Task 4: Add Mobile Platform Guidance In The Office UI

**Files:**
- Modify: `apps/app/src/routes/OfficePage.tsx`
- Use: `apps/app/src/lib/live-recovery.ts`

- [ ] **Step 1: Render a compact mobile-only info card near the office header**
- [ ] **Step 2: Show Android guidance about foreground quick recovery and future notifications**
- [ ] **Step 3: Show iOS-specific guidance that background sockets are stricter and push is the real background path**
- [ ] **Step 4: Keep copy concise and non-alarming**
- [ ] **Step 5: Run build verification**

Run: `pnpm --filter @agent-office/app build`
Expected: PASS
