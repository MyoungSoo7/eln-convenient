ALTER TABLE "AuditLog" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExportJob" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");
CREATE INDEX "Notification_orgId_recipientId_isRead_idx" ON "Notification"("orgId", "recipientId", "isRead");
