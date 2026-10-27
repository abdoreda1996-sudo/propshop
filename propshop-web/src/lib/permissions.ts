import { Role } from "./enums";

/**
 * Back-office authorisation.
 *
 * THE PROBLEM THIS FIXES
 *
 * `/admin` was guarded by `isStaff(role)` alone, which is true for admin, reviewer,
 * advisor AND photographer. A photographer is a field contractor who turns up to shoot a
 * flat — and could open `/admin/users` and read every account with its phone number, plus
 * the reports queue and the advisor queue with buyers' contact details.
 *
 * "Is this person staff" is authentication-shaped thinking. What a section needs is "may
 * THIS role do THIS job", which is what this module expresses.
 *
 * The rule throughout: grant the narrowest set that lets someone do their work. A role
 * appears in a section's list only because that job genuinely requires it.
 */

export const ADMIN_SECTIONS = [
  "overview",
  "verification",
  "requests",
  "viewings",
  "bookings",
  "offers",
  "trades",
  "listings",
  "reports",
  "users",
  "site",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/**
 * Which roles may open which section.
 *
 * - admin        — everything, including the user table
 * - reviewer     — verification and the listings/reports that feed it. Not users: a
 *                  reviewer checks documents against a listing, and does not need a
 *                  directory of everyone on the platform.
 * - advisor      — the advisor queue they work, and listings for context. Not users,
 *                  not reports.
 * - photographer — the tour-shoot bookings ASSIGNED TO THEM, and nothing else. They were
 *                  once in scope everywhere because `isStaff` was too coarse; now the one
 *                  section that is their job (src/lib/tourBooking.ts scopes the rows).
 */
const SECTION_ROLES: Record<AdminSection, Role[]> = {
  overview: ["admin", "reviewer", "advisor"],
  verification: ["admin", "reviewer"],
  requests: ["admin", "advisor"],
  // Arranging viewings is coordination work — the advisor's job — and an admin's.
  viewings: ["admin", "advisor"],
  // Tour-shoot bookings: advisors and admins arrange them; a photographer sees only their own.
  bookings: ["admin", "advisor", "photographer"],
  // Read-only tracking of every negotiation. Advisors follow deals through; reviewers
  // judge listings, not prices, so they are not in it.
  offers: ["admin", "advisor"],
  // Arranging an accepted trade (documents, contracts) is advisor coordination work.
  trades: ["admin", "advisor"],
  listings: ["admin", "reviewer", "advisor"],
  reports: ["admin", "reviewer"],
  // The user directory is the most sensitive screen in the product: names, phone numbers,
  // trust levels and strikes for every account. Admin only.
  users: ["admin"],
  // The home page cover — the first thing every visitor sees. Admin only.
  site: ["admin"],
};

export function canAccessAdminSection(role: string, section: AdminSection): boolean {
  return SECTION_ROLES[section].includes(role as Role);
}

/** Every section this role may open. Empty means they have no business in /admin at all. */
export function allowedAdminSections(role: string): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => canAccessAdminSection(role, s));
}

export function hasAnyAdminAccess(role: string): boolean {
  return allowedAdminSections(role).length > 0;
}

/**
 * Whether a role may act on a listing's verification (approve / reject).
 *
 * Separate from merely viewing the queue: an advisor can see that a listing is pending,
 * but only a reviewer or admin decides whether it publishes.
 */
export function canDecideVerification(role: string): boolean {
  return role === "admin" || role === "reviewer";
}

/** Whether a role may resolve an abuse report or apply a strike. */
export function canResolveReports(role: string): boolean {
  return role === "admin" || role === "reviewer";
}

/** Whether a role may change another user's role, block them, or edit their record. */
export function canManageUsers(role: string): boolean {
  return role === "admin";
}

/**
 * Whether a role may edit a listing's unit facts, details and photos from the back office.
 *
 * Admin only. A reviewer's job is to judge what the owner submitted; if a reviewer could
 * also rewrite it, the person checking the evidence could manufacture it. Edits are
 * written to the audit log field by field either way.
 */
export function canEditListings(role: string): boolean {
  return role === "admin";
}

/** Whether a role may arrange viewings: confirm/move the time, assign, cancel, record, note. */
export function canArrangeViewings(role: string): boolean {
  return role === "admin" || role === "advisor";
}

/** Who a viewing can be assigned to — staff who could attend or coordinate one. */
export const VIEWING_ASSIGNABLE_ROLES = ["admin", "advisor", "photographer"] as const;


/** Whether a role may arrange trades: assign, note, move stages, cancel an accepted trade. */
export function canArrangeTrades(role: string): boolean {
  return role === "admin" || role === "advisor";
}

/** Who arranges tour-shoot bookings (schedule, assign, cancel). Photographers only record their own shoots. */
export function canArrangeBookings(role: string): boolean {
  return role === "admin" || role === "advisor";
}

/** Who can be sent to shoot a tour. */
export const BOOKING_ASSIGNABLE_ROLES = ["photographer", "admin"] as const;
