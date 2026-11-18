-- Map pin for each arena (shown as a small map + "Open in Google Maps").
ALTER TABLE "Cafe" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Cafe" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Cafe" ADD CONSTRAINT "cafe_location_valid" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
