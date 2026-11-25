-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "subEndsAt" TIMESTAMPTZ(3),
ADD COLUMN     "subExpiredAt" TIMESTAMPTZ(3),
ADD COLUMN     "subPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subPlan" TEXT,
ADD COLUMN     "subWarnedAt" TIMESTAMPTZ(3);

