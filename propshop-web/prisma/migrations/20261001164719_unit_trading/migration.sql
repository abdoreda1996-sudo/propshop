-- CreateTable
CREATE TABLE "TradePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "typesJson" TEXT NOT NULL DEFAULT '[]',
    "areaIdsJson" TEXT NOT NULL DEFAULT '[]',
    "minBedrooms" INTEGER,
    "minSizeSqm" REAL,
    "minValue" REAL,
    "maxValue" REAL,
    "cash" TEXT NOT NULL DEFAULT 'either',
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradePreference_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeOffer" (
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
    CONSTRAINT "TradeOffer_targetListingId_fkey" FOREIGN KEY ("targetListingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOffer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeOfferUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOfferId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    CONSTRAINT "TradeOfferUnit_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeOfferUnit_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "locationStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "locationIssuesJson" TEXT,
    "locationCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("closeReason", "closedAt", "countryCode", "createdAt", "currency", "descriptionAr", "descriptionEn", "expiresAt", "id", "installmentJson", "locationCheckedAt", "locationIssuesJson", "locationStatus", "maintenanceDue", "obligationsDeclaredAt", "paymentType", "price", "publishedAt", "purpose", "reference", "rejectReason", "remainingToDeveloper", "status", "titleAr", "titleEn", "trustLevel", "unitId", "updatedAt", "validationJson", "valueGapPct", "views") SELECT "closeReason", "closedAt", "countryCode", "createdAt", "currency", "descriptionAr", "descriptionEn", "expiresAt", "id", "installmentJson", "locationCheckedAt", "locationIssuesJson", "locationStatus", "maintenanceDue", "obligationsDeclaredAt", "paymentType", "price", "publishedAt", "purpose", "reference", "rejectReason", "remainingToDeveloper", "status", "titleAr", "titleEn", "trustLevel", "unitId", "updatedAt", "validationJson", "valueGapPct", "views" FROM "Listing";
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TradePreference_listingId_key" ON "TradePreference"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOffer_reference_key" ON "TradeOffer"("reference");

-- CreateIndex
CREATE INDEX "TradeOffer_targetListingId_status_idx" ON "TradeOffer"("targetListingId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_proposerId_createdAt_idx" ON "TradeOffer"("proposerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TradeOffer_recipientId_createdAt_idx" ON "TradeOffer"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TradeOffer_status_expiresAt_idx" ON "TradeOffer"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TradeOfferUnit_listingId_idx" ON "TradeOfferUnit"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOfferUnit_tradeOfferId_listingId_key" ON "TradeOfferUnit"("tradeOfferId", "listingId");
