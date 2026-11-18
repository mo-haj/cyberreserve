import { PrismaClient } from '@prisma/client';

// Single PrismaClient for the whole app. In development, Next.js hot reload
// re-evaluates modules, so the instance is cached on globalThis to avoid
// opening a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
