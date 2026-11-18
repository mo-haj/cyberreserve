// Makes a player the owner (or staff) of an arena, so they see the owner
// panel at /manage. The player must have signed in once with Telegram.
//
//   docker compose exec web node node_modules/tsx/dist/cli.mjs scripts/add-owner.ts <arena-slug> <phone> [OWNER|STAFF]
//   docker compose exec web node node_modules/tsx/dist/cli.mjs scripts/add-owner.ts <arena-slug> <phone> REMOVE
//
// Self-contained (no "@/" imports) so it runs with plain tsx in the image.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^09\d{8}$/.test(digits)) digits = `963${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

async function main() {
  const [slug, rawPhone, rawRole = 'OWNER'] = process.argv.slice(2);
  const role = rawRole.toUpperCase();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!slug) {
    const all = await prisma.cafe.findMany({ select: { slug: true, nameEn: true }, orderBy: { slug: 'asc' } });
    for (const c of all) console.log(`  ${c.slug}  (${c.nameEn})`);
    return;
  }
  if (!phone || !['OWNER', 'STAFF', 'REMOVE'].includes(role)) {
    console.log('Usage: add-owner.ts <arena-slug> <phone, e.g. 0944123456 or +963944123456> [OWNER|STAFF|REMOVE]');
    process.exitCode = 1;
    return;
  }
  const cafe = await prisma.cafe.findUnique({ where: { slug }, select: { id: true, nameEn: true } });
  if (!cafe) {
    const all = await prisma.cafe.findMany({ select: { slug: true }, orderBy: { slug: 'asc' } });
    console.log(`No arena "${slug}". Arenas: ${all.map((c) => c.slug).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, name: true, nickname: true } });
  if (!user) {
    console.log(`No player with ${phone}. They must sign in once with Telegram first.`);
    process.exitCode = 1;
    return;
  }
  if (role === 'REMOVE') {
    await prisma.arenaMember.deleteMany({ where: { cafeId: cafe.id, userId: user.id } });
    console.log(`Removed ${user.nickname ?? user.name} from ${cafe.nameEn}.`);
    return;
  }
  await prisma.arenaMember.upsert({
    where: { cafeId_userId: { cafeId: cafe.id, userId: user.id } },
    update: { role: role as 'OWNER' | 'STAFF' },
    create: { cafeId: cafe.id, userId: user.id, role: role as 'OWNER' | 'STAFF' },
  });
  await prisma.auditLog.create({
    data: { actorType: 'SYSTEM', action: 'arena.member.set', details: { arena: slug, userId: user.id, role } },
  });
  console.log(`${user.nickname ?? user.name} is now ${role} of ${cafe.nameEn}. They can open /manage after signing in.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
