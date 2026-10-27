import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { canAccessAdminSection } from "@/lib/permissions";
import { storage } from "@/lib/storage";
import { localPrivatePath } from "@/lib/mediaStore";
import { isStoredKycKey, ownershipPageKeys } from "@/lib/kyc";
import { OWNERSHIP_DOC_TYPES } from "@/lib/enums";
import { parseJson } from "@/lib/json";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * GET /api/admin/kyc/[id]/file — the stored photo of one identity document, or one page
 * of a listing's ownership document (`?page=N`, from 0), for the verification team only
 * (admin + reviewer). With object storage it answers with a
 * 60-second signed URL of the private object, issued only after this check; with the
 * local driver it streams the file. Never cached, and the signed URL is never logged.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canAccessAdminSection(auth.user.role, "verification")) return fail("forbidden", 403);
  const { id } = await params;

  const doc = await prisma.kycDocument.findUnique({
    where: { id },
    select: { userId: true, fileKey: true, listingId: true, type: true, extractedJson: true },
  });
  if (!doc) return fail("not_found", 404);

  let key: string | null;
  if (doc.listingId) {
    // An ownership document: any of its stored pages.
    if (!(OWNERSHIP_DOC_TYPES as readonly string[]).includes(doc.type)) return fail("not_found", 404);
    const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
    const pages = ownershipPageKeys(doc, parseJson<Record<string, unknown>>(doc.extractedJson, {}));
    key = Number.isInteger(page) && page >= 0 ? (pages[page] ?? null) : null;
  } else {
    key = isStoredKycKey(doc.userId, doc.fileKey) ? doc.fileKey : null;
  }
  if (!key) return fail("not_found", 404);

  const driver = storage();
  if (driver.name !== "local") {
    const url = await driver.presignDownload(key, 60);
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  }

  const file = localPrivatePath(key);
  if (!file) return fail("not_found", 404);
  try {
    const bytes = await readFile(file);
    const ext = key.split(".").pop() ?? "";
    return new NextResponse(new Uint8Array(bytes), {
      headers: { ...NO_STORE, "Content-Type": TYPES[ext] ?? "application/octet-stream" },
    });
  } catch {
    return fail("not_found", 404);
  }
}
