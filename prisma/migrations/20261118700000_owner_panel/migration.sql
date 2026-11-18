-- Owner panel: arena members (owners/staff), removable stations, owner actions in the audit log.
ALTER TYPE "ActorType" ADD VALUE IF NOT EXISTS 'OWNER';

CREATE TYPE "ArenaRole" AS ENUM ('OWNER', 'STAFF');
CREATE TABLE "ArenaMember" (
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ArenaRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArenaMember_pkey" PRIMARY KEY ("cafeId","userId")
);
CREATE INDEX "ArenaMember_userId_idx" ON "ArenaMember"("userId");
ALTER TABLE "ArenaMember" ADD CONSTRAINT "ArenaMember_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArenaMember" ADD CONSTRAINT "ArenaMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Device" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
