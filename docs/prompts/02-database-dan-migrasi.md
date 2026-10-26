# Prompt 02 — Skema database dan migrasi

**Masukan:** `docs/technical-spec.md` bagian 3, `docs/erd.mmd`, `CLAUDE.md`.

**Instruksi tugas**

> Implementasikan skema database persis seperti spesifikasi, memakai Prisma dan PostgreSQL 16.
>
> - Tulis `prisma/schema.prisma` dengan `@@map`/`@map` snake_case, UUID `gen_random_uuid()`, `timestamptz`, dan semua UNIQUE, FK (`ON DELETE` sesuai ERD), dan index yang tercantum.
> - Prisma tidak mendukung CHECK dan trigger secara deklaratif. Buat migrasi dengan `prisma migrate dev --create-only`, lalu **tambahkan SQL manual** ke migrasi yang sama: CHECK untuk format SKU, rentang jumlah, `received_qty <= expected_qty`, `quantity >= 0`, alasan pembatalan wajib, dan trigger yang menolak UPDATE/DELETE pada `inventory_transactions`.
> - Terapkan migrasi dengan `prisma migrate deploy` dan buktikan dengan `\d receiving_items` bahwa constraint terpasang.
> - Tulis `prisma/seed.ts` yang idempoten (upsert). Password pengguna seed harus dibaca dari environment variable, jangan di-hardcode, dan produk contoh hanya dibuat bila `SEED_DEMO_DATA=true`.
> - Buat `Dockerfile` multi-stage, `docker-compose.yml` (db dengan healthcheck → migrate sekali jalan → app dengan healthcheck), `.env.example` berisi nilai fiktif, dan `.dockerignore`. Jangan commit `.env`.

**Kriteria selesai:** `docker compose up --build` dari kondisi bersih menjalankan migrasi dan seed sampai `app` sehat; menjalankan migrasi dua kali tidak menimbulkan error.

**Review manusia:** pengembang memeriksa bahwa constraint sama dengan spesifikasi dan bahwa tidak ada secret di repo.
