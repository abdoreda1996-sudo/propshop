-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "valueGapPct" REAL;

-- CreateIndex
CREATE INDEX "Listing_status_trustLevel_valueGapPct_idx" ON "Listing"("status", "trustLevel", "valueGapPct");
