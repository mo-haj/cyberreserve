-- Arena logo + uploaded logos/banners (kept in the database, so backups include them).
ALTER TABLE "Cafe" ADD COLUMN "logoImage" TEXT;

CREATE TABLE "ArenaImage" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArenaImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArenaImage_cafeId_kind_idx" ON "ArenaImage"("cafeId", "kind");
ALTER TABLE "ArenaImage" ADD CONSTRAINT "ArenaImage_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
