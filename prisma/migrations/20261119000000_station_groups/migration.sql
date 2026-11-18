-- Station groups: zones of stations with the same hardware (spec cards,
-- VIP rooms), each with an optional photo. Stations keep their old one-line
-- specs, shown only while they are not in a group.

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "StationGroup" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "type" "StationType" NOT NULL DEFAULT 'PC',
    "nameAr" TEXT NOT NULL DEFAULT '',
    "nameEn" TEXT NOT NULL DEFAULT '',
    "noteAr" TEXT NOT NULL DEFAULT '',
    "noteEn" TEXT NOT NULL DEFAULT '',
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "cpu" TEXT NOT NULL DEFAULT '',
    "gpu" TEXT NOT NULL DEFAULT '',
    "ram" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT '',
    "screen" TEXT NOT NULL DEFAULT '',
    "refreshHz" INTEGER,
    "controllers" INTEGER,
    "keyboard" TEXT NOT NULL DEFAULT '',
    "mouse" TEXT NOT NULL DEFAULT '',
    "headset" TEXT NOT NULL DEFAULT '',
    "chair" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StationGroup_cafeId_position_idx" ON "StationGroup"("cafeId", "position");

-- AddForeignKey
ALTER TABLE "StationGroup" ADD CONSTRAINT "StationGroup_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sane numbers only (the app checks the same).
ALTER TABLE "StationGroup" ADD CONSTRAINT "StationGroup_numbers_check"
  CHECK (("refreshHz" IS NULL OR "refreshHz" BETWEEN 30 AND 1000) AND ("controllers" IS NULL OR "controllers" BETWEEN 1 AND 16));
