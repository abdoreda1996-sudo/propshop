/**
 * The anonymous response cache and the retired-/search redirect, both answered in the
 * proxy. The cache's worst failure is serving one response where another was meant, so
 * these pin the rules that decide what may be stored and when an entry is gone.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  varyIsCovered,
  storeGet,
  storeSet,
  clearResponseCache,
  responseStore,
  type CachedResponse,
} from "../responseCache";
import { retiredSearchTarget } from "../searchRedirect";

const entry = (bytes: number, freshMs = 1000, staleMs = 2000): CachedResponse => ({
  status: 200,
  headers: [["content-type", "text/html"]],
  body: new ArrayBuffer(bytes),
  bytes,
  freshUntil: Date.now() + freshMs,
  staleUntil: Date.now() + staleMs,
});

test("Vary: only headers the key accounts for are allowed", () => {
  assert.equal(varyIsCovered(null), true);
  assert.equal(varyIsCovered("rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding"), true);
  // A response that varies on cookies or anything unknown must never be stored.
  assert.equal(varyIsCovered("Cookie"), false);
  assert.equal(varyIsCovered("rsc, Authorization"), false);
  assert.equal(varyIsCovered("Accept-Language"), false);
});

test("expired entries are dropped, live ones returned", () => {
  clearResponseCache();
  storeSet("a", entry(10));
  storeSet("gone", entry(10, -2000, -1000));
  assert.ok(storeGet("a"));
  assert.equal(storeGet("gone"), undefined);
  assert.equal(responseStore.entries.has("gone"), false);
});

test("byte accounting survives replace and clear", () => {
  clearResponseCache();
  storeSet("k", entry(100));
  storeSet("k", entry(40));
  assert.equal(responseStore.bytes, 40);
  storeSet("j", entry(60));
  assert.equal(responseStore.bytes, 100);
  clearResponseCache();
  assert.equal(responseStore.bytes, 0);
  assert.equal(responseStore.entries.size, 0);
});

test("oversized responses are not stored", () => {
  clearResponseCache();
  storeSet("huge", entry(3 * 1024 * 1024));
  assert.equal(storeGet("huge"), undefined);
});

test("retired /search: bare URL is a permanent redirect to the root", () => {
  assert.deepEqual(retiredSearchTarget([]), { target: "/", permanent: true });
});

test("retired /search: filters carried across, bedrooms floor expanded", () => {
  const r = retiredSearchTarget([["bedrooms", "3"], ["area", "new-cairo"], ["page", "5"], ["empty", ""]]);
  assert.equal(r.permanent, false);
  assert.equal(r.target, "/?beds=3&beds=4&beds=5&area=new-cairo&page=5");
});

test("retired /search: unknown parameters are kept, not dropped", () => {
  assert.equal(retiredSearchTarget([["mystery", "x"]]).target, "/?mystery=x");
});
