/**
 * 24-hour SLA on every buyer request (Section 6c). Every request is assigned to a
 * salaried advisor within minutes and must get a human response within 24 hours. A
 * breach escalates to a manager and sends an automatic apology.
 */

import { SLA_HOURS } from "./enums";

export function slaDueFrom(createdAt: Date, hours: number = SLA_HOURS): Date {
  return new Date(createdAt.getTime() + hours * 3600_000);
}

export type SlaState = {
  /** Milliseconds remaining; negative once breached. */
  remainingMs: number;
  breached: boolean;
  /** True in the last 4 hours — the advisor queue highlights these. */
  urgent: boolean;
  /** Fraction of the window elapsed, clamped to [0,1], for the countdown ring. */
  progress: number;
};

export function slaState(slaDueAt: Date, firstResponseAt: Date | null, now: Date = new Date()): SlaState {
  const reference = firstResponseAt ?? now;
  const remainingMs = slaDueAt.getTime() - reference.getTime();
  const windowMs = SLA_HOURS * 3600_000;
  const elapsed = windowMs - remainingMs;
  return {
    remainingMs,
    breached: remainingMs < 0,
    urgent: remainingMs > 0 && remainingMs < 4 * 3600_000,
    progress: Math.min(1, Math.max(0, elapsed / windowMs)),
  };
}

export function formatCountdown(remainingMs: number, locale: "ar" | "en"): string {
  const abs = Math.abs(remainingMs);
  const hours = Math.floor(abs / 3600_000);
  const minutes = Math.floor((abs % 3600_000) / 60_000);
  const late = remainingMs < 0;
  if (locale === "ar") {
    const body = hours > 0 ? `${hours} ساعة و${minutes} دقيقة` : `${minutes} دقيقة`;
    return late ? `متأخر ${body}` : `باقي ${body}`;
  }
  const body = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return late ? `${body} overdue` : `${body} left`;
}

/**
 * Round-robin assignment weighted by open load, so a busy advisor is not handed more.
 * Advisors covering the buyer's country are preferred (Gulf buyers get a Gulf-hours desk).
 */
export type AdvisorCandidate = {
  id: string;
  countryCode: string;
  openRequests: number;
};

export function pickAdvisor(candidates: AdvisorCandidate[], buyerCountry: string): string | null {
  if (candidates.length === 0) return null;
  const sameCountry = candidates.filter((c) => c.countryCode === buyerCountry);
  const pool = sameCountry.length > 0 ? sameCountry : candidates;
  return pool.reduce((best, c) => (c.openRequests < best.openRequests ? c : best)).id;
}

/** Statuses that still count as open work in an advisor's queue. */
export const OPEN_REQUEST_STATUSES = ["received", "assigned", "contacted", "viewing_scheduled", "offer"];

export const APOLOGY_MESSAGE = {
  ar: "اعتذار من بروب شوب: تأخرنا في الرد على طلبك خلال الـ24 ساعة اللي وعدنا بيها. تم تصعيد طلبك لمدير الفريق وهيتم التواصل معك في أقرب وقت.",
  en: "An apology from PropShop: we missed the 24-hour response we promised on your request. It has been escalated to a team manager and you will be contacted shortly.",
};
