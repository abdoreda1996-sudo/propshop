import { prisma } from "./prisma";
import { audit } from "./api";
import { shouldBlockForStrikes } from "./antiBroker";
import { applyBlock } from "./moderation";

/**
 * Resolve one abuse report — shared by PATCH /api/reports/[id] and the bulk endpoint, so
 * a bulk "uphold" issues strikes and auto-blocks exactly as the single button does.
 *
 * Only an upheld report issues a strike; reaching the threshold blocks the account
 * (src/lib/moderation.ts). Reporting alone can never harm an owner.
 */
export async function resolveReport(
  id: string,
  status: "upheld" | "dismissed",
  actorId: string,
  ip?: string,
): Promise<{ ok: true; status: string; strikes: number; blocked: boolean } | { ok: false; reason: "not_found" | "already_resolved" }> {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return { ok: false, reason: "not_found" };
  if (report.status !== "open") return { ok: false, reason: "already_resolved" };

  await prisma.report.update({ where: { id }, data: { status } });

  let blocked = false;
  let strikes = 0;
  if (status === "upheld" && report.targetUserId) {
    await prisma.strike.create({ data: { userId: report.targetUserId, reason: report.reason, reportId: report.id } });
    const user = await prisma.user.update({
      where: { id: report.targetUserId },
      data: { strikes: { increment: 1 } },
      select: { strikes: true, isBlocked: true },
    });
    strikes = user.strikes;
    if (shouldBlockForStrikes(strikes) && !user.isBlocked) {
      blocked = true;
      const effects = await applyBlock(report.targetUserId);
      await audit(actorId, "user_blocked", "user", report.targetUserId, { via: "strikes", reportId: id, ...effects }, ip);
    }
  }
  await audit(actorId, `report_${status}`, "report", id, { strikes, blocked }, ip);
  return { ok: true, status, strikes, blocked };
}
