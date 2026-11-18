-- Multi-cafe: CyberReserve becomes a directory of gaming cafes.
-- Upgrades an existing single-cafe database in place: the PCs that already
-- exist are moved into one cafe ("mezzeh-arena"), which the seed then fills in.

-- CreateTable
CREATE TABLE "Cafe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "areaEn" TEXT NOT NULL,
    "areaAr" TEXT NOT NULL,
    "addressEn" TEXT NOT NULL,
    "addressAr" TEXT NOT NULL,
    "taglineEn" TEXT NOT NULL,
    "taglineAr" TEXT NOT NULL,
    "hoursEn" TEXT NOT NULL,
    "hoursAr" TEXT NOT NULL,
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "nightShiftRate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "coverImage" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cafe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeSection" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "CafeSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cafe_slug_key" ON "Cafe"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CafeSection_cafeId_position_key" ON "CafeSection"("cafeId", "position");

-- Existing PCs (from the single-cafe version) need a cafe to belong to.
INSERT INTO "Cafe" ("id", "slug", "nameEn", "nameAr", "areaEn", "areaAr", "addressEn", "addressAr",
                    "taglineEn", "taglineAr", "hoursEn", "hoursAr", "hourlyRate", "nightShiftRate",
                    "coverImage", "isDemo", "updatedAt")
SELECT 'cafe-mezzeh-arena', 'mezzeh-arena', 'Mezzeh Arena', 'ميزة أرينا', 'Mezzeh', 'المزة',
       'Mezzeh', 'المزة', '-', '-', '-', '-', 100, 80,
       '/cafes/cover-1.svg', true, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Device");

-- AlterTable: add cafeId, fill it for existing rows, then make it required.
ALTER TABLE "Device" ADD COLUMN "cafeId" TEXT;
UPDATE "Device" SET "cafeId" = 'cafe-mezzeh-arena' WHERE "cafeId" IS NULL;
ALTER TABLE "Device" ALTER COLUMN "cafeId" SET NOT NULL;

-- PC numbers and LAN addresses become unique per cafe instead of globally.
DROP INDEX "Device_pcNumber_key";
DROP INDEX "Device_staticIp_key";
CREATE UNIQUE INDEX "Device_cafeId_pcNumber_key" ON "Device"("cafeId", "pcNumber");
CREATE UNIQUE INDEX "Device_cafeId_staticIp_key" ON "Device"("cafeId", "staticIp");

-- AddForeignKey
ALTER TABLE "CafeSection" ADD CONSTRAINT "CafeSection_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
