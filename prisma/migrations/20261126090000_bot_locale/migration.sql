-- The language a player picked for the Telegram bot (/language).
ALTER TABLE "User" ADD COLUMN "botLocale" TEXT;
