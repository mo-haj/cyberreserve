-- The bot talks to each sign-in in the language chosen on the website (switchable in the chat).
ALTER TABLE "LoginRequest" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ar';
