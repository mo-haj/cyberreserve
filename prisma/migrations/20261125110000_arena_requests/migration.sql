-- CreateTable
CREATE TABLE "ArenaRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "stations" INTEGER NOT NULL,
    "software" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cafeSlug" TEXT,
    "reply" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ArenaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArenaRequest_status_createdAt_idx" ON "ArenaRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ArenaRequest_userId_idx" ON "ArenaRequest"("userId");

-- AddForeignKey
ALTER TABLE "ArenaRequest" ADD CONSTRAINT "ArenaRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

