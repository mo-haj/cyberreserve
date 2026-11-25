-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "ratingAskedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "closeMin" INTEGER,
ADD COLUMN     "openMin" INTEGER,
ADD COLUMN     "summarySentOn" TEXT;

-- CreateTable
CREATE TABLE "FreeWatch" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stationType" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaReview" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prizeAr" TEXT NOT NULL DEFAULT '',
    "prizeEn" TEXT NOT NULL DEFAULT '',
    "noteAr" TEXT NOT NULL DEFAULT '',
    "noteEn" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("tournamentId","userId")
);

-- CreateIndex
CREATE INDEX "FreeWatch_expiresAt_idx" ON "FreeWatch"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FreeWatch_cafeId_userId_key" ON "FreeWatch"("cafeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaReview_bookingId_key" ON "ArenaReview"("bookingId");

-- CreateIndex
CREATE INDEX "ArenaReview_cafeId_createdAt_idx" ON "ArenaReview"("cafeId", "createdAt");

-- CreateIndex
CREATE INDEX "Tournament_cafeId_startsAt_idx" ON "Tournament"("cafeId", "startsAt");

-- CreateIndex
CREATE INDEX "TournamentEntry_userId_idx" ON "TournamentEntry"("userId");

-- AddForeignKey
ALTER TABLE "FreeWatch" ADD CONSTRAINT "FreeWatch_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeWatch" ADD CONSTRAINT "FreeWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaReview" ADD CONSTRAINT "ArenaReview_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaReview" ADD CONSTRAINT "ArenaReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "ArenaFollow" (
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaFollow_pkey" PRIMARY KEY ("cafeId","userId")
);
CREATE INDEX "ArenaFollow_userId_idx" ON "ArenaFollow"("userId");
ALTER TABLE "ArenaFollow" ADD CONSTRAINT "ArenaFollow_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArenaFollow" ADD CONSTRAINT "ArenaFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
