-- Coastal is a property of the area, not the unit type: see src/lib/segments.ts.
-- Defaults to false, so every existing area stays non-coastal until ops flags it.
ALTER TABLE "Area" ADD COLUMN "isCoastal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Area_isCoastal_idx" ON "Area"("isCoastal");
