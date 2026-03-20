-- Add orgId to Note
ALTER TABLE "Note" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';

-- Add orgId to Template
ALTER TABLE "Template" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';

-- Update indexes
CREATE INDEX "Note_orgId_type_status_deletedAt_idx" ON "Note"("orgId", "type", "status", "deletedAt");
CREATE INDEX "Note_orgId_authorId_type_status_idx" ON "Note"("orgId", "authorId", "type", "status");
DROP INDEX IF EXISTS "Note_type_status_deletedAt_idx";
DROP INDEX IF EXISTS "Note_authorId_type_status_idx";
CREATE INDEX "Template_orgId_idx" ON "Template"("orgId");
