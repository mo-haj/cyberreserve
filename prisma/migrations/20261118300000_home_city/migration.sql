-- Player's home city (key from lib/cities.ts), set on the profile page.
ALTER TABLE "User" ADD COLUMN "homeCity" TEXT;
