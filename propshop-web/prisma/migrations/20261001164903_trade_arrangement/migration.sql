-- CreateTable
CREATE TABLE "TradeNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOfferId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeNote_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TradeOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "targetListingId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "cashAmount" REAL NOT NULL DEFAULT 0,
    "cashPayer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME NOT NULL,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage" TEXT,
    "stageUpdatedAt" DATETIME,
    "cancelReason" TEXT,
    "assignedStaffId" TEXT,
    CONSTRAINT "TradeOffer_targetListingId_fkey" FOREIGN KEY ("targetListingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOffer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOffer_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TradeOffer" ("cashAmount", "cashPayer", "createdAt", "expiresAt", "id", "proposerId", "recipientId", "reference", "respondedAt", "status", "targetListingId") SELECT "cashAmount", "cashPayer", "createdAt", "expiresAt", "id", "proposerId", "recipientId", "reference", "respondedAt", "status", "targetListingId" FROM "TradeOffer";
DROP TABLE "TradeOffer";
ALTER TABLE "new_TradeOffer" RENAME TO "TradeOffer";
CREATE UNIQUE INDEX "TradeOffer_reference_key" ON "TradeOffer"("reference");
CREATE INDEX "TradeOffer_targetListingId_status_idx" ON "TradeOffer"("targetListingId", "status");
CREATE INDEX "TradeOffer_proposerId_createdAt_idx" ON "TradeOffer"("proposerId", "createdAt" DESC);
CREATE INDEX "TradeOffer_recipientId_createdAt_idx" ON "TradeOffer"("recipientId", "createdAt" DESC);
CREATE INDEX "TradeOffer_status_expiresAt_idx" ON "TradeOffer"("status", "expiresAt");
CREATE INDEX "TradeOffer_stage_idx" ON "TradeOffer"("stage");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TradeNote_tradeOfferId_createdAt_idx" ON "TradeNote"("tradeOfferId", "createdAt");
