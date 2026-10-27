-- CreateTable
CREATE TABLE "ViewingNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "viewingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ViewingNote_viewingId_fkey" FOREIGN KEY ("viewingId") REFERENCES "ViewingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViewingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ViewingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "slotsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "proposedAt" DATETIME,
    "note" TEXT,
    "scheduledAt" DATETIME,
    "contactUnlockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedStaffId" TEXT,
    "completedAt" DATETIME,
    "outcome" TEXT,
    CONSTRAINT "ViewingRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViewingRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViewingRequest_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ViewingRequest" ("buyerId", "contactUnlockedAt", "createdAt", "id", "listingId", "note", "proposedAt", "scheduledAt", "slotsJson", "status") SELECT "buyerId", "contactUnlockedAt", "createdAt", "id", "listingId", "note", "proposedAt", "scheduledAt", "slotsJson", "status" FROM "ViewingRequest";
DROP TABLE "ViewingRequest";
ALTER TABLE "new_ViewingRequest" RENAME TO "ViewingRequest";
CREATE INDEX "ViewingRequest_listingId_idx" ON "ViewingRequest"("listingId");
CREATE INDEX "ViewingRequest_buyerId_idx" ON "ViewingRequest"("buyerId");
CREATE INDEX "ViewingRequest_status_scheduledAt_idx" ON "ViewingRequest"("status", "scheduledAt");
CREATE INDEX "ViewingRequest_assignedStaffId_idx" ON "ViewingRequest"("assignedStaffId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ViewingNote_viewingId_createdAt_idx" ON "ViewingNote"("viewingId", "createdAt");
