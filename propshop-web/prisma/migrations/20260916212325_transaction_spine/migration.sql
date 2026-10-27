/*
  Warnings:

  - Added the required column `sellerId` to the `Deal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellerId` to the `Offer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ViewingRequest" ADD COLUMN "note" TEXT;
ALTER TABLE "ViewingRequest" ADD COLUMN "proposedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "offerId" TEXT,
    "agreedPrice" REAL NOT NULL DEFAULT 0,
    "reservedUntil" DATETIME,
    "advisorId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'offer_accepted',
    "adminFee" REAL NOT NULL DEFAULT 0,
    "depositAmount" REAL,
    "depositProviderRef" TEXT,
    "depositStatus" TEXT NOT NULL DEFAULT 'pending',
    "contractFileKey" TEXT,
    "checklistJson" TEXT,
    "closedPrice" REAL,
    "signingAt" DATETIME,
    "closedAt" DATETIME,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "poaStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- sellerId is derived from the listing's unit owner, and agreedPrice from the accepted
-- offer, so existing deals migrate intact instead of being dropped.
INSERT INTO "new_Deal" ("adminFee", "advisorId", "buyerId", "checklistJson", "closedAt", "closedPrice", "contractFileKey", "createdAt", "depositAmount", "depositProviderRef", "depositStatus", "id", "isRemote", "listingId", "offerId", "poaStatus", "reference", "signingAt", "stage", "sellerId", "agreedPrice") SELECT "adminFee", "advisorId", "buyerId", "checklistJson", "closedAt", "closedPrice", "contractFileKey", "createdAt", "depositAmount", "depositProviderRef", "depositStatus", "id", "isRemote", "listingId", "offerId", "poaStatus", "reference", "signingAt", "stage", (SELECT u."ownerId" FROM "Unit" u JOIN "Listing" l ON l."unitId" = u."id" WHERE l."id" = "Deal"."listingId"), COALESCE((SELECT o."amount" FROM "Offer" o WHERE o."id" = "Deal"."offerId"), 0) FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE UNIQUE INDEX "Deal_reference_key" ON "Deal"("reference");
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");
CREATE TABLE "new_Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'buyer',
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "message" TEXT,
    "termsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME,
    "parentOfferId" TEXT,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "Offer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Offer" ("amount", "buyerId", "createdAt", "id", "listingId", "status", "termsJson", "sellerId") SELECT "amount", "buyerId", "createdAt", "id", "listingId", "status", "termsJson", (SELECT u."ownerId" FROM "Unit" u JOIN "Listing" l ON l."unitId" = u."id" WHERE l."id" = "Offer"."listingId") FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
CREATE UNIQUE INDEX "Offer_parentOfferId_key" ON "Offer"("parentOfferId");
CREATE INDEX "Offer_listingId_status_idx" ON "Offer"("listingId", "status");
CREATE INDEX "Offer_buyerId_idx" ON "Offer"("buyerId");
CREATE INDEX "Offer_sellerId_idx" ON "Offer"("sellerId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL DEFAULT 'EG',
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "nationalIdHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'buyer',
    "trustLevel" INTEGER NOT NULL DEFAULT 0,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "countryOfResidence" TEXT NOT NULL DEFAULT 'EG',
    "preferredCurrency" TEXT NOT NULL DEFAULT 'EGP',
    "preferredChannel" TEXT NOT NULL DEFAULT 'in_app',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "phoneVerifiedAt" DATETIME,
    "emailVerifiedAt" DATETIME,
    "publicRef" INTEGER,
    "fundsStatus" TEXT NOT NULL DEFAULT 'none',
    "fundsVerifiedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("countryCode", "countryOfResidence", "createdAt", "email", "fullName", "id", "isBlocked", "lastLoginAt", "locale", "nationalIdHash", "passwordHash", "phone", "phoneVerifiedAt", "preferredChannel", "preferredCurrency", "role", "strikes", "trustLevel", "updatedAt") SELECT "countryCode", "countryOfResidence", "createdAt", "email", "fullName", "id", "isBlocked", "lastLoginAt", "locale", "nationalIdHash", "passwordHash", "phone", "phoneVerifiedAt", "preferredChannel", "preferredCurrency", "role", "strikes", "trustLevel", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_publicRef_key" ON "User"("publicRef");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_trustLevel_idx" ON "User"("trustLevel");
CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
