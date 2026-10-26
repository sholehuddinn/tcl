import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/src/server/auth";
import { prisma } from "@/src/server/db";
import { AppError } from "@/src/server/errors";
import { completeDocument, getDocument, recordReceipt } from "@/src/server/services/receiving";
import { assertInvariants, makeOpenDocument, makeProduct, makeUser, newKey, resetDb, stockOf } from "../helpers";

let operator: Actor;
let supervisor: Actor;

beforeEach(async () => {
  await resetDb();
  operator = await makeUser("OPERATOR");
  supervisor = await makeUser("SUPERVISOR");
});

describe("penerimaan paralel tidak merusak stok", () => {
  it("20 request paralel (key berbeda) untuk sisa 10: tepat 10 berhasil, 10 ditolak 422", async () => {
    const product = await makeProduct("CONC-1");
    const doc = await makeOpenDocument(operator, [{ productId: product.id, expectedQty: 10 }]);
    const itemId = doc.items[0].id;

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => recordReceipt(operator, doc.id, { itemId, quantity: 1 }, newKey())),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(AppError);
      expect((r.reason as AppError).code).toBe("QUANTITY_EXCEEDS_REMAINING");
    }

    const item = (await getDocument(doc.id)).items[0];
    expect(item.receivedQty).toBe(10);
    expect(item.remainingQty).toBe(0);
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.receipt.count()).toBe(10);
    expect(await prisma.inventoryTransaction.count()).toBe(10);
    await assertInvariants();
  });

  it("request paralel dengan jumlah besar tidak pernah melampaui sisa", async () => {
    const product = await makeProduct("CONC-2");
    const doc = await makeOpenDocument(operator, [{ productId: product.id, expectedQty: 10 }]);
    const itemId = doc.items[0].id;

    // 5 x 4 = 20 > 10 => paling banyak 2 yang berhasil.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => recordReceipt(operator, doc.id, { itemId, quantity: 4 }, newKey())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await stockOf(product.id)).toBe(8);
    await assertInvariants();
  });

  it("10 request paralel dengan key SAMA: hanya satu efek, sisanya replay", async () => {
    const product = await makeProduct("CONC-3");
    const doc = await makeOpenDocument(operator, [{ productId: product.id, expectedQty: 10 }]);
    const itemId = doc.items[0].id;
    const key = newKey();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => recordReceipt(operator, doc.id, { itemId, quantity: 3 }, key)),
    );

    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(9);
    expect(new Set(results.map((r) => r.data.receipt.id)).size).toBe(1);
    expect(await stockOf(product.id)).toBe(3);
    expect(await prisma.receipt.count()).toBe(1);
    await assertInvariants();
  });

  it("dua dokumen berbeda menerima produk yang sama bersamaan: stok = jumlah semua receipt", async () => {
    const product = await makeProduct("CONC-4");
    const docs = await Promise.all(
      [1, 2, 3].map(() => makeOpenDocument(operator, [{ productId: product.id, expectedQty: 10 }])),
    );

    await Promise.all(
      docs.flatMap((doc) =>
        Array.from({ length: 10 }, () =>
          recordReceipt(operator, doc.id, { itemId: doc.items[0].id, quantity: 1 }, newKey()),
        ),
      ),
    );

    expect(await stockOf(product.id)).toBe(30);
    await assertInvariants();
  });

  it("complete dan penerimaan berlomba: tidak ada dokumen COMPLETED dengan item belum penuh", async () => {
    const product = await makeProduct("CONC-5");
    const doc = await makeOpenDocument(operator, [{ productId: product.id, expectedQty: 2 }]);
    const itemId = doc.items[0].id;
    await recordReceipt(operator, doc.id, { itemId, quantity: 1 }, newKey());

    // Satu penerimaan terakhir berlomba dengan complete; hanya satu urutan yang valid.
    await Promise.allSettled([
      recordReceipt(operator, doc.id, { itemId, quantity: 1 }, newKey()),
      completeDocument(supervisor, doc.id),
    ]);

    const final = await getDocument(doc.id);
    if (final.status === "COMPLETED") expect(final.isFullyReceived).toBe(true);
    await assertInvariants();
  });
});
