-- Arenas across Syria: each arena belongs to a city (key from lib/cities.ts).
ALTER TABLE "Cafe" ADD COLUMN "city" TEXT NOT NULL DEFAULT 'damascus';
CREATE INDEX "Cafe_city_idx" ON "Cafe"("city");

-- Sign-in code is now typed in Telegram; count wrong tries (fails at 3).
ALTER TABLE "LoginRequest" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
-- Requests created with the old 2-digit flow cannot be completed any more.
UPDATE "LoginRequest" SET "status" = 'FAILED' WHERE "status" IN ('PENDING', 'AWAITING_CONTACT');

-- Player profile: full name, unique player name, accepted terms.
ALTER TABLE "User" ADD COLUMN "fullName" TEXT;
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN "nicknameKey" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "User_nicknameKey_key" ON "User"("nicknameKey");

-- Games each arena offers.
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genreEn" TEXT NOT NULL,
    "genreAr" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

CREATE TABLE "CafeGame" (
    "cafeId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    CONSTRAINT "CafeGame_pkey" PRIMARY KEY ("cafeId","gameId")
);
CREATE INDEX "CafeGame_gameId_idx" ON "CafeGame"("gameId");
ALTER TABLE "CafeGame" ADD CONSTRAINT "CafeGame_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CafeGame" ADD CONSTRAINT "CafeGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
