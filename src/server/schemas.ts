import { z } from "zod";

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;
export const MAX_QTY = 1_000_000;

const uuid = z.uuid({ message: "harus berupa UUID" });
const quantity = z
  .number({ message: "harus berupa angka" })
  .int("harus bilangan bulat")
  .min(1, "minimal 1")
  .max(MAX_QTY, `maksimal ${MAX_QTY}`);

/** SKU dinormalisasi ke huruf besar sebelum divalidasi (BR-01). */
export const skuSchema = z
  .string({ message: "harus berupa teks" })
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(SKU_PATTERN, "format SKU tidak valid (A-Z, 0-9, titik, minus, underscore; 2-32 karakter)"));

export const idParam = z.object({ id: uuid });

export const loginSchema = z.strictObject({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const productCreateSchema = z.strictObject({
  sku: skuSchema,
  name: z.string().trim().min(1).max(150),
  unit: z.string().trim().min(1).max(20).default("pcs"),
});

export const productUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(150).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "minimal satu field harus diisi" });

const itemInput = z.strictObject({ productId: uuid, expectedQty: quantity });

const itemsArray = z
  .array(itemInput)
  .min(1, "minimal 1 item")
  .max(200, "maksimal 200 item")
  .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
    message: "produk tidak boleh duplikat dalam satu dokumen",
  });

export const itemsReplaceSchema = z.strictObject({ items: itemsArray });

export const documentCreateSchema = z.strictObject({
  supplierName: z.string().trim().min(1).max(150),
  referenceNo: z.string().trim().max(100).optional(),
  expectedDate: z.iso.date({ message: "format harus YYYY-MM-DD" }).optional(),
  notes: z.string().trim().max(500).optional(),
  items: itemsArray,
});

export const cancelSchema = z.strictObject({
  reason: z.string().trim().min(3, "minimal 3 karakter").max(500),
});

export const receiptCreateSchema = z.strictObject({
  itemId: uuid,
  quantity,
  notes: z.string().trim().max(500).optional(),
});

export const idempotencyKeySchema = z
  .string({ message: "header Idempotency-Key wajib diisi" })
  .trim()
  .min(1, "header Idempotency-Key wajib diisi")
  .max(100, "Idempotency-Key maksimal 100 karakter");

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

const search = z.string().trim().max(100).optional();

export const productListQuery = z.object({
  ...pagination,
  q: search,
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const documentListQuery = z.object({
  ...pagination,
  q: search,
  status: z.enum(["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "COMPLETED", "CANCELLED"]).optional(),
});

export const inventoryListQuery = z.object({ ...pagination, q: search });

export const transactionListQuery = z.object({
  ...pagination,
  productId: uuid.optional(),
  documentId: uuid.optional(),
});

export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ItemInput = z.infer<typeof itemInput>;
export type DocumentCreate = z.infer<typeof documentCreateSchema>;
export type ReceiptCreate = z.infer<typeof receiptCreateSchema>;
export type ProductListQuery = z.infer<typeof productListQuery>;
export type DocumentListQuery = z.infer<typeof documentListQuery>;
export type InventoryListQuery = z.infer<typeof inventoryListQuery>;
export type TransactionListQuery = z.infer<typeof transactionListQuery>;
