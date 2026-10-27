-- CreateIndex
CREATE INDEX "Message_conversationId_readAt_idx" ON "Message"("conversationId", "readAt");

-- CreateIndex
CREATE INDEX "TradeOffer_recipientId_status_expiresAt_idx" ON "TradeOffer"("recipientId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Unit_ownerId_idx" ON "Unit"("ownerId");

-- CreateIndex
CREATE INDEX "ViewingRequest_buyerId_status_idx" ON "ViewingRequest"("buyerId", "status");
