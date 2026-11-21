-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "ArenaBan" (
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "until" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "byUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaBan_pkey" PRIMARY KEY ("cafeId","userId")
);

-- CreateTable
CREATE TABLE "BookingMessage" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPending" (
    "chatId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelegramPending_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "ArenaBan_userId_idx" ON "ArenaBan"("userId");

-- CreateIndex
CREATE INDEX "BookingMessage_bookingId_idx" ON "BookingMessage"("bookingId");

-- AddForeignKey
ALTER TABLE "ArenaBan" ADD CONSTRAINT "ArenaBan_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaBan" ADD CONSTRAINT "ArenaBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingMessage" ADD CONSTRAINT "BookingMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

