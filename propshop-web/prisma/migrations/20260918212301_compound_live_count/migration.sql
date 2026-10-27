-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Compound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL DEFAULT 'EG',
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "developer" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "centerLat" REAL,
    "centerLng" REAL,
    "geomJson" TEXT,
    "minSizeSqm" REAL,
    "maxSizeSqm" REAL,
    "unitTypesJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liveListingCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Compound_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Compound" ("areaId", "centerLat", "centerLng", "countryCode", "createdAt", "developer", "geomJson", "id", "maxSizeSqm", "metadataJson", "minSizeSqm", "nameAr", "nameEn", "slug", "unitTypesJson") SELECT "areaId", "centerLat", "centerLng", "countryCode", "createdAt", "developer", "geomJson", "id", "maxSizeSqm", "metadataJson", "minSizeSqm", "nameAr", "nameEn", "slug", "unitTypesJson" FROM "Compound";
DROP TABLE "Compound";
ALTER TABLE "new_Compound" RENAME TO "Compound";
CREATE UNIQUE INDEX "Compound_slug_key" ON "Compound"("slug");
CREATE INDEX "Compound_areaId_idx" ON "Compound"("areaId");
CREATE INDEX "Compound_liveListingCount_idx" ON "Compound"("liveListingCount" DESC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
