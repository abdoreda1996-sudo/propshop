-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL DEFAULT 'EG',
    "reference" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paymentType" TEXT NOT NULL,
    "installmentJson" TEXT,
    "remainingToDeveloper" REAL,
    "maintenanceDue" REAL,
    "obligationsDeclaredAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rejectReason" TEXT,
    "trustLevel" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "publishedAt" DATETIME,
    "closedAt" DATETIME,
    "closeReason" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "valueGapPct" REAL,
    "validationJson" TEXT,
    "openToTrade" BOOLEAN NOT NULL DEFAULT false,
    "assignedReviewerId" TEXT,
    "locationStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "locationIssuesJson" TEXT,
    "locationCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Listing_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("closeReason", "closedAt", "countryCode", "createdAt", "currency", "descriptionAr", "descriptionEn", "expiresAt", "id", "installmentJson", "locationCheckedAt", "locationIssuesJson", "locationStatus", "maintenanceDue", "obligationsDeclaredAt", "openToTrade", "paymentType", "price", "publishedAt", "purpose", "reference", "rejectReason", "remainingToDeveloper", "status", "titleAr", "titleEn", "trustLevel", "unitId", "updatedAt", "validationJson", "valueGapPct", "views") SELECT "closeReason", "closedAt", "countryCode", "createdAt", "currency", "descriptionAr", "descriptionEn", "expiresAt", "id", "installmentJson", "locationCheckedAt", "locationIssuesJson", "locationStatus", "maintenanceDue", "obligationsDeclaredAt", "openToTrade", "paymentType", "price", "publishedAt", "purpose", "reference", "rejectReason", "remainingToDeveloper", "status", "titleAr", "titleEn", "trustLevel", "unitId", "updatedAt", "validationJson", "valueGapPct", "views" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE UNIQUE INDEX "Listing_reference_key" ON "Listing"("reference");
CREATE INDEX "Listing_status_trustLevel_publishedAt_idx" ON "Listing"("status", "trustLevel", "publishedAt" DESC);
CREATE INDEX "Listing_status_trustLevel_purpose_publishedAt_idx" ON "Listing"("status", "trustLevel", "purpose", "publishedAt" DESC);
CREATE INDEX "Listing_status_trustLevel_price_idx" ON "Listing"("status", "trustLevel", "price");
CREATE INDEX "Listing_unitId_idx" ON "Listing"("unitId");
CREATE INDEX "Listing_expiresAt_idx" ON "Listing"("expiresAt");
CREATE INDEX "Listing_status_trustLevel_valueGapPct_idx" ON "Listing"("status", "trustLevel", "valueGapPct");
CREATE INDEX "Listing_locationStatus_status_idx" ON "Listing"("locationStatus", "status");
CREATE INDEX "Listing_openToTrade_status_trustLevel_idx" ON "Listing"("openToTrade", "status", "trustLevel");
CREATE INDEX "Listing_assignedReviewerId_status_idx" ON "Listing"("assignedReviewerId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
