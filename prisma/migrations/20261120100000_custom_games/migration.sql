-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "ownerCafeId" TEXT;

-- CreateIndex
CREATE INDEX "Game_ownerCafeId_idx" ON "Game"("ownerCafeId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerCafeId_fkey" FOREIGN KEY ("ownerCafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

