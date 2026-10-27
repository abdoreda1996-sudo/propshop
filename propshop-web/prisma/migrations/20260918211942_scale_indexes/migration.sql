-- DropIndex
DROP INDEX "Listing_publishedAt_idx";

-- DropIndex
DROP INDEX "Listing_purpose_idx";

-- DropIndex
DROP INDEX "Listing_status_trustLevel_idx";

-- DropIndex
DROP INDEX "ListingMedia_listingId_idx";

-- DropIndex
DROP INDEX "Message_conversationId_idx";

-- DropIndex
DROP INDEX "Offer_sellerId_idx";

-- DropIndex
DROP INDEX "Offer_buyerId_idx";

-- CreateIndex
CREATE INDEX "Conversation_ownerId_idx" ON "Conversation"("ownerId");

-- CreateIndex
CREATE INDEX "Conversation_buyerId_idx" ON "Conversation"("buyerId");

-- CreateIndex
CREATE INDEX "Deal_buyerId_idx" ON "Deal"("buyerId");

-- CreateIndex
CREATE INDEX "Deal_sellerId_idx" ON "Deal"("sellerId");

-- CreateIndex
CREATE INDEX "Listing_status_trustLevel_publishedAt_idx" ON "Listing"("status", "trustLevel", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Listing_status_trustLevel_purpose_publishedAt_idx" ON "Listing"("status", "trustLevel", "purpose", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Listing_status_trustLevel_price_idx" ON "Listing"("status", "trustLevel", "price");

-- CreateIndex
CREATE INDEX "Listing_status_trustLevel_featuredUntil_idx" ON "Listing"("status", "trustLevel", "featuredUntil" DESC);

-- CreateIndex
CREATE INDEX "Listing_unitId_idx" ON "Listing"("unitId");

-- CreateIndex
CREATE INDEX "Listing_expiresAt_idx" ON "Listing"("expiresAt");

-- CreateIndex
CREATE INDEX "ListingMedia_listingId_isCover_sortOrder_idx" ON "ListingMedia"("listingId", "isCover" DESC, "sortOrder");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_readAt_idx" ON "Message"("readAt");

-- CreateIndex
CREATE INDEX "Offer_buyerId_createdAt_idx" ON "Offer"("buyerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Offer_sellerId_createdAt_idx" ON "Offer"("sellerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Offer_status_expiresAt_idx" ON "Offer"("status", "expiresAt");
