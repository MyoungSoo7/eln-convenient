ALTER TABLE "files" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "export_jobs" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "files_orgId_idx" ON "files"("orgId");
