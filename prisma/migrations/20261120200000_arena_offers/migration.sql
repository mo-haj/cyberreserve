-- CreateTable
CREATE TABLE "ArenaOffer" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stationType" TEXT NOT NULL DEFAULT '',
    "noteAr" TEXT NOT NULL DEFAULT '',
    "noteEn" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaOffer_cafeId_position_idx" ON "ArenaOffer"("cafeId", "position");

-- AddForeignKey
ALTER TABLE "ArenaOffer" ADD CONSTRAINT "ArenaOffer_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

