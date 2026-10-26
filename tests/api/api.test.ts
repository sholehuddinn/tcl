import { beforeEach, describe, expect, it } from "vitest";
import { signSession, type Actor } from "@/src/server/auth";
import { prisma } from "@/src/server/db";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as health } from "@/app/api/v1/health/route";
import { GET as listProducts, POST as createProduct } from "@/app/api/v1/products/route";
import { GET as getProduct, PATCH as patchProduct } from "@/app/api/v1/products/[id]/route";
import { GET as listDocs, POST as createDoc } from "@/app/api/v1/receiving-documents/route";
import { GET as getDoc } from "@/app/api/v1/receiving-documents/[id]/route";
import { PUT as putItems } from "@/app/api/v1/receiving-documents/[id]/items/route";
import { POST as submitDoc } from "@/app/api/v1/receiving-documents/[id]/submit/route";
import { POST as receive } from "@/app/api/v1/receiving-documents/[id]/receipts/route";
import { POST as completeDoc } from "@/app/api/v1/receiving-documents/[id]/complete/route";
import { POST as cancelDoc } from "@/app/api/v1/receiving-documents/[id]/cancel/route";
import { GET as inventory } from "@/app/api/v1/inventory/route";
import { GET as transactions } from "@/app/api/v1/inventory/transactions/route";
import { makeProduct, makeUser, newKey, resetDb, TEST_PASSWORD } from "../helpers";

type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response>;

async function call(
  handler: unknown,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  const response = await (handler as Handler)(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body }),
    { params: Promise.resolve(opts.params ?? {}) as Promise<never> },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

function expectErrorShape(body: Record<string, unknown>, status: number, code: string) {
  expect(body.statusCode).toBe(status);
  expect(body.error).toBe(code);
  expect(typeof body.message).toBe("string");
}

let operatorToken: string;
let supervisorToken: string;
let operator: Actor;
let supervisor: Actor;

beforeEach(async () => {
  await resetDb();
  operator = await makeUser("OPERATOR");
  supervisor = await makeUser("SUPERVISOR");
  operatorToken = await signSession(operator.id);
  supervisorToken = await signSession(supervisor.id);
});

describe("autentikasi", () => {
  it("login benar -> 200, token, dan cookie httpOnly", async () => {
    const res = await call(login, "POST", "/auth/login", {
      body: { username: "operator", password: TEST_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ username: "operator", role: "OPERATOR" });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const meRes = await call(me, "GET", "/auth/me", { token: res.body.data.token });
    expect(meRes.body.data.user.username).toBe("operator");
  });

  it("cookie sesi juga diterima", async () => {
    const res = await call(me, "GET", "/auth/me", { headers: { cookie: `session=${operatorToken}` } });
    expect(res.status).toBe(200);
  });

  it("password salah dan username tidak ada memberi pesan yang sama (401)", async () => {
    const wrong = await call(login, "POST", "/auth/login", { body: { username: "operator", password: "salah" } });
    const unknown = await call(login, "POST", "/auth/login", { body: { username: "hantu", password: "salah" } });
    expectErrorShape(wrong.body, 401, "INVALID_CREDENTIALS");
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it("body login tidak valid -> 400", async () => {
    expectErrorShape((await call(login, "POST", "/auth/login", { body: { username: "operator" } })).body, 400, "VALIDATION_ERROR");
    expectErrorShape((await call(login, "POST", "/auth/login", { body: "{bukan json" })).body, 400, "VALIDATION_ERROR");
  });

  it("pengguna nonaktif tidak dapat login dan tokennya ditolak", async () => {
    await prisma.user.update({ where: { id: operator.id }, data: { isActive: false } });
    const res = await call(login, "POST", "/auth/login", { body: { username: "operator", password: TEST_PASSWORD } });
    expect(res.status).toBe(401);
    expectErrorShape((await call(me, "GET", "/auth/me", { token: operatorToken })).body, 401, "UNAUTHENTICATED");
  });

  it("tanpa token atau token rusak -> 401 di semua endpoint terproteksi", async () => {
    for (const [handler, method, path] of [
      [listProducts, "GET", "/products"],
      [listDocs, "GET", "/receiving-documents"],
      [inventory, "GET", "/inventory"],
      [transactions, "GET", "/inventory/transactions"],
      [me, "GET", "/auth/me"],
    ] as const) {
      expectErrorShape((await call(handler, method, path)).body, 401, "UNAUTHENTICATED");
      expectErrorShape((await call(handler, method, path, { token: "token.rusak.sekali" })).body, 401, "UNAUTHENTICATED");
    }
  });

  it("logout menghapus cookie", async () => {
    const res = await call(logout, "POST", "/auth/logout", { token: operatorToken });
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("produk", () => {
  it("Operator tidak boleh membuat/mengubah produk (403)", async () => {
    expectErrorShape(
      (await call(createProduct, "POST", "/products", { token: operatorToken, body: { sku: "X-1", name: "X" } })).body,
      403,
      "FORBIDDEN",
    );
    const product = await makeProduct("PRD-1");
    expectErrorShape(
      (await call(patchProduct, "PATCH", `/products/${product.id}`, { token: operatorToken, body: { name: "Baru" }, params: { id: product.id } })).body,
      403,
      "FORBIDDEN",
    );
  });

  it("Supervisor membuat produk: SKU dinormalisasi dan stok awal 0; duplikat 409", async () => {
    const res = await call(createProduct, "POST", "/products", {
      token: supervisorToken,
      body: { sku: "brg-100", name: "Beras" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ sku: "BRG-100", unit: "pcs", quantity: 0, isActive: true });

    const dup = await call(createProduct, "POST", "/products", { token: supervisorToken, body: { sku: "BRG-100", name: "Lain" } });
    expectErrorShape(dup.body, 409, "SKU_ALREADY_EXISTS");
    const dupLower = await call(createProduct, "POST", "/products", { token: supervisorToken, body: { sku: "brg-100", name: "Lain" } });
    expect(dupLower.status).toBe(409);
  });

  it("validasi: SKU tidak valid, field asing, dan PATCH kosong -> 400", async () => {
    expectErrorShape((await call(createProduct, "POST", "/products", { token: supervisorToken, body: { sku: "a b", name: "X" } })).body, 400, "VALIDATION_ERROR");
    expectErrorShape((await call(createProduct, "POST", "/products", { token: supervisorToken, body: { sku: "OK-1", name: "X", quantity: 99 } })).body, 400, "VALIDATION_ERROR");
    const product = await makeProduct("PRD-2");
    expectErrorShape(
      (await call(patchProduct, "PATCH", `/products/${product.id}`, { token: supervisorToken, body: {}, params: { id: product.id } })).body,
      400,
      "VALIDATION_ERROR",
    );
  });

  it("SKU tidak dapat diubah lewat PATCH", async () => {
    const product = await makeProduct("PRD-3");
    const res = await call(patchProduct, "PATCH", `/products/${product.id}`, {
      token: supervisorToken,
      body: { sku: "BARU-1" },
      params: { id: product.id },
    });
    expectErrorShape(res.body, 400, "VALIDATION_ERROR");
  });

  it("daftar mendukung pencarian dan paginasi; detail & 404 & UUID salah", async () => {
    await makeProduct("AAA-1");
    await makeProduct("BBB-1");
    await makeProduct("BBB-2");
    const all = await call(listProducts, "GET", "/products?pageSize=2&page=1", { token: operatorToken });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });

    const search = await call(listProducts, "GET", "/products?q=bbb", { token: operatorToken });
    expect(search.body.data.map((p: { sku: string }) => p.sku)).toEqual(["BBB-1", "BBB-2"]);

    expectErrorShape((await call(listProducts, "GET", "/products?pageSize=1000", { token: operatorToken })).body, 400, "VALIDATION_ERROR");

    const missing = "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11";
    expectErrorShape((await call(getProduct, "GET", `/products/${missing}`, { token: operatorToken, params: { id: missing } })).body, 404, "NOT_FOUND");
    expectErrorShape((await call(getProduct, "GET", "/products/abc", { token: operatorToken, params: { id: "abc" } })).body, 400, "VALIDATION_ERROR");
  });
});

describe("alur penerimaan lewat API", () => {
  it("dari pembuatan dokumen sampai selesai, stok dan riwayat benar", async () => {
    const a = await makeProduct("FLOW-A");
    const b = await makeProduct("FLOW-B");

    const created = await call(createDoc, "POST", "/receiving-documents", {
      token: operatorToken,
      body: {
        supplierName: "PT Sumber Makmur",
        referenceNo: "SJ-001",
        items: [
          { productId: a.id, expectedQty: 10 },
          { productId: b.id, expectedQty: 4 },
        ],
      },
    });
    expect(created.status).toBe(201);
    const doc = created.body.data;
    expect(doc.status).toBe("DRAFT");
    expect(doc.number).toMatch(/^RCV-\d{6}$/);
    const id = doc.id as string;
    const itemA = doc.items.find((i: { product: { sku: string } }) => i.product.sku === "FLOW-A").id as string;
    const itemB = doc.items.find((i: { product: { sku: string } }) => i.product.sku === "FLOW-B").id as string;

    // DRAFT belum bisa menerima.
    const early = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, headers: { "Idempotency-Key": newKey() }, body: { itemId: itemA, quantity: 1 }, params: { id },
    });
    expectErrorShape(early.body, 409, "DOCUMENT_NOT_RECEIVABLE");

    const submitted = await call(submitDoc, "POST", `/receiving-documents/${id}/submit`, { token: operatorToken, params: { id } });
    expect(submitted.body.data.status).toBe("OPEN");

    // Idempotency-Key wajib.
    const noKey = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, body: { itemId: itemA, quantity: 1 }, params: { id },
    });
    expectErrorShape(noKey.body, 400, "VALIDATION_ERROR");

    // Penerimaan sebagian: 201.
    const key = newKey();
    const first = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, headers: { "Idempotency-Key": key }, body: { itemId: itemA, quantity: 6 }, params: { id },
    });
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);
    expect(first.body.data).toMatchObject({ stockQuantity: 6, documentStatus: "PARTIALLY_RECEIVED" });
    expect(first.body.data.item).toMatchObject({ receivedQty: 6, remainingQty: 4 });

    // Kirim ulang: 200 + replayed, stok tidak berubah.
    const replay = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, headers: { "Idempotency-Key": key }, body: { itemId: itemA, quantity: 6 }, params: { id },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.data.receipt.id).toBe(first.body.data.receipt.id);

    // Melebihi sisa: 422.
    const over = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, headers: { "Idempotency-Key": newKey() }, body: { itemId: itemA, quantity: 5 }, params: { id },
    });
    expectErrorShape(over.body, 422, "QUANTITY_EXCEEDS_REMAINING");

    // Jumlah tidak valid: 400.
    for (const quantity of [0, -3, 2.5, "3"]) {
      const bad = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
        token: operatorToken, headers: { "Idempotency-Key": newKey() }, body: { itemId: itemA, quantity }, params: { id },
      });
      expectErrorShape(bad.body, 400, "VALIDATION_ERROR");
    }

    // Belum penuh: complete ditolak; Operator ditolak 403.
    const early2 = await call(completeDoc, "POST", `/receiving-documents/${id}/complete`, { token: supervisorToken, params: { id } });
    expectErrorShape(early2.body, 409, "DOCUMENT_NOT_FULLY_RECEIVED");
    const byOperator = await call(completeDoc, "POST", `/receiving-documents/${id}/complete`, { token: operatorToken, params: { id } });
    expectErrorShape(byOperator.body, 403, "FORBIDDEN");

    // Lengkapi semuanya.
    for (const [itemId, quantity] of [[itemA, 4], [itemB, 4]] as const) {
      const res = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
        token: operatorToken, headers: { "Idempotency-Key": newKey() }, body: { itemId, quantity }, params: { id },
      });
      expect(res.status).toBe(201);
    }

    const done = await call(completeDoc, "POST", `/receiving-documents/${id}/complete`, { token: supervisorToken, params: { id } });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: "COMPLETED", isFullyReceived: true, receivedTotal: 14, expectedTotal: 14 });

    const detail = await call(getDoc, "GET", `/receiving-documents/${id}`, { token: operatorToken, params: { id } });
    expect(detail.body.data.receipts).toHaveLength(3);

    // Stok dan riwayat.
    const stock = await call(inventory, "GET", "/inventory?q=flow", { token: operatorToken });
    const bySku = Object.fromEntries(stock.body.data.map((r: { sku: string; quantity: number }) => [r.sku, r.quantity]));
    expect(bySku).toEqual({ "FLOW-A": 10, "FLOW-B": 4 });

    const history = await call(transactions, "GET", `/inventory/transactions?documentId=${id}`, { token: operatorToken });
    expect(history.body.meta.total).toBe(3);
    expect(history.body.data[0]).toMatchObject({ type: "RECEIPT", documentNumber: doc.number });
    const forA = await call(transactions, "GET", `/inventory/transactions?productId=${a.id}`, { token: operatorToken });
    expect(forA.body.data.map((t: { balanceAfter: number }) => t.balanceAfter)).toEqual([10, 6]); // terbaru dahulu

    // Setelah COMPLETED tidak bisa menerima lagi.
    const late = await call(receive, "POST", `/receiving-documents/${id}/receipts`, {
      token: operatorToken, headers: { "Idempotency-Key": newKey() }, body: { itemId: itemA, quantity: 1 }, params: { id },
    });
    expectErrorShape(late.body, 409, "DOCUMENT_NOT_RECEIVABLE");
  });

  it("validasi pembuatan dokumen", async () => {
    const product = await makeProduct("VAL-1");
    const inactive = await makeProduct("VAL-OFF", { isActive: false });
    const post = (body: unknown) => call(createDoc, "POST", "/receiving-documents", { token: operatorToken, body });

    expectErrorShape((await post({ supplierName: "PT", items: [] })).body, 400, "VALIDATION_ERROR");
    expectErrorShape((await post({ items: [{ productId: product.id, expectedQty: 1 }] })).body, 400, "VALIDATION_ERROR");
    expectErrorShape((await post({ supplierName: "PT", items: [{ productId: product.id, expectedQty: 0 }] })).body, 400, "VALIDATION_ERROR");
    expectErrorShape(
      (await post({ supplierName: "PT", items: [{ productId: product.id, expectedQty: 1 }, { productId: product.id, expectedQty: 2 }] })).body,
      400,
      "VALIDATION_ERROR",
    );
    expectErrorShape((await post({ supplierName: "PT", items: [{ productId: inactive.id, expectedQty: 1 }] })).body, 422, "PRODUCT_INACTIVE");
    expectErrorShape(
      (await post({ supplierName: "PT", items: [{ productId: "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11", expectedQty: 1 }] })).body,
      404,
      "NOT_FOUND",
    );
    const bad = await post({ supplierName: "PT", items: [{ productId: product.id, expectedQty: 0 }] });
    expect(bad.body.details[0].field).toBe("items.0.expectedQty");
  });

  it("ganti item hanya saat DRAFT, dan cancel oleh Supervisor", async () => {
    const a = await makeProduct("CAN-A");
    const b = await makeProduct("CAN-B");
    const created = await call(createDoc, "POST", "/receiving-documents", {
      token: operatorToken,
      body: { supplierName: "PT", items: [{ productId: a.id, expectedQty: 3 }] },
    });
    const id = created.body.data.id as string;

    const replaced = await call(putItems, "PUT", `/receiving-documents/${id}/items`, {
      token: operatorToken, body: { items: [{ productId: b.id, expectedQty: 8 }] }, params: { id },
    });
    expect(replaced.body.data.items).toHaveLength(1);
    expect(replaced.body.data.items[0].product.sku).toBe("CAN-B");

    expectErrorShape(
      (await call(cancelDoc, "POST", `/receiving-documents/${id}/cancel`, { token: operatorToken, body: { reason: "salah" }, params: { id } })).body,
      403,
      "FORBIDDEN",
    );
    expectErrorShape(
      (await call(cancelDoc, "POST", `/receiving-documents/${id}/cancel`, { token: supervisorToken, body: { reason: "x" }, params: { id } })).body,
      400,
      "VALIDATION_ERROR",
    );
    const cancelled = await call(cancelDoc, "POST", `/receiving-documents/${id}/cancel`, {
      token: supervisorToken, body: { reason: "pemasok membatalkan" }, params: { id },
    });
    expect(cancelled.body.data).toMatchObject({ status: "CANCELLED", cancelReason: "pemasok membatalkan" });

    expectErrorShape(
      (await call(putItems, "PUT", `/receiving-documents/${id}/items`, { token: operatorToken, body: { items: [{ productId: a.id, expectedQty: 1 }] }, params: { id } })).body,
      409,
      "INVALID_STATE_TRANSITION",
    );
  });

  it("daftar dokumen: filter status, pencarian nomor/pemasok, paginasi", async () => {
    const p = await makeProduct("LST-1");
    for (const supplier of ["PT Alfa", "PT Beta", "CV Gamma"]) {
      await call(createDoc, "POST", "/receiving-documents", {
        token: operatorToken,
        body: { supplierName: supplier, items: [{ productId: p.id, expectedQty: 1 }] },
      });
    }
    const all = await call(listDocs, "GET", "/receiving-documents?pageSize=2", { token: operatorToken });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0].supplierName).toBe("CV Gamma"); // terbaru dahulu

    const search = await call(listDocs, "GET", "/receiving-documents?q=beta", { token: operatorToken });
    expect(search.body.data.map((d: { supplierName: string }) => d.supplierName)).toEqual(["PT Beta"]);

    const number = all.body.data[0].number as string;
    const byNumber = await call(listDocs, "GET", `/receiving-documents?q=${number}`, { token: operatorToken });
    expect(byNumber.body.data).toHaveLength(1);

    expect((await call(listDocs, "GET", "/receiving-documents?status=OPEN", { token: operatorToken })).body.meta.total).toBe(0);
    expect((await call(listDocs, "GET", "/receiving-documents?status=DRAFT", { token: operatorToken })).body.meta.total).toBe(3);
    expectErrorShape((await call(listDocs, "GET", "/receiving-documents?status=NGAWUR", { token: operatorToken })).body, 400, "VALIDATION_ERROR");
  });

  it("dokumen tidak ada -> 404 dan UUID salah -> 400", async () => {
    const missing = "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11";
    expectErrorShape((await call(getDoc, "GET", `/receiving-documents/${missing}`, { token: operatorToken, params: { id: missing } })).body, 404, "NOT_FOUND");
    expectErrorShape((await call(submitDoc, "POST", `/receiving-documents/${missing}/submit`, { token: operatorToken, params: { id: missing } })).body, 404, "NOT_FOUND");
    expectErrorShape((await call(getDoc, "GET", "/receiving-documents/123", { token: operatorToken, params: { id: "123" } })).body, 400, "VALIDATION_ERROR");
  });
});

describe("health", () => {
  it("200 ok tanpa autentikasi saat database terhubung", async () => {
    const res = await call(health, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
