import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { Role } from "@prisma/client";
import { hashPassword, type Actor } from "@/src/server/auth";
import { prisma } from "@/src/server/db";
import { AppError, type ErrorCode } from "@/src/server/errors";
import { createDocument, submitDocument } from "@/src/server/services/receiving";

export const TEST_PASSWORD = "pw-test-123";

export async function resetDb() {
  // TRUNCATE tidak memicu trigger append-only (hanya UPDATE/DELETE per baris).
  await prisma.$executeRawUnsafe(
    `TRUNCATE inventory_transactions, receipts, receiving_items, receiving_documents, inventory, products, users RESTART IDENTITY CASCADE`,
  );
}

export async function makeUser(role: Role, username = role.toLowerCase()): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      username,
      fullName: `Tes ${username}`,
      role,
      passwordHash: await hashPassword(TEST_PASSWORD),
    },
  });
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
}

export async function makeProduct(sku: string, extra: { isActive?: boolean } = {}) {
  return prisma.product.create({
    data: {
      sku,
      name: `Produk ${sku}`,
      isActive: extra.isActive ?? true,
      inventory: { create: { quantity: 0 } },
    },
  });
}

/** Dokumen berstatus OPEN dengan item (productId, expectedQty). */
export async function makeOpenDocument(
  actor: Actor,
  lines: { productId: string; expectedQty: number }[],
) {
  const draft = await createDocument(actor, { supplierName: "PT Pemasok Uji", items: lines });
  return submitDocument(actor, draft.id);
}

export const newKey = () => randomUUID();

export async function stockOf(productId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { productId } });
  return row?.quantity ?? 0;
}

/** Menangkap error dan memastikan itu AppError dengan kode & status tertentu. */
export async function expectAppError(promise: Promise<unknown>, code: ErrorCode, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).statusCode).toBe(status);
  return error as AppError;
}

/**
 * Invarian stok yang harus selalu benar setelah operasi apa pun:
 *  1. inventory.quantity = jumlah semua receipt untuk produk itu
 *  2. receiving_items.received_qty = jumlah receipt untuk item itu
 *  3. setiap receipt punya tepat satu inventory_transaction
 *  4. saldo (balance_after) tidak duplikat per produk dan saldo tertinggi = stok saat ini
 */
export async function assertInvariants() {
  const perProduct = await prisma.$queryRaw<{ sku: string; stock: number; received: number }[]>`
    SELECT p.sku, i.quantity AS stock,
           COALESCE((SELECT SUM(r.quantity) FROM receipts r
                      JOIN receiving_items ri ON ri.id = r.item_id
                     WHERE ri.product_id = p.id), 0)::int AS received
      FROM products p JOIN inventory i ON i.product_id = p.id`;
  for (const row of perProduct) {
    expect(row.stock, `stok ${row.sku} = jumlah receipt`).toBe(row.received);
  }

  const perItem = await prisma.$queryRaw<{ id: string; received_qty: number; total: number }[]>`
    SELECT ri.id, ri.received_qty,
           COALESCE((SELECT SUM(r.quantity) FROM receipts r WHERE r.item_id = ri.id), 0)::int AS total
      FROM receiving_items ri`;
  for (const row of perItem) expect(row.received_qty, `item ${row.id}`).toBe(row.total);

  const [orphans] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM receipts r
      LEFT JOIN inventory_transactions t ON t.receipt_id = r.id
     WHERE t.id IS NULL`;
  expect(orphans.n, "receipt tanpa transaksi stok").toBe(0);

  const chains = await prisma.$queryRaw<
    { product_id: string; n: number; distinct_balances: number; max_balance: number; stock: number }[]
  >`SELECT t.product_id, COUNT(*)::int AS n,
           COUNT(DISTINCT t.balance_after)::int AS distinct_balances,
           MAX(t.balance_after)::int AS max_balance, i.quantity AS stock
      FROM inventory_transactions t JOIN inventory i ON i.product_id = t.product_id
     GROUP BY t.product_id, i.quantity`;
  for (const row of chains) {
    expect(row.distinct_balances, "saldo tidak boleh duplikat").toBe(row.n);
    expect(row.max_balance, "saldo tertinggi = stok").toBe(row.stock);
  }
}
