-- CreateEnum
CREATE TYPE "PowerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'PLAYER', 'SYSTEM', 'AGENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "telegramChatId" TEXT,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "strikesCount" INTEGER NOT NULL DEFAULT 0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "pcNumber" INTEGER NOT NULL,
    "staticIp" TEXT NOT NULL,
    "powerStatus" "PowerStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isMaintenance" BOOLEAN NOT NULL DEFAULT false,
    "specs" TEXT,
    "lastPingAt" TIMESTAMPTZ(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "deviceId" TEXT NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "actualStart" TIMESTAMPTZ(3),
    "actualEnd" TIMESTAMPTZ(3),
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "snackNotes" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SnackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSnack" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "snackItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BookingSnack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "nightShiftRate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PricingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorEmail" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pcNumber_key" ON "Device"("pcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Device_staticIp_key" ON "Device"("staticIp");

-- CreateIndex
CREATE INDEX "Booking_deviceId_startTime_idx" ON "Booking"("deviceId", "startTime");

-- CreateIndex
CREATE INDEX "Booking_userId_status_idx" ON "Booking"("userId", "status");

-- CreateIndex
CREATE INDEX "Booking_status_endTime_idx" ON "Booking"("status", "endTime");

-- CreateIndex
CREATE INDEX "BookingSnack_bookingId_idx" ON "BookingSnack"("bookingId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSnack" ADD CONSTRAINT "BookingSnack_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSnack" ADD CONSTRAINT "BookingSnack_snackItemId_fkey" FOREIGN KEY ("snackItemId") REFERENCES "SnackItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
