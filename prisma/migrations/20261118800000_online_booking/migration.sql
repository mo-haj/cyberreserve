-- Online booking: who cancelled, and the "still coming?" reminder.
ALTER TABLE "Booking" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
ALTER TABLE "Booking" ADD COLUMN "stillComingAt" TIMESTAMPTZ(3);
-- The reminder job looks for confirmed bookings by start time.
CREATE INDEX "Booking_status_startTime_idx" ON "Booking"("status", "startTime");
ALTER TABLE "Booking" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ar';
