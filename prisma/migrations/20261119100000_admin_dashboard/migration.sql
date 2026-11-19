-- Admin dashboard: arena posts can be text-only (photo added after saving).
-- AlterTable
ALTER TABLE "CafeSection" ALTER COLUMN "imageUrl" SET DEFAULT '';
