-- Postgres-only objects Prisma cannot express in the schema language.
-- Apply AFTER `prisma migrate deploy`. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Full-text search
-- ---------------------------------------------------------------------------
-- The search box uses `contains`, which becomes ILIKE '%term%'. A b-tree index cannot
-- serve a leading wildcard, so this is a sequential scan over every listing: measured at
-- 155ms on 20k rows on SQLite and getting linearly worse. A trigram GIN index makes it an
-- index lookup.
--
-- pg_trgm also gives fuzzy matching, which matters for Arabic transliteration: a buyer
-- typing "Mivida", "Mevida" or "ميفيدا" should reach the same compound.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listing_title_ar_trgm ON "Listing" USING gin ("titleAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listing_title_en_trgm ON "Listing" USING gin ("titleEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS compound_name_ar_trgm ON "Compound" USING gin ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS compound_name_en_trgm ON "Compound" USING gin ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS area_name_ar_trgm     ON "Area"     USING gin ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS area_name_en_trgm     ON "Area"     USING gin ("nameEn" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Partial indexes for the hot public queries
-- ---------------------------------------------------------------------------
-- Every buyer-facing query filters status='live' AND trustLevel>=2. A partial index
-- covers only those rows, so it stays small and hot in memory even as drafts, rejected
-- and sold listings accumulate — which they will, faster than live ones.
CREATE INDEX IF NOT EXISTS listing_public_published
  ON "Listing" ("publishedAt" DESC)
  WHERE status = 'live' AND "trustLevel" >= 2;

CREATE INDEX IF NOT EXISTS listing_public_price
  ON "Listing" (price)
  WHERE status = 'live' AND "trustLevel" >= 2;

CREATE INDEX IF NOT EXISTS listing_public_purpose_published
  ON "Listing" (purpose, "publishedAt" DESC)
  WHERE status = 'live' AND "trustLevel" >= 2;

-- Unread-message badge: the overwhelming majority of messages are read, so index only
-- the unread ones.
CREATE INDEX IF NOT EXISTS message_unread
  ON "Message" ("conversationId", "senderId")
  WHERE "readAt" IS NULL;

-- Live offers: the offers inbox and the expiry sweep both look only at pending rows.
CREATE INDEX IF NOT EXISTS offer_pending
  ON "Offer" ("sellerId", "buyerId", "expiresAt")
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Integrity that the application also enforces
-- ---------------------------------------------------------------------------
-- At most one cover photo per listing. src/lib/cover.ts maintains this in a transaction;
-- the constraint means a bug or a manual edit cannot leave two.
CREATE UNIQUE INDEX IF NOT EXISTS listing_media_single_cover
  ON "ListingMedia" ("listingId")
  WHERE "isCover" = true;

-- At most one live offer per (listing, buyer). offerService.ts enforces this; the
-- constraint makes a race impossible rather than unlikely.
CREATE UNIQUE INDEX IF NOT EXISTS offer_one_live_per_buyer
  ON "Offer" ("listingId", "buyerId")
  WHERE status = 'pending';
