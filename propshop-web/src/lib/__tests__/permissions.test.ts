/**
 * Back-office authorisation.
 *
 * The bug this pins: /admin was guarded by `isStaff(role)` alone, which is true for
 * photographers — field contractors who shoot flats. They could open /admin/users and
 * read every account with its phone number.
 *
 * "Is this person staff" is authentication-shaped thinking. These tests assert the
 * narrower question: may THIS role do THIS job.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessAdminSection,
  allowedAdminSections,
  hasAnyAdminAccess,
  canDecideVerification,
  canResolveReports,
  canManageUsers,
  ADMIN_SECTIONS,
} from "../permissions";

test("a photographer gets their tour-shoot bookings and nothing else", () => {
  // The one section that is their job; the rows inside it are scoped to their own shoots
  // (tourBooking.bookingScope). No users, requests, viewings, listings or overview.
  assert.deepEqual(allowedAdminSections("photographer"), ["bookings"]);
  assert.equal(hasAnyAdminAccess("photographer"), true);
  for (const section of ADMIN_SECTIONS) {
    assert.equal(canAccessAdminSection("photographer", section), section === "bookings", section);
  }
});

test("the user directory is admin-only", () => {
  // The most sensitive screen: names, phones, trust levels and strikes for every account.
  assert.equal(canAccessAdminSection("admin", "users"), true);
  for (const role of ["reviewer", "advisor", "photographer", "owner", "buyer", "investor"]) {
    assert.equal(canAccessAdminSection(role, "users"), false, role);
  }
});

test("a reviewer verifies listings but does not read the user directory", () => {
  assert.equal(canAccessAdminSection("reviewer", "verification"), true);
  assert.equal(canAccessAdminSection("reviewer", "reports"), true);
  assert.equal(canAccessAdminSection("reviewer", "users"), false);
  // Nor do they work the advisor queue, which carries buyers' contact details.
  assert.equal(canAccessAdminSection("reviewer", "requests"), false);
});

test("an advisor works their queue and nothing sensitive", () => {
  assert.equal(canAccessAdminSection("advisor", "requests"), true);
  assert.equal(canAccessAdminSection("advisor", "listings"), true);
  assert.equal(canAccessAdminSection("advisor", "users"), false);
  assert.equal(canAccessAdminSection("advisor", "reports"), false);
  // An advisor can see a listing is pending; only a reviewer decides if it publishes.
  assert.equal(canDecideVerification("advisor"), false);
});

test("ordinary members have no back-office access", () => {
  for (const role of ["buyer", "owner", "investor"]) {
    assert.equal(hasAnyAdminAccess(role), false, role);
  }
});

test("an unknown or empty role is denied everything", () => {
  // Fail closed: a role added to the enum but not to a section list gets nothing.
  for (const role of ["", "root", "superuser", "undefined"]) {
    assert.equal(hasAnyAdminAccess(role), false, role);
  }
});

test("only admins manage users", () => {
  assert.equal(canManageUsers("admin"), true);
  for (const role of ["reviewer", "advisor", "photographer"]) {
    assert.equal(canManageUsers(role), false, role);
  }
});

test("verification and report decisions are reviewer-or-admin", () => {
  for (const role of ["admin", "reviewer"]) {
    assert.equal(canDecideVerification(role), true, role);
    assert.equal(canResolveReports(role), true, role);
  }
  for (const role of ["advisor", "photographer", "buyer"]) {
    assert.equal(canDecideVerification(role), false, role);
    assert.equal(canResolveReports(role), false, role);
  }
});

test("every section grants access to at least admin", () => {
  // A section nobody can reach is a bug, not a security win.
  for (const section of ADMIN_SECTIONS) {
    assert.equal(canAccessAdminSection("admin", section), true, section);
  }
});
