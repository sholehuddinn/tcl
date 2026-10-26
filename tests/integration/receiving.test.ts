import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/src/server/auth";
import { prisma } from "@/src/server/db";
import { createProduct } from "@/src/server/services/products";
import {
  cancelDocument,
  completeDocument,
  createDocument,
  getDocument,
  recordReceipt,
  replaceItems,
  submitDocument,
} from "@/src/server/services/receiving";
import {
  assertInvariants,
  expectAppError,
  makeOpenDocument,
  makeProduct,
  makeUser,
  newKey,
  resetDb,
  stockOf,
} from "../helpers";

let operator: Actor;
let supervisor: Actor;
let productA: { id: string };
let productB: { id: string };

beforeEach(async () => {
  await resetDb();
  operator = await makeUser("OPERATOR");
  supervisor = await makeUser("SUPERVISOR");
  productA = await makeProduct("PRD-A");
  productB = await makeProduct("PRD-B");
});

async function openDoc() {
  const doc = await makeOpenDocument(operator, [
    { productId: productA.id, expectedQty: 10 },
    { productId: productB.id, expectedQty: 5 },
  ]);
  const itemA = doc.items.find((i) => i.product.id === productA.id)!;
  const itemB = doc.items.find((i) => i.product.id === productB.id)!;
  return { doc, itemA, itemB };
}

describe("alur penerimaan sebagian dan penuh (BR-07, BR-08, BR-11)", () => {
  it("penerimaan sebagian menambah stok, mengurangi sisa, dan mengubah status", async () => {
    const { doc, itemA } = await openDoc();
    expect(doc.status).toBe("OPEN");

    const { replayed, data } = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, newKey());

    expect(replayed).toBe(false);
    expect(data.item.receivedQty).toBe(4);
    expect(data.item.remainingQty).toBe(6);
    expect(data.stockQuantity).toBe(4);
    expect(data.documentStatus).toBe("PARTIALLY_RECEIVED");
    expect(await stockOf(productA.id)).toBe(4);

    const transactions = await prisma.inventoryTransaction.findMany({ where: { productId: productA.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ type: "RECEIPT", quantityDelta: 4, balanceAfter: 4, documentId: doc.id });
    await assertInvariants();
  });

  it("penerimaan berikutnya sampai penuh; saldo riwayat berurutan", async () => {
    const { doc, itemA } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, newKey());
    const second = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 6 }, newKey());

    expect(second.data.item.remainingQty).toBe(0);
    expect(second.data.stockQuantity).toBe(10);

    const history = await prisma.inventoryTransaction.findMany({
      where: { productId: productA.id },
      orderBy: { balanceAfter: "asc" },
    });
    expect(history.map((t) => t.balanceAfter)).toEqual([4, 10]);
    expect(history.map((t) => t.quantityDelta)).toEqual([4, 6]);
    await assertInvariants();
  });

  it("stok dari beberapa dokumen untuk produk yang sama terakumulasi", async () => {
    const first = await openDoc();
    const second = await openDoc();
    await recordReceipt(operator, first.doc.id, { itemId: first.itemA.id, quantity: 7 }, newKey());
    await recordReceipt(operator, second.doc.id, { itemId: second.itemA.id, quantity: 3 }, newKey());
    expect(await stockOf(productA.id)).toBe(10);
    await assertInvariants();
  });
});

describe("penerimaan ditolak tanpa mengubah data (BR-06, BR-07)", () => {
  it("melebihi sisa -> 422 dan stok/item/riwayat tidak berubah", async () => {
    const { doc, itemA } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, newKey());

    const error = await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 7 }, newKey()),
      "QUANTITY_EXCEEDS_REMAINING",
      422,
    );
    expect(error.message).toContain("sisa (6)");

    expect(await stockOf(productA.id)).toBe(4);
    expect((await getDocument(doc.id)).items.find((i) => i.id === itemA.id)?.receivedQty).toBe(4);
    expect(await prisma.receipt.count()).toBe(1);
    expect(await prisma.inventoryTransaction.count()).toBe(1);
    await assertInvariants();
  });

  it("tepat sebesar sisa diterima, satu unit lebih ditolak", async () => {
    const { doc, itemB } = await openDoc();
    await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 6 }, newKey()),
      "QUANTITY_EXCEEDS_REMAINING",
      422,
    );
    const ok = await recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 5 }, newKey());
    expect(ok.data.item.remainingQty).toBe(0);
    await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 1 }, newKey()),
      "QUANTITY_EXCEEDS_REMAINING",
      422,
    );
    await assertInvariants();
  });

  it("dokumen DRAFT tidak dapat menerima barang", async () => {
    const draft = await createDocument(operator, {
      supplierName: "PT X",
      items: [{ productId: productA.id, expectedQty: 5 }],
    });
    await expectAppError(
      recordReceipt(operator, draft.id, { itemId: draft.items[0].id, quantity: 1 }, newKey()),
      "DOCUMENT_NOT_RECEIVABLE",
      409,
    );
    expect(await stockOf(productA.id)).toBe(0);
  });

  it("item milik dokumen lain -> 404", async () => {
    const first = await openDoc();
    const second = await openDoc();
    await expectAppError(
      recordReceipt(operator, first.doc.id, { itemId: second.itemA.id, quantity: 1 }, newKey()),
      "NOT_FOUND",
      404,
    );
  });

  it("dokumen tidak ada -> 404", async () => {
    await expectAppError(
      recordReceipt(operator, "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11", { itemId: "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b12", quantity: 1 }, newKey()),
      "NOT_FOUND",
      404,
    );
  });
});

describe("idempotensi (BR-12)", () => {
  it("key sama + isi sama -> replay tanpa menambah stok", async () => {
    const { doc, itemA } = await openDoc();
    const key = newKey();
    const first = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, key);
    const again = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, key);

    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.data.receipt.id).toBe(first.data.receipt.id);
    expect(await stockOf(productA.id)).toBe(4);
    expect(await prisma.receipt.count()).toBe(1);
    expect(await prisma.inventoryTransaction.count()).toBe(1);
    await assertInvariants();
  });

  it("key sama + isi berbeda -> 409 IDEMPOTENCY_KEY_REUSED dan stok tetap", async () => {
    const { doc, itemA } = await openDoc();
    const key = newKey();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 4 }, key);
    await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 5 }, key),
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
    expect(await stockOf(productA.id)).toBe(4);
    await assertInvariants();
  });

  it("key yang sama boleh dipakai di dokumen berbeda", async () => {
    const first = await openDoc();
    const second = await openDoc();
    const key = newKey();
    await recordReceipt(operator, first.doc.id, { itemId: first.itemA.id, quantity: 2 }, key);
    const other = await recordReceipt(operator, second.doc.id, { itemId: second.itemA.id, quantity: 2 }, key);
    expect(other.replayed).toBe(false);
    expect(await stockOf(productA.id)).toBe(4);
  });

  it("replay tetap berhasil setelah dokumen COMPLETED", async () => {
    const { doc, itemA, itemB } = await openDoc();
    const key = newKey();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 10 }, key);
    await recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 5 }, newKey());
    await completeDocument(supervisor, doc.id);

    const again = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 10 }, key);
    expect(again.replayed).toBe(true);
    expect(await stockOf(productA.id)).toBe(10);
  });
});

describe("menyelesaikan dokumen (BR-09)", () => {
  it("ditolak bila ada item belum penuh dan menyebutkan itemnya", async () => {
    const { doc, itemA, itemB } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 10 }, newKey());
    await recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 3 }, newKey());

    const error = await expectAppError(completeDocument(supervisor, doc.id), "DOCUMENT_NOT_FULLY_RECEIVED", 409);
    expect(error.details).toEqual([{ field: "PRD-B", message: "diterima 3 dari 5" }]);
    expect((await getDocument(doc.id)).status).toBe("PARTIALLY_RECEIVED");
  });

  it("berhasil bila semua item penuh", async () => {
    const { doc, itemA, itemB } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 10 }, newKey());
    await recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 5 }, newKey());

    const done = await completeDocument(supervisor, doc.id);
    expect(done.status).toBe("COMPLETED");
    expect(done.isFullyReceived).toBe(true);
    expect(done.completedAt).not.toBeNull();
  });

  it("dari OPEN (belum ada penerimaan) ditolak 409", async () => {
    const { doc } = await openDoc();
    await expectAppError(completeDocument(supervisor, doc.id), "INVALID_STATE_TRANSITION", 409);
  });

  it("dokumen COMPLETED tidak dapat menerima barang lagi atau diselesaikan ulang", async () => {
    const { doc, itemA, itemB } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 10 }, newKey());
    await recordReceipt(operator, doc.id, { itemId: itemB.id, quantity: 5 }, newKey());
    await completeDocument(supervisor, doc.id);

    await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 1 }, newKey()),
      "DOCUMENT_NOT_RECEIVABLE",
      409,
    );
    await expectAppError(completeDocument(supervisor, doc.id), "INVALID_STATE_TRANSITION", 409);
    await assertInvariants();
  });

  it("Operator tidak berhak (403)", async () => {
    const { doc } = await openDoc();
    await expectAppError(completeDocument(operator, doc.id), "FORBIDDEN", 403);
  });
});

describe("membatalkan dokumen (BR-10)", () => {
  it("DRAFT dan OPEN dapat dibatalkan dengan alasan", async () => {
    const draft = await createDocument(operator, {
      supplierName: "PT X",
      items: [{ productId: productA.id, expectedQty: 5 }],
    });
    const cancelledDraft = await cancelDocument(supervisor, draft.id, "salah input");
    expect(cancelledDraft.status).toBe("CANCELLED");
    expect(cancelledDraft.cancelReason).toBe("salah input");

    const { doc } = await openDoc();
    expect((await cancelDocument(supervisor, doc.id, "pemasok batal")).status).toBe("CANCELLED");
  });

  it("setelah ada penerimaan tidak dapat dibatalkan; stok tidak berubah", async () => {
    const { doc, itemA } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 2 }, newKey());
    await expectAppError(cancelDocument(supervisor, doc.id, "ingin batal"), "INVALID_STATE_TRANSITION", 409);
    expect(await stockOf(productA.id)).toBe(2);
  });

  it("dokumen CANCELLED tidak dapat menerima barang, diajukan, atau diubah itemnya", async () => {
    const { doc, itemA } = await openDoc();
    await cancelDocument(supervisor, doc.id, "pemasok batal");
    await expectAppError(
      recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 1 }, newKey()),
      "DOCUMENT_NOT_RECEIVABLE",
      409,
    );
    await expectAppError(submitDocument(operator, doc.id), "INVALID_STATE_TRANSITION", 409);
    await expectAppError(
      replaceItems(operator, doc.id, [{ productId: productA.id, expectedQty: 1 }]),
      "INVALID_STATE_TRANSITION",
      409,
    );
  });

  it("Operator tidak berhak (403)", async () => {
    const { doc } = await openDoc();
    await expectAppError(cancelDocument(operator, doc.id, "alasan apa pun"), "FORBIDDEN", 403);
  });
});

describe("dokumen dan item (BR-03, BR-04, BR-05)", () => {
  it("nomor dokumen berurutan dan dimulai sebagai DRAFT", async () => {
    const a = await createDocument(operator, { supplierName: "PT A", items: [{ productId: productA.id, expectedQty: 1 }] });
    const b = await createDocument(operator, { supplierName: "PT B", items: [{ productId: productA.id, expectedQty: 1 }] });
    expect(a.status).toBe("DRAFT");
    expect(a.number).toMatch(/^RCV-\d{6}$/);
    expect(Number(b.number.slice(4))).toBe(Number(a.number.slice(4)) + 1);
  });

  it("item dapat diganti saat DRAFT, tidak setelah diajukan", async () => {
    const draft = await createDocument(operator, {
      supplierName: "PT X",
      items: [{ productId: productA.id, expectedQty: 5 }],
    });
    const changed = await replaceItems(operator, draft.id, [{ productId: productB.id, expectedQty: 9 }]);
    expect(changed.items).toHaveLength(1);
    expect(changed.items[0]).toMatchObject({ expectedQty: 9 });
    expect(changed.items[0].product.id).toBe(productB.id);

    await submitDocument(operator, draft.id);
    await expectAppError(
      replaceItems(operator, draft.id, [{ productId: productA.id, expectedQty: 1 }]),
      "INVALID_STATE_TRANSITION",
      409,
    );
  });

  it("submit dua kali ditolak", async () => {
    const { doc } = await openDoc();
    await expectAppError(submitDocument(operator, doc.id), "INVALID_STATE_TRANSITION", 409);
  });

  it("produk nonaktif tidak dapat ditambahkan (422) dan produk tak dikenal 404", async () => {
    const inactive = await makeProduct("PRD-OFF", { isActive: false });
    await expectAppError(
      createDocument(operator, { supplierName: "PT X", items: [{ productId: inactive.id, expectedQty: 1 }] }),
      "PRODUCT_INACTIVE",
      422,
    );
    await expectAppError(
      createDocument(operator, {
        supplierName: "PT X",
        items: [{ productId: "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11", expectedQty: 1 }],
      }),
      "NOT_FOUND",
      404,
    );
  });

  it("dokumen yang sudah OPEN tetap dapat menerima produk yang kemudian dinonaktifkan", async () => {
    const { doc, itemA } = await openDoc();
    await prisma.product.update({ where: { id: productA.id }, data: { isActive: false } });
    const result = await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 1 }, newKey());
    expect(result.data.stockQuantity).toBe(1);
  });
});

describe("produk", () => {
  it("SKU duplikat ditolak 409 tanpa memandang huruf besar/kecil sumbernya", async () => {
    await createProduct(supervisor, { sku: "DUP-1", name: "Satu", unit: "pcs" });
    await expectAppError(createProduct(supervisor, { sku: "DUP-1", name: "Dua", unit: "pcs" }), "SKU_ALREADY_EXISTS", 409);
  });

  it("produk baru memiliki stok 0 dan hanya Supervisor yang boleh membuat", async () => {
    const created = await createProduct(supervisor, { sku: "NEW-1", name: "Baru", unit: "pcs" });
    expect(created.quantity).toBe(0);
    await expectAppError(createProduct(operator, { sku: "NEW-2", name: "Baru", unit: "pcs" }), "FORBIDDEN", 403);
  });
});

describe("constraint database sebagai lapis pertahanan terakhir", () => {
  it("received_qty > expected_qty ditolak oleh CHECK", async () => {
    const { itemA } = await openDoc();
    await expect(
      prisma.$executeRaw`UPDATE receiving_items SET received_qty = expected_qty + 1 WHERE id = ${itemA.id}::uuid`,
    ).rejects.toThrow(/receiving_items_received_qty_chk/);
  });

  it("stok negatif ditolak oleh CHECK", async () => {
    await expect(
      prisma.$executeRaw`UPDATE inventory SET quantity = -1 WHERE product_id = ${productA.id}::uuid`,
    ).rejects.toThrow(/inventory_quantity_chk/);
  });

  it("riwayat transaksi tidak dapat diubah atau dihapus (append-only)", async () => {
    const { doc, itemA } = await openDoc();
    await recordReceipt(operator, doc.id, { itemId: itemA.id, quantity: 1 }, newKey());
    await expect(prisma.$executeRaw`UPDATE inventory_transactions SET quantity_delta = 99`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM inventory_transactions`).rejects.toThrow(/append-only/);
    expect(await prisma.inventoryTransaction.count()).toBe(1);
  });

  it("SKU dengan huruf kecil ditolak oleh CHECK walau lolos dari aplikasi", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO products (sku, name, updated_at) VALUES ('abc', 'x', now())`,
    ).rejects.toThrow(/products_sku_format_chk/);
  });
});
