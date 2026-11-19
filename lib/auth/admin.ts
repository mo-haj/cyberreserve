// Super admin: the site owner. Listed by Telegram account ID in
// ADMIN_TELEGRAM_IDS (comma-separated), e.g. ADMIN_TELEGRAM_IDS=123456789.
// A super admin can open and change every arena, add arenas, publish or hide
// them, and choose their owners. Nobody else can.

export function adminTelegramIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS ?? '')
      // Tolerates quotes and spaces pasted with the value ("905737127", 1, 2).
      .replace(/["']/g, '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{3,20}$/.test(s)),
  );
}

export function isSuperAdminTelegram(telegramId: string | null | undefined): boolean {
  return !!telegramId && adminTelegramIds().has(telegramId);
}
