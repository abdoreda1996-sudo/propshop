-- Automatic location verification (src/lib/locationCheck.ts).
-- Hand-written as ADD COLUMN: Prisma generated a full table redefine for this, the pattern
-- that has silently dropped columns in this repo before. Adding columns needs none of it.
ALTER TABLE "Listing" ADD COLUMN "locationStatus" TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE "Listing" ADD COLUMN "locationIssuesJson" TEXT;
ALTER TABLE "Listing" ADD COLUMN "locationCheckedAt" DATETIME;
CREATE INDEX "Listing_locationStatus_status_idx" ON "Listing"("locationStatus", "status");
