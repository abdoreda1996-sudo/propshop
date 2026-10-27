-- Remove paid "featured" placement.
--
-- The featured-placement fee was removed from the fee model (owner, 2026-09-19), leaving a
-- promoted slot that nobody could buy. That is either dead code or an undisclosed ranking
-- advantage, so the column and its index go with the product.
--
-- Data loss is intentional and limited to demo rows: `featuredUntil` held nothing but
-- seed-generated timestamps. If paid placement ever returns it is a new column and a new
-- migration, not a revival of this one.

DROP INDEX IF EXISTS "Listing_status_trustLevel_featuredUntil_idx";

ALTER TABLE "Listing" DROP COLUMN "featuredUntil";
