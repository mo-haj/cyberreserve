-- Walk-in for a guest without an account: the name the staff typed.
ALTER TABLE "Booking" ADD COLUMN "guestName" TEXT;
