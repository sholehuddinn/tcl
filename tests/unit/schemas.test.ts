import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AppError, Errors, toErrorBody } from "@/src/server/errors";
import {
  cancelSchema,
  documentCreateSchema,
  idempotencyKeySchema,
  itemsReplaceSchema,
  productCreateSchema,
  receiptCreateSchema,
} from "@/src/server/schemas";
import { formatDocumentNumber, parseDocumentNumber } from "@/src/server/services/format";

const uuid = "3f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b11";
const uuid2 = "4f0c1c52-8a37-4a8e-9a64-5c3f7d7a1b22";

describe("SKU (BR-01)", () => {
  it("dinormalisasi ke huruf besar dan di-trim", () => {
    const result = productCreateSchema.parse({ sku: "  brg-001 ", name: "Beras" });
    expect(result.sku).toBe("BRG-001");
    expect(result.unit).toBe("pcs");
  });

  it.each(["a", "-ABC", "AB CD", "ab/cd", "A".repeat(33), ""])("menolak SKU %j", (sku) => {
    expect(() => productCreateSchema.parse({ sku, name: "x" })).toThrow(ZodError);
  });

  it("menolak field tak dikenal", () => {
    expect(() => productCreateSchema.parse({ sku: "AB", name: "x", stock: 10 })).toThrow(ZodError);
  });
});

describe("jumlah (BR-02)", () => {
  const parse = (quantity: unknown) => receiptCreateSchema.parse({ itemId: uuid, quantity });

  it("menerima bilangan bulat 1..1.000.000", () => {
    expect(parse(1).quantity).toBe(1);
    expect(parse(1_000_000).quantity).toBe(1_000_000);
  });

  it.each([0, -1, 1.5, 1_000_001, "5", null, NaN])("menolak jumlah %j", (value) => {
    expect(() => parse(value)).toThrow(ZodError);
  });

  it("menolak itemId bukan UUID", () => {
    expect(() => receiptCreateSchema.parse({ itemId: "abc", quantity: 1 })).toThrow(ZodError);
  });
});

describe("dokumen (BR-03)", () => {
  const base = { supplierName: "PT A", items: [{ productId: uuid, expectedQty: 5 }] };

  it("valid dengan satu item", () => {
    expect(documentCreateSchema.parse(base).items).toHaveLength(1);
  });

  it("menolak tanpa item, produk duplikat, atau pemasok kosong", () => {
    expect(() => documentCreateSchema.parse({ ...base, items: [] })).toThrow(ZodError);
    expect(() =>
      documentCreateSchema.parse({
        ...base,
        items: [
          { productId: uuid, expectedQty: 1 },
          { productId: uuid, expectedQty: 2 },
        ],
      }),
    ).toThrow(ZodError);
    expect(() => documentCreateSchema.parse({ ...base, supplierName: "  " })).toThrow(ZodError);
  });

  it("menerima beberapa produk berbeda dan menolak tanggal salah format", () => {
    const items = [
      { productId: uuid, expectedQty: 1 },
      { productId: uuid2, expectedQty: 2 },
    ];
    expect(itemsReplaceSchema.parse({ items }).items).toHaveLength(2);
    expect(() => documentCreateSchema.parse({ ...base, expectedDate: "31-12-2026" })).toThrow(ZodError);
  });

  it("alasan pembatalan minimal 3 karakter", () => {
    expect(() => cancelSchema.parse({ reason: "ab" })).toThrow(ZodError);
    expect(cancelSchema.parse({ reason: " salah input " }).reason).toBe("salah input");
  });
});

describe("Idempotency-Key (BR-12)", () => {
  it("wajib dan maksimal 100 karakter", () => {
    expect(idempotencyKeySchema.safeParse(undefined).success).toBe(false);
    expect(idempotencyKeySchema.safeParse("   ").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(101)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse("abc-123").success).toBe(true);
  });
});

describe("nomor dokumen", () => {
  it("diformat dan di-parse bolak-balik", () => {
    expect(formatDocumentNumber(12)).toBe("RCV-000012");
    expect(parseDocumentNumber("RCV-000012")).toBe(12);
    expect(parseDocumentNumber("rcv-12")).toBe(12);
    expect(parseDocumentNumber("12")).toBe(12);
    expect(parseDocumentNumber("PT Maju")).toBeNull();
  });
});

describe("format error seragam", () => {
  it("AppError -> body dengan statusCode, error, message, details", () => {
    const body = toErrorBody(Errors.quantityExceeds(7, 6));
    expect(body).toMatchObject({ statusCode: 422, error: "QUANTITY_EXCEEDS_REMAINING" });
    expect(body.message).toContain("7");
    expect(body.details?.[0].field).toBe("quantity");
  });

  it("ZodError -> 400 VALIDATION_ERROR dengan detail per field", () => {
    const result = receiptCreateSchema.safeParse({ itemId: "x", quantity: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = toErrorBody(result.error);
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe("VALIDATION_ERROR");
      expect(body.details?.map((d) => d.field)).toEqual(expect.arrayContaining(["itemId", "quantity"]));
    }
  });

  it("error tak dikenal -> 500 tanpa membocorkan pesan internal", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {}); // log internal memang diharapkan
    const body = toErrorBody(new Error("password db = rahasia"));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    expect(body).toEqual({
      statusCode: 500,
      error: "INTERNAL_ERROR",
      message: "Terjadi kesalahan pada server.",
    });
  });

  it("AppError membawa kode status yang benar", () => {
    expect(Errors.forbidden()).toBeInstanceOf(AppError);
    expect(Errors.unauthenticated().statusCode).toBe(401);
    expect(Errors.notFound("Produk").statusCode).toBe(404);
    expect(Errors.keyReused().statusCode).toBe(409);
  });
});
