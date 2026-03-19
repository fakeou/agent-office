import test from "node:test";
import assert from "node:assert/strict";

import {
  CACHE_SAFE_MARGIN_MS,
  PROACTIVE_REFRESH_MS,
  isCacheValid,
  proactiveRefreshDelay,
} from "./relay-ws-cache.ts";

// ── isCacheValid ─────────────────────────────────────────────────────────────

test("null cache is invalid", () => {
  assert.equal(isCacheValid(null), false);
});

test("cache with no expiresAt is always valid", () => {
  assert.equal(isCacheValid({ query: "token=x", expiresAt: null }), true);
});

test("cache is valid when far from expiry", () => {
  const now = Date.now();
  const expiresAt = now + CACHE_SAFE_MARGIN_MS + 1000; // 1 s beyond margin
  assert.equal(isCacheValid({ query: "wsToken=x", expiresAt }, now), true);
});

test("cache is invalid when within the safety margin", () => {
  const now = Date.now();
  const expiresAt = now + CACHE_SAFE_MARGIN_MS - 1000; // 1 s inside margin
  assert.equal(isCacheValid({ query: "wsToken=x", expiresAt }, now), false);
});

test("cache is invalid when already past expiry", () => {
  const now = Date.now();
  const expiresAt = now - 5000;
  assert.equal(isCacheValid({ query: "wsToken=x", expiresAt }, now), false);
});

// ── proactiveRefreshDelay ────────────────────────────────────────────────────

test("returns null when expiresAt is null", () => {
  assert.equal(proactiveRefreshDelay(null), null);
});

test("returns positive delay when token has time before proactive window", () => {
  const now = Date.now();
  const expiresAt = now + PROACTIVE_REFRESH_MS + 5000; // 5 s beyond trigger
  const delay = proactiveRefreshDelay(expiresAt, now);
  assert.equal(typeof delay, "number");
  assert.ok((delay as number) > 0);
  assert.ok((delay as number) <= 5000 + 100); // allow small rounding
});

test("returns null when already inside proactive window", () => {
  const now = Date.now();
  const expiresAt = now + PROACTIVE_REFRESH_MS - 1000; // already in window
  assert.equal(proactiveRefreshDelay(expiresAt, now), null);
});
