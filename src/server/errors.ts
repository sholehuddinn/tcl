import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SKU_ALREADY_EXISTS"
  | "INVALID_STATE_TRANSITION"
  | "DOCUMENT_NOT_RECEIVABLE"
  | "DOCUMENT_NOT_FULLY_RECEIVED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "QUANTITY_EXCEEDS_REMAINING"
  | "PRODUCT_INACTIVE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ErrorDetail = { field?: string; message: string };

export type ErrorBody = {
  statusCode: number;
  error: ErrorCode;
  message: string;
  details?: ErrorDetail[];
};

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }

  toBody(): ErrorBody {
    return {
      statusCode: this.statusCode,
      error: this.code,
      message: this.message,
      ...(this.details?.length ? { details: this.details } : {}),
    };
  }
}

export const Errors = {
  validation: (message = "Input tidak valid.", details?: ErrorDetail[]) =>
    new AppError(400, "VALIDATION_ERROR", message, details),
  unauthenticated: (message = "Anda belum login atau sesi telah berakhir.") =>
    new AppError(401, "UNAUTHENTICATED", message),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Username atau password salah."),
  forbidden: (message = "Anda tidak berhak melakukan aksi ini.") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (what: string) => new AppError(404, "NOT_FOUND", `${what} tidak ditemukan.`),
  skuExists: (sku: string) =>
    new AppError(409, "SKU_ALREADY_EXISTS", `SKU ${sku} sudah digunakan.`, [
      { field: "sku", message: "sudah digunakan" },
    ]),
  invalidTransition: (message: string) => new AppError(409, "INVALID_STATE_TRANSITION", message),
  notReceivable: (status: string) =>
    new AppError(
      409,
      "DOCUMENT_NOT_RECEIVABLE",
      `Dokumen berstatus ${status}; penerimaan hanya untuk OPEN atau PARTIALLY_RECEIVED.`,
    ),
  notFullyReceived: (details: ErrorDetail[]) =>
    new AppError(
      409,
      "DOCUMENT_NOT_FULLY_RECEIVED",
      "Dokumen belum dapat diselesaikan: masih ada item yang belum diterima penuh.",
      details,
    ),
  keyReused: () =>
    new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency-Key sudah dipakai untuk penerimaan lain dengan isi berbeda.",
    ),
  quantityExceeds: (quantity: number, remaining: number) =>
    new AppError(
      422,
      "QUANTITY_EXCEEDS_REMAINING",
      `Jumlah penerimaan (${quantity}) melebihi sisa (${remaining}).`,
      [{ field: "quantity", message: `maksimal ${remaining}` }],
    ),
  productInactive: (skus: string[]) =>
    new AppError(
      422,
      "PRODUCT_INACTIVE",
      `Produk nonaktif tidak dapat digunakan: ${skus.join(", ")}.`,
      skus.map((sku) => ({ field: "items", message: `${sku} nonaktif` })),
    ),
};

export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || undefined,
    message: issue.message,
  }));
}

/** Ubah error apa pun menjadi body respons seragam. Detail internal hanya masuk log. */
export function toErrorBody(error: unknown): ErrorBody {
  if (error instanceof AppError) return error.toBody();
  if (error instanceof ZodError) {
    return Errors.validation("Input tidak valid.", zodDetails(error)).toBody();
  }
  console.error("[internal-error]", error instanceof Error ? error.stack : error);
  return {
    statusCode: 500,
    error: "INTERNAL_ERROR",
    message: "Terjadi kesalahan pada server.",
  };
}
