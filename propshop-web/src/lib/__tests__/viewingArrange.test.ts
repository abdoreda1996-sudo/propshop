/**
 * Staff arrangement of viewings, the login return path, and the new permissions.
 *
 * The viewing rules matter because confirming releases phone numbers: a bug that lets a
 * closed viewing be re-confirmed would unlock contact details the parties walked away from.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { decideStaffAction, bucketOf } from "../viewingArrange";
import { slotFor } from "../viewingSlots";
import { safeNextPath } from "../safeNext";
import { canArrangeViewings, canAccessAdminSection, VIEWING_ASSIGNABLE_ROLES } from "../permissions";

const NOW = new Date("2026-10-01T10:00:00Z");
// Built from the real slot helper, so these cannot drift from the windows' definition.
const futureIso = () => slotFor("2026-10-05", "14-18")!.toISOString();
const pastIso = () => slotFor("2026-09-20", "14-18")!.toISOString();

test("confirm a future window releases contact, once", () => {
  const at = futureIso();
  const d = decideStaffAction({ status: "requested", scheduledAt: null, contactUnlockedAt: null }, "confirm", { slot: at }, NOW);
  assert.ok(d.ok);
  if (d.ok) {
    assert.equal(d.data.status, "accepted");
    assert.equal(d.data.scheduledAt?.toISOString(), at);
    assert.equal(d.data.contactUnlockedAt?.getTime(), NOW.getTime());
  }
});

test("moving a confirmed viewing keeps the original unlock time", () => {
  const unlocked = new Date("2026-09-30T08:00:00Z");
  const d = decideStaffAction({ status: "accepted", scheduledAt: new Date("2026-10-03T08:00:00Z"), contactUnlockedAt: unlocked }, "confirm", { slot: futureIso() }, NOW);
  assert.ok(d.ok);
  if (d.ok) assert.equal(d.data.contactUnlockedAt?.getTime(), unlocked.getTime());
});

test("a time that is not a window start is refused", () => {
  const d = decideStaffAction({ status: "requested", scheduledAt: null, contactUnlockedAt: null }, "confirm", { slot: "2026-10-05T07:40:00Z" }, NOW);
  assert.deepEqual(d, { ok: false, error: "slot_invalid" });
});

test("a past window is refused", () => {
  const d = decideStaffAction({ status: "requested", scheduledAt: null, contactUnlockedAt: null }, "confirm", { slot: pastIso() }, NOW);
  assert.deepEqual(d, { ok: false, error: "slot_in_past" });
});

test("closed viewings accept nothing — they can never be re-confirmed", () => {
  for (const status of ["declined", "cancelled", "completed"]) {
    for (const action of ["confirm", "cancel", "complete"]) {
      const d = decideStaffAction({ status, scheduledAt: null, contactUnlockedAt: null }, action, { slot: futureIso(), outcome: "attended" }, NOW);
      assert.deepEqual(d, { ok: false, error: "already_settled" }, `${status}/${action}`);
    }
  }
});

test("outcome only after the time, only for a confirmed viewing, only known values", () => {
  const past = new Date("2026-09-30T09:00:00Z");
  const future = new Date("2026-10-02T09:00:00Z");
  assert.deepEqual(decideStaffAction({ status: "requested", scheduledAt: null, contactUnlockedAt: null }, "complete", { outcome: "attended" }, NOW), { ok: false, error: "not_confirmed" });
  assert.deepEqual(decideStaffAction({ status: "accepted", scheduledAt: future, contactUnlockedAt: NOW }, "complete", { outcome: "attended" }, NOW), { ok: false, error: "not_yet_happened" });
  assert.deepEqual(decideStaffAction({ status: "accepted", scheduledAt: past, contactUnlockedAt: NOW }, "complete", { outcome: "maybe" }, NOW), { ok: false, error: "outcome_invalid" });
  const d = decideStaffAction({ status: "accepted", scheduledAt: past, contactUnlockedAt: NOW }, "complete", { outcome: "no_show" }, NOW);
  assert.ok(d.ok && d.data.status === "completed" && d.data.outcome === "no_show");
});

test("buckets", () => {
  assert.equal(bucketOf({ status: "requested", scheduledAt: null }, NOW), "needs_action");
  assert.equal(bucketOf({ status: "proposed", scheduledAt: null }, NOW), "needs_action");
  assert.equal(bucketOf({ status: "accepted", scheduledAt: new Date("2026-10-02T00:00:00Z") }, NOW), "upcoming");
  assert.equal(bucketOf({ status: "accepted", scheduledAt: new Date("2026-09-30T00:00:00Z") }, NOW), "unrecorded");
  assert.equal(bucketOf({ status: "completed", scheduledAt: null }, NOW), "closed");
});

test("viewings: admin + advisor arrange; reviewers and photographers do not", () => {
  assert.ok(canArrangeViewings("admin") && canArrangeViewings("advisor"));
  for (const r of ["reviewer", "photographer", "buyer", "owner"]) assert.ok(!canArrangeViewings(r), r);
  assert.ok(canAccessAdminSection("advisor", "viewings") && canAccessAdminSection("advisor", "offers"));
  assert.ok(!canAccessAdminSection("reviewer", "offers") && !canAccessAdminSection("photographer", "viewings"));
  assert.ok((VIEWING_ASSIGNABLE_ROLES as readonly string[]).includes("photographer"));
});

test("login next: same-site paths only", () => {
  assert.equal(safeNextPath("/listing/AQ-100217"), "/listing/AQ-100217");
  assert.equal(safeNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeNextPath("//evil.example/x"), "/dashboard");
  assert.equal(safeNextPath("/\\evil.example"), "/dashboard");
  assert.equal(safeNextPath("/ok\nSet-Cookie:x"), "/dashboard");
  assert.equal(safeNextPath(undefined), "/dashboard");
  assert.equal(safeNextPath("javascript:alert(1)"), "/dashboard");
});

