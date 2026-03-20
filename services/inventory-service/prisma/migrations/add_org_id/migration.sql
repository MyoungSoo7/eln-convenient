ALTER TABLE "InventoryItem" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Category" ADD COLUMN "orgId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "InventoryItem_orgId_type_idx" ON "InventoryItem"("orgId", "type");
CREATE INDEX "InventoryItem_orgId_idx" ON "InventoryItem"("orgId");
DROP INDEX IF EXISTS "InventoryItem_type_idx";

-- Category: unique per org instead of globally
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_name_key";
CREATE UNIQUE INDEX "Category_orgId_name_key" ON "Category"("orgId", "name");
