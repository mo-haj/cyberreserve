-- Concurrency lock. This is the single most important migration in the project:
-- it makes double-booking a device impossible at the database level, no matter
-- how many requests race. Violations raise SQLSTATE 23P01 (exclusion_violation),
-- which the API maps to 409 Conflict.
--
-- Requires "startTime"/"endTime" to be timestamptz. Do not weaken this.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
ADD CONSTRAINT no_overlap_booking
EXCLUDE USING gist (
  "deviceId" WITH =,
  tstzrange("startTime", "endTime", '[)') WITH &&
) WHERE (status IN ('PENDING'::"BookingStatus", 'CONFIRMED'::"BookingStatus"));

-- Blocks zero-length and reversed bookings. Violations raise SQLSTATE 23514.
ALTER TABLE "Booking"
ADD CONSTRAINT booking_time_order CHECK ("endTime" > "startTime");
