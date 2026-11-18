-- Consoles: every station has a type (PC by default), an optional name and
-- optional own prices. Consoles do not need a LAN address.
CREATE TYPE "StationType" AS ENUM ('PC', 'PS5', 'PS4', 'XBOX');
ALTER TABLE "Device" ADD COLUMN "type" "StationType" NOT NULL DEFAULT 'PC';
ALTER TABLE "Device" ADD COLUMN "label" TEXT;
ALTER TABLE "Device" ADD COLUMN "hourlyRate" DECIMAL(12,2);
ALTER TABLE "Device" ADD COLUMN "nightRate" DECIMAL(12,2);
ALTER TABLE "Device" ALTER COLUMN "staticIp" DROP NOT NULL;
ALTER TABLE "Device" ADD CONSTRAINT "device_rates_positive" CHECK (
  ("hourlyRate" IS NULL OR "hourlyRate" > 0) AND ("nightRate" IS NULL OR "nightRate" > 0)
);
