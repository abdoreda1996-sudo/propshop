-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListingMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "phash" TEXT,
    "gpsLat" REAL,
    "gpsLng" REAL,
    "capturedAt" DATETIME,
    "source" TEXT NOT NULL,
    "room" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isWatermarked" BOOLEAN NOT NULL DEFAULT false,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ListingMedia" ("capturedAt", "createdAt", "fileKey", "gpsLat", "gpsLng", "id", "isVerified", "isWatermarked", "listingId", "phash", "room", "sortOrder", "source", "thumbKey") SELECT "capturedAt", "createdAt", "fileKey", "gpsLat", "gpsLng", "id", "isVerified", "isWatermarked", "listingId", "phash", "room", "sortOrder", "source", "thumbKey" FROM "ListingMedia";
DROP TABLE "ListingMedia";
ALTER TABLE "new_ListingMedia" RENAME TO "ListingMedia";
CREATE INDEX "ListingMedia_listingId_idx" ON "ListingMedia"("listingId");
CREATE INDEX "ListingMedia_phash_idx" ON "ListingMedia"("phash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
