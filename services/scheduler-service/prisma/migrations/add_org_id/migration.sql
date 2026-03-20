ALTER TABLE "resources" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bookings" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "resources_orgId_idx" ON "resources"("orgId");
CREATE INDEX "resources_orgId_type_idx" ON "resources"("orgId", "type");
DROP INDEX IF EXISTS "resources_type_idx";
CREATE INDEX "bookings_orgId_idx" ON "bookings"("orgId");
