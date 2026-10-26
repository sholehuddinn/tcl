import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Hindari koneksi ganda saat hot reload di mode dev.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/** Transaksi default: READ COMMITTED + penguncian baris eksplisit di service. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  // maxWait/timeout dilonggarkan agar request paralel yang mengantre kunci baris tidak kedaluwarsa.
  return prisma.$transaction(fn, { maxWait: 20_000, timeout: 30_000 });
}
