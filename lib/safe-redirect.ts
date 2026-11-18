// Only same-site paths are allowed as "go back to" targets, so links like
// /api/lang?next=https://evil.example cannot send visitors to another site.
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(next)) return '/';
  return next.length > 512 ? '/' : next;
}
