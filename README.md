# Sistem Penerimaan Barang Gudang

Aplikasi web untuk mencatat pengiriman masuk (inbound), jumlah barang yang diterima, stok tersedia, dan riwayat transaksi stok. Dibuat untuk *Technical Assessment: AI-Driven Fullstack Developer Intern* dengan pendekatan **specification-driven**: PRD dan spesifikasi teknis ditulis lebih dulu, lalu menjadi masukan bagi AI agent (Claude Code) yang mengimplementasikannya.

- **Aturan utama**: penerimaan tidak boleh melebihi sisa; dokumen tidak bisa diselesaikan sebelum semua item diterima penuh; request ganda tidak menggandakan stok. Semua ditegakkan di backend dan dijaga ulang oleh constraint database.
- **Peran**: Operator (membuat dokumen, mencatat penerimaan) dan Supervisor (plus kelola produk, selesaikan, batalkan dokumen).

## Stack

| Lapisan | Teknologi |
|---------|-----------|
| Aplikasi | Next.js 16 (App Router) fullstack: UI React 19 + Route Handler `/api/v1` |
| Bahasa | TypeScript (strict) |
| Database | PostgreSQL 16, Prisma 6 (migrasi terversi) |
| Auth | JWT (jose) di cookie httpOnly / header Bearer, password bcrypt |
| Validasi | zod |
| UI | Tailwind CSS 4 |
| Tes | Vitest + PostgreSQL sungguhan |
| Deploy lokal | Docker + Docker Compose |

## Menjalankan dari lingkungan bersih

Prasyarat: Docker Desktop (Compose v2). Tidak perlu Node/PostgreSQL di komputer.

```bash
git clone <url-repo> && cd tcl
cp .env.example .env
```

Edit `.env`: ganti semua nilai `change-me...` (terutama `JWT_SECRET`, minimal 32 karakter acak, mis. `openssl rand -base64 48`). Lalu:

```bash
docker compose up --build
```

Urutan otomatis: `db` (PostgreSQL, healthcheck) → `migrate` (menjalankan `prisma migrate deploy` lalu seed, sekali jalan) → `app`. Setelah siap:

- Aplikasi: http://localhost:3000
- Health check: http://localhost:3000/api/v1/health → `{"status":"ok"}`
- Login memakai akun seed `operator` dan `supervisor`; passwordnya adalah nilai `SEED_OPERATOR_PASSWORD` / `SEED_SUPERVISOR_PASSWORD` di `.env`.
- Lima produk contoh dibuat bila `SEED_DEMO_DATA=true`.

Berhenti: `docker compose down` (data tetap di volume `pgdata`; tambahkan `-v` untuk menghapusnya).

## Konfigurasi (environment variable)

| Variabel | Fungsi |
|----------|--------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Kredensial dan nama database; `DATABASE_URL` disusun otomatis oleh Compose |
| `DB_PORT` | Port PostgreSQL di host (default 5433, agar tidak bentrok dengan PostgreSQL lokal) |
| `JWT_SECRET` | Kunci tanda tangan sesi, minimal 32 karakter |
| `COOKIE_SECURE` | `true` bila disajikan lewat HTTPS |
| `SEED_OPERATOR_PASSWORD`, `SEED_SUPERVISOR_PASSWORD` | Password akun seed |
| `SEED_DEMO_DATA` | `true` untuk membuat produk contoh |
| `APP_PORT` | Port aplikasi di host (default 3000) |

`.env` tidak pernah di-commit; hanya `.env.example` berisi nilai contoh fiktif.

## Pengujian

```bash
docker compose --profile test run --rm test
```

Menjalankan migrasi ke schema `test` (terpisah dari data aplikasi) lalu 82 tes: unit, integrasi service + PostgreSQL, konkurensi, dan API (Route Handler). Bukti dan penjelasan: [docs/testing.md](docs/testing.md).

Smoke test end-to-end terhadap aplikasi yang sedang berjalan (Node 22+ di host):

```bash
SEED_OPERATOR_PASSWORD=... SEED_SUPERVISOR_PASSWORD=... node scripts/smoke.mjs
```

## Pengembangan (hot reload)

```bash
docker compose --profile dev up dev        # http://localhost:3000, migrasi otomatis
docker compose --profile dev run --rm dev npx tsc --noEmit
docker compose --profile dev run --rm dev npx eslint .
```

Dependensi hidup di volume Docker (`node_modules`). Di Windows, `npm install` langsung di host sempat gagal dengan `ERR_SSL_CIPHER_OPERATION_FAILED` (masalah TLS Node di jaringan tertentu), sehingga seluruh perintah npm dijalankan di dalam container.

## Dokumentasi

| File | Isi |
|------|-----|
| [docs/prd.md](docs/prd.md) | PRD: masalah, peran, kebutuhan, aturan bisnis (BR-*), user story, asumsi, pertanyaan terbuka |
| [docs/technical-spec.md](docs/technical-spec.md) | Arsitektur, database, kontrak API, alur penerimaan, status, otorisasi, strategi tes |
| [docs/erd.mmd](docs/erd.mmd) | ERD (Mermaid) |
| [docs/openapi.yaml](docs/openapi.yaml) | Kontrak API OpenAPI 3 |
| [docs/data-flow.mmd](docs/data-flow.mmd), [docs/api-flow.mmd](docs/api-flow.mmd), [docs/state-machine.mmd](docs/state-machine.mmd) | Diagram alur data, urutan API penerimaan, transisi status |
| [docs/ai-workflow.md](docs/ai-workflow.md) | Cara AI agent dipakai, prompt, dan hasil verifikasi |
| [docs/prompts/](docs/prompts) | Instruksi tugas untuk agent per tahap |
| [docs/testing.md](docs/testing.md) | Strategi, hasil, bukti integritas stok, keterbatasan |
| [CLAUDE.md](CLAUDE.md) | File instruksi proyek untuk AI agent |

## Struktur kode

```
app/api/v1/**      Route Handler (tipis: auth -> validasi -> service -> respons)
app/(app)/**       Halaman terautentikasi (penerimaan, produk, stok, riwayat)
src/server/        Logika bisnis: services, auth, error, skema zod, akses DB
src/client/        Util klien: fetch API, komponen UI, sesi
prisma/            schema.prisma, migrasi (termasuk CHECK & trigger), seed
tests/             unit, integrasi, konkurensi, API
scripts/smoke.mjs  Smoke test end-to-end via HTTP
```

## Ringkasan API

Basis `/api/v1`; kontrak lengkap di `docs/openapi.yaml`.

| Endpoint | Peran |
|----------|-------|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | publik / login |
| `GET/POST /products`, `GET/PATCH /products/{id}` | baca: semua; tulis: Supervisor |
| `GET/POST /receiving-documents`, `GET /receiving-documents/{id}` | semua peran |
| `PUT .../items`, `POST .../submit`, `POST .../receipts` (header `Idempotency-Key`) | semua peran |
| `POST .../complete`, `POST .../cancel` | Supervisor |
| `GET /inventory`, `GET /inventory/transactions` | semua peran |
| `GET /health` | publik |

Error memakai format seragam `{statusCode, error, message, details[]}`.

## Keterbatasan yang diketahui

Daftar lengkap ada di [docs/testing.md](docs/testing.md#keterbatasan-dan-masalah-yang-belum-selesai). Ringkasnya: tanpa pembatasan percobaan login, tanpa manajemen pengguna lewat UI, tanpa koreksi stok/retur, dan tanpa tes browser otomatis.
