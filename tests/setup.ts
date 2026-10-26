import { vi } from "vitest";

// Tes memakai schema `test` agar tidak pernah menyentuh data aplikasi.
const url = process.env.DATABASE_URL ?? "";
if (!/[?&]schema=test(&|$)/.test(url)) {
  throw new Error(
    "Tes menghapus semua tabel. Set DATABASE_URL dengan '?schema=test' (gunakan: docker compose --profile test run --rm test).",
  );
}

process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-123456";

// connection() hanya bermakna di runtime Next.js; di tes ia tidak boleh melempar.
vi.mock("next/server", () => ({ connection: async () => {} }));
