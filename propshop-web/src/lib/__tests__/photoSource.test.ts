import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPhotoSource } from "../photoSource";
import { canTransition } from "../enums";

const unit = { lat: 30.0444, lng: 31.2357 };

test("a client can never claim a photographer photo (it would skip the GPS check)", () => {
  assert.equal(classifyPhotoSource("photographer", { lat: null, lng: null }, unit), "upload");
  assert.equal(classifyPhotoSource("photographer", { lat: 30.0444, lng: 31.2357 }, unit), "upload");
});

test("in-app photos keep their source only with GPS near the unit", () => {
  assert.equal(classifyPhotoSource("in_app", { lat: 30.0445, lng: 31.2358 }, unit), "in_app");
  assert.equal(classifyPhotoSource("in_app", { lat: null, lng: null }, unit), "upload");
  assert.equal(classifyPhotoSource("in_app", { lat: 31.2, lng: 29.9 }, unit), "upload");
});

test("anything else is an upload", () => {
  for (const claim of ["upload", "", null, undefined, "admin", 42]) {
    assert.equal(classifyPhotoSource(claim, { lat: 30.0444, lng: 31.2357 }, unit), "upload");
  }
});

test("a rejected listing can be fixed and resubmitted", () => {
  assert.equal(canTransition("rejected", "pending_review"), true);
  assert.equal(canTransition("draft", "rejected"), false);
  assert.equal(canTransition("live", "rejected"), false);
  assert.equal(canTransition("pending_review", "rejected"), true);
});
