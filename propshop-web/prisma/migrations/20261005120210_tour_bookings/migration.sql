-- CreateTable
CREATE TABLE "PhotoBookingNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoBookingNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "PhotoBooking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PhotoBookingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PhotoBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "listingId" TEXT NOT NULL,
    "requestedById" TEXT,
    "photographerId" TEXT,
    "preferredAt" DATETIME,
    "scheduledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "ownerNote" TEXT,
    "cancelReason" TEXT,
    "feeAmount" REAL,
    "shotAt" DATETIME,
    "deliveredAt" DATETIME,
    "packageKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoBooking_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PhotoBooking_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PhotoBooking_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PhotoBooking" ("createdAt", "deliveredAt", "id", "listingId", "packageKey", "photographerId", "scheduledAt", "status") SELECT "createdAt", "deliveredAt", "id", "listingId", "packageKey", "photographerId", "scheduledAt", "status" FROM "PhotoBooking";
DROP TABLE "PhotoBooking";
ALTER TABLE "new_PhotoBooking" RENAME TO "PhotoBooking";
CREATE UNIQUE INDEX "PhotoBooking_reference_key" ON "PhotoBooking"("reference");
CREATE INDEX "PhotoBooking_status_scheduledAt_idx" ON "PhotoBooking"("status", "scheduledAt");
CREATE INDEX "PhotoBooking_photographerId_status_idx" ON "PhotoBooking"("photographerId", "status");
CREATE INDEX "PhotoBooking_listingId_status_idx" ON "PhotoBooking"("listingId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PhotoBookingNote_bookingId_createdAt_idx" ON "PhotoBookingNote"("bookingId", "createdAt");
