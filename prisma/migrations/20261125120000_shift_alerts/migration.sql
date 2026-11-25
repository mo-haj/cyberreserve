-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "noShiftAlertAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "StaffShift" ADD COLUMN     "autoStarted" BOOLEAN NOT NULL DEFAULT false;

