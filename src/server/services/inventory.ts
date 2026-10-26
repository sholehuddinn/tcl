import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { InventoryListQuery, TransactionListQuery } from "../schemas";
import { formatDocumentNumber, pageArgs, pageMeta } from "./format";

export async function listInventory(query: InventoryListQuery) {
  const where: Prisma.InventoryWhereInput = query.q
    ? {
        product: {
          OR: [
            { sku: { contains: query.q, mode: "insensitive" } },
            { name: { contains: query.q, mode: "insensitive" } },
          ],
        },
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: { product: true },
      orderBy: { product: { sku: "asc" } },
      ...pageArgs(query),
    }),
    prisma.inventory.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      productId: row.productId,
      sku: row.product.sku,
      name: row.product.name,
      unit: row.product.unit,
      quantity: row.quantity,
      updatedAt: row.updatedAt,
    })),
    meta: pageMeta(query, total),
  };
}

export async function listTransactions(query: TransactionListQuery) {
  const where: Prisma.InventoryTransactionWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.documentId ? { documentId: query.documentId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: { product: true, document: true, createdBy: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageArgs(query),
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      type: row.type,
      productId: row.productId,
      sku: row.product.sku,
      productName: row.product.name,
      quantityDelta: row.quantityDelta,
      balanceAfter: row.balanceAfter,
      documentId: row.documentId,
      documentNumber: formatDocumentNumber(row.document.number),
      createdBy: row.createdBy.fullName,
      createdAt: row.createdAt,
    })),
    meta: pageMeta(query, total),
  };
}
