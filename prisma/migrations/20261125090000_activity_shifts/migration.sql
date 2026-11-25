-- Staff as their own actor type in the audit log.
ALTER TYPE "ActorType" ADD VALUE IF NOT EXISTS 'STAFF';

-- Activity per arena, linked to the shift it happened in.
ALTER TABLE "AuditLog" ADD COLUMN "cafeId" TEXT, ADD COLUMN "shiftId" TEXT;
CREATE INDEX "AuditLog_cafeId_createdAt_idx" ON "AuditLog"("cafeId", "createdAt");

-- CreateTable
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffShift_cafeId_startedAt_idx" ON "StaffShift"("cafeId", "startedAt");
CREATE INDEX "StaffShift_userId_idx" ON "StaffShift"("userId");
-- One open shift per person per arena (a double click starts one).
CREATE UNIQUE INDEX "StaffShift_one_open" ON "StaffShift"("cafeId", "userId") WHERE "endedAt" IS NULL;

ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
