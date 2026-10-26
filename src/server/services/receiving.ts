import type { DocumentStatus, Prisma } from "@prisma/client";
import { assertRole, type Actor } from "../auth";
import { prisma, transaction, type Tx } from "../db";
import { AppError, Errors } from "../errors";
import type {
  DocumentCreate,
  DocumentListQuery,
  ItemInput,
  ReceiptCreate,
} from "../schemas";
import { toUserDto } from "./auth";
import { formatDocumentNumber, pageArgs, pageMeta, parseDocumentNumber } from "./format";
import { toProductDto } from "./products";

const documentInclude = {
  createdBy: true,
  items: {
    include: { product: { include: { inventory: true } } },
    orderBy: { product: { sku: "asc" } },
  },
  receipts: { include: { receivedBy: true }, orderBy: { receivedAt: "desc" } },
} satisfies Prisma.ReceivingDocumentInclude;

type DocumentFull = Prisma.ReceivingDocumentGetPayload<{ include: typeof documentInclude }>;
type ItemFull = DocumentFull["items"][number];
type ReceiptFull = DocumentFull["receipts"][number];

// ---------- DTO ----------

function dateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function toItemDto(item: ItemFull) {
  return {
    id: item.id,
    product: toProductDto(item.product),
    expectedQty: item.expectedQty,
    receivedQty: item.receivedQty,
    remainingQty: item.expectedQty - item.receivedQty,
  };
}

function toReceiptDto(receipt: ReceiptFull) {
  return {
    id: receipt.id,
    itemId: receipt.itemId,
    quantity: receipt.quantity,
    notes: receipt.notes,
    receivedBy: toUserDto(receipt.receivedBy),
    receivedAt: receipt.receivedAt,
  };
}

function summarize(
  doc: Prisma.ReceivingDocumentGetPayload<{ include: { items: true } }>,
) {
  return {
    id: doc.id,
    number: formatDocumentNumber(doc.number),
    supplierName: doc.supplierName,
    referenceNo: doc.referenceNo,
    status: doc.status,
    itemCount: doc.items.length,
    expectedTotal: doc.items.reduce((sum, item) => sum + item.expectedQty, 0),
    receivedTotal: doc.items.reduce((sum, item) => sum + item.receivedQty, 0),
    createdAt: doc.createdAt,
  };
}

function toDocumentDto(doc: DocumentFull) {
  return {
    ...summarize(doc),
    expectedDate: dateOnly(doc.expectedDate),
    notes: doc.notes,
    isFullyReceived: doc.items.length > 0 && doc.items.every((i) => i.receivedQty === i.expectedQty),
    cancelReason: doc.cancelReason,
    submittedAt: doc.submittedAt,
    completedAt: doc.completedAt,
    cancelledAt: doc.cancelledAt,
    createdBy: toUserDto(doc.createdBy),
    items: doc.items.map(toItemDto),
    receipts: doc.receipts.map(toReceiptDto),
  };
}

// ---------- helper ----------

/**
 * Kunci baris dokumen. Urutan kunci selalu dokumen -> item agar tidak deadlock.
 * Semua mutasi status/penerimaan harus lewat sini sehingga diserialkan per dokumen.
 */
async function lockDocument(tx: Tx, id: string): Promise<DocumentStatus> {
  const rows = await tx.$queryRaw<{ status: DocumentStatus }[]>`
    SELECT status FROM receiving_documents WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw Errors.notFound("Dokumen penerimaan");
  return rows[0].status;
}

async function assertProductsUsable(tx: Tx, items: ItemInput[]) {
  const ids = items.map((item) => item.productId);
  const products = await tx.product.findMany({ where: { id: { in: ids } } });
  const found = new Set(products.map((p) => p.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Produk tidak ditemukan.",
      missing.map((id) => ({ field: "items.productId", message: `${id} tidak ada` })),
    );
  }
  const inactive = products.filter((p) => !p.isActive).map((p) => p.sku);
  if (inactive.length > 0) throw Errors.productInactive(inactive);
}

// ---------- query ----------

export async function getDocument(id: string) {
  const doc = await prisma.receivingDocument.findUnique({ where: { id }, include: documentInclude });
  if (!doc) throw Errors.notFound("Dokumen penerimaan");
  return toDocumentDto(doc);
}

export async function listDocuments(query: DocumentListQuery) {
  const number = query.q ? parseDocumentNumber(query.q) : null;
  const where: Prisma.ReceivingDocumentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { supplierName: { contains: query.q, mode: "insensitive" } },
            { referenceNo: { contains: query.q, mode: "insensitive" } },
            ...(number !== null ? [{ number }] : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.receivingDocument.findMany({
      where,
      include: { items: true },
      orderBy: [{ createdAt: "desc" }, { number: "desc" }],
      ...pageArgs(query),
    }),
    prisma.receivingDocument.count({ where }),
  ]);
  return { data: rows.map(summarize), meta: pageMeta(query, total) };
}

// ---------- mutasi dokumen ----------

export async function createDocument(actor: Actor, input: DocumentCreate) {
  const created = await transaction(async (tx) => {
    await assertProductsUsable(tx, input.items);
    return tx.receivingDocument.create({
      data: {
        supplierName: input.supplierName,
        referenceNo: input.referenceNo || null,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes || null,
        createdById: actor.id,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            expectedQty: item.expectedQty,
          })),
        },
      },
    });
  });
  return getDocument(created.id);
}

export async function replaceItems(actor: Actor, id: string, items: ItemInput[]) {
  void actor;
  await transaction(async (tx) => {
    const status = await lockDocument(tx, id);
    if (status !== "DRAFT") {
      throw Errors.invalidTransition(`Item hanya dapat diubah saat DRAFT (status saat ini ${status}).`);
    }
    await assertProductsUsable(tx, items);
    await tx.receivingItem.deleteMany({ where: { documentId: id } });
    await tx.receivingItem.createMany({
      data: items.map((item) => ({
        documentId: id,
        productId: item.productId,
        expectedQty: item.expectedQty,
      })),
    });
    await tx.receivingDocument.update({ where: { id }, data: {} }); // sentuh updatedAt
  });
  return getDocument(id);
}

export async function submitDocument(actor: Actor, id: string) {
  void actor;
  await transaction(async (tx) => {
    const status = await lockDocument(tx, id);
    if (status !== "DRAFT") {
      throw Errors.invalidTransition(`Hanya dokumen DRAFT yang dapat diajukan (status saat ini ${status}).`);
    }
    const itemCount = await tx.receivingItem.count({ where: { documentId: id } });
    if (itemCount === 0) throw Errors.validation("Dokumen tanpa item tidak dapat diajukan.");
    await tx.receivingDocument.update({
      where: { id },
      data: { status: "OPEN", submittedAt: new Date() },
    });
  });
  return getDocument(id);
}

export async function completeDocument(actor: Actor, id: string) {
  assertRole(actor, "SUPERVISOR");
  await transaction(async (tx) => {
    const status = await lockDocument(tx, id);
    if (status !== "PARTIALLY_RECEIVED") {
      throw Errors.invalidTransition(
        `Dokumen hanya dapat diselesaikan dari status PARTIALLY_RECEIVED (status saat ini ${status}).`,
      );
    }
    const items = await tx.receivingItem.findMany({
      where: { documentId: id },
      include: { product: true },
    });
    const incomplete = items.filter((item) => item.receivedQty < item.expectedQty);
    if (incomplete.length > 0) {
      throw Errors.notFullyReceived(
        incomplete.map((item) => ({
          field: item.product.sku,
          message: `diterima ${item.receivedQty} dari ${item.expectedQty}`,
        })),
      );
    }
    await tx.receivingDocument.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), completedById: actor.id },
    });
  });
  return getDocument(id);
}

export async function cancelDocument(actor: Actor, id: string, reason: string) {
  assertRole(actor, "SUPERVISOR");
  await transaction(async (tx) => {
    const status = await lockDocument(tx, id);
    if (status !== "DRAFT" && status !== "OPEN") {
      throw Errors.invalidTransition(
        `Dokumen hanya dapat dibatalkan dari DRAFT atau OPEN (status saat ini ${status}).`,
      );
    }
    await tx.receivingDocument.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancelReason: reason,
      },
    });
  });
  return getDocument(id);
}

// ---------- penerimaan ----------

async function buildReceiptResult(tx: Tx, receiptId: string) {
  const receipt = await tx.receipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: {
      receivedBy: true,
      document: { select: { status: true } },
      item: { include: { product: { include: { inventory: true } } } },
    },
  });
  return {
    receipt: toReceiptDto(receipt),
    item: toItemDto(receipt.item),
    stockQuantity: receipt.item.product.inventory?.quantity ?? 0,
    documentStatus: receipt.document.status,
  };
}

/**
 * Satu-satunya jalur yang mengubah stok. Seluruh langkah berjalan dalam satu transaksi
 * (lihat docs/technical-spec.md bagian 6).
 */
export async function recordReceipt(
  actor: Actor,
  documentId: string,
  input: ReceiptCreate,
  idempotencyKey: string,
) {
  return transaction(async (tx) => {
    const status = await lockDocument(tx, documentId);

    // Idempotensi dicek setelah kunci dokumen: request kembar diserialkan sehingga
    // yang kedua pasti melihat receipt milik yang pertama.
    const existing = await tx.receipt.findUnique({
      where: { documentId_idempotencyKey: { documentId, idempotencyKey } },
    });
    if (existing) {
      if (existing.itemId !== input.itemId || existing.quantity !== input.quantity) {
        throw Errors.keyReused();
      }
      return { replayed: true, data: await buildReceiptResult(tx, existing.id) };
    }

    if (status !== "OPEN" && status !== "PARTIALLY_RECEIVED") throw Errors.notReceivable(status);

    const rows = await tx.$queryRaw<
      { id: string; product_id: string; expected_qty: number; received_qty: number }[]
    >`SELECT id, product_id, expected_qty, received_qty
        FROM receiving_items
       WHERE id = ${input.itemId}::uuid AND document_id = ${documentId}::uuid
         FOR UPDATE`;
    const item = rows[0];
    if (!item) throw Errors.notFound("Item dokumen");

    const remaining = item.expected_qty - item.received_qty;
    if (input.quantity > remaining) throw Errors.quantityExceeds(input.quantity, remaining);

    const receipt = await tx.receipt.create({
      data: {
        documentId,
        itemId: input.itemId,
        quantity: input.quantity,
        idempotencyKey,
        notes: input.notes || null,
        receivedById: actor.id,
      },
    });

    await tx.receivingItem.update({
      where: { id: input.itemId },
      data: { receivedQty: { increment: input.quantity } },
    });

    // Upsert atomik: aman walau baris inventory belum ada dan tidak bergantung pada nilai yang dibaca.
    const [stock] = await tx.$queryRaw<{ quantity: number }[]>`
      INSERT INTO inventory (product_id, quantity, updated_at)
      VALUES (${item.product_id}::uuid, ${input.quantity}, now())
      ON CONFLICT (product_id)
      DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()
      RETURNING quantity`;

    await tx.inventoryTransaction.create({
      data: {
        productId: item.product_id,
        type: "RECEIPT",
        quantityDelta: input.quantity,
        balanceAfter: stock.quantity,
        documentId,
        receiptId: receipt.id,
        createdById: actor.id,
      },
    });

    if (status === "OPEN") {
      await tx.receivingDocument.update({
        where: { id: documentId },
        data: { status: "PARTIALLY_RECEIVED" },
      });
    }

    return { replayed: false, data: await buildReceiptResult(tx, receipt.id) };
  });
}
