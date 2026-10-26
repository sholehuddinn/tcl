# CLAUDE.md — Instruksi Proyek untuk AI Agent

Proyek: **Sistem Penerimaan Barang Gudang** (Warehouse Receiving System).
Stack: Next.js (App Router) fullstack, Prisma, PostgreSQL, Docker Compose.
Bahasa: dokumen dan teks UI **Bahasa Indonesia**; nama kode, tabel, field, dan endpoint **Bahasa Inggris**.

## Pendekatan: specification-driven
Spesifikasi di `docs/` adalah sumber kebenaran. Sebelum menulis atau mengubah kode, baca berurutan:
1. `docs/prd.md` — kebutuhan bisnis, aturan bisnis (BR-*), user story.
2. `docs/technical-spec.md` — arsitektur, database, alur penerimaan, otorisasi, strategi tes.
3. `docs/openapi.yaml` — kontrak API (path, skema, kode error).
4. `docs/erd.mmd`, `docs/state-machine.mmd`, `docs/api-flow.mmd`, `docs/data-flow.mmd`.

Jika kode dan spesifikasi berbeda, **perbarui spesifikasi dulu**, lalu kode. Jangan menebak perilaku bisnis; jika tidak tercantum, tambahkan sebagai asumsi atau pertanyaan terbuka di PRD.

## Aturan bisnis yang tidak boleh dilanggar
- Penerimaan tidak boleh melebihi sisa (`expected_qty - received_qty`) → 422.
- Dokumen hanya `COMPLETED` jika semua item `received_qty = expected_qty` → selain itu 409.
- Penerimaan hanya pada status `OPEN` / `PARTIALLY_RECEIVED`.
- Penerimaan, update item, update stok, dan riwayat transaksi dilakukan dalam **satu transaksi DB** dengan penguncian baris (`SELECT ... FOR UPDATE`).
- `POST .../receipts` wajib `Idempotency-Key`; key yang sama tidak boleh menambah stok dua kali.
- Stok tidak boleh negatif; riwayat transaksi bersifat append-only.
- Backend menegakkan semua aturan dan otorisasi peran; validasi UI hanya kemudahan.

## Struktur kode
- `app/` — halaman UI dan Route Handler `app/api/v1/**` (tipis: parse → panggil service → format respons).
- `src/server/` — logika bisnis (services), akses DB, auth, error, skema zod. Semua aturan bisnis hidup di sini agar bisa diuji tanpa HTTP.
- `prisma/` — `schema.prisma`, migrasi, `seed.ts`.
- `tests/` — Vitest (unit + integrasi ke PostgreSQL sungguhan).

## Konvensi
- TypeScript strict; validasi input dengan zod; error aplikasi lewat kelas error terpusat dengan format `{statusCode, error, message, details[]}`.
- Next.js 16 memakai `cacheComponents`: Route Handler API bersifat request-time; jangan men-cache data dinamis. Cek dokumentasi versi terpasang sebelum memakai API Next.
- Kode berkomentar secukupnya; komentar menjelaskan *mengapa*.
- Commit kecil dan bermakna, pesan dalam format `tipe: ringkasan` (feat, fix, docs, test, chore).

## Keamanan
- **Jangan pernah commit secret.** Hanya `.env.example` yang boleh masuk repo; `.env` ada di `.gitignore`.
- Password seed dan `JWT_SECRET` dibaca dari environment variable.
- Jangan `git push` dan jangan deploy publik tanpa izin eksplisit pemilik repo.

## Menjalankan (lingkungan pengembangan Windows)
`npm install` langsung di host Windows sering gagal (`ERR_SSL_CIPHER_OPERATION_FAILED`). Gunakan Docker: dependensi dan perintah npm/prisma/vitest dijalankan lewat `docker compose` (lihat `README.md`).

## Perintah umum (via Docker Compose)
- Start semua: `docker compose up --build`
- Tes: `docker compose run --rm app npm test`
- Migrasi: `docker compose run --rm app npx prisma migrate deploy`
