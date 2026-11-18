-- Telegram sign-in: login requests and browser sessions.

-- CreateEnum
CREATE TYPE "LoginStatus" AS ENUM ('PENDING', 'AWAITING_CONTACT', 'CONFIRMED', 'CONSUMED', 'FAILED');

-- CreateTable
CREATE TABLE "LoginRequest" (
    "id" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "status" "LoginStatus" NOT NULL DEFAULT 'PENDING',
    "telegramUserId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginRequest_shortId_key" ON "LoginRequest"("shortId");

-- CreateIndex
CREATE INDEX "LoginRequest_telegramUserId_status_idx" ON "LoginRequest"("telegramUserId", "status");

-- CreateIndex
CREATE INDEX "LoginRequest_expiresAt_idx" ON "LoginRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginRequest" ADD CONSTRAINT "LoginRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
