# Spesifikasi Teknis — Sistem Penerimaan Barang Gudang

Turunan dari `prd.md`. Diagram: `erd.mmd`, `state-machine.mmd`, `api-flow.mmd`, `data-flow.mmd`. Kontrak API lengkap: `openapi.yaml`.

## 1. Arsitektur Sistem

```
Browser (React, halaman Next.js)
   │  fetch /api/v1/*  (cookie sesi httpOnly)
   ▼
Next.js app  ──────────────────────────────────────────────
  app/(halaman)        UI: login, produk, dokumen, stok, riwayat
  app/api/v1/**        Route Handler: parse request → auth → service → respons
  src/server/services  Logika bisnis + transaksi DB (tanpa dependensi HTTP)
  src/server/auth      JWT (jose), bcrypt, guard peran
  src/server/errors    AppError + pemetaan ke respons JSON seragam
  Prisma Client        Akses data
   │
   ▼
PostgreSQL 16  (constraint, index, migrasi Prisma)
```

| Komponen | Tanggung jawab |
|----------|----------------|
| UI (App Router) | Presentasi, validasi kemudahan, memanggil API. Tidak berisi aturan otoritatif. |
| Route Handler | Lapisan tipis: ambil sesi, validasi input dengan zod, panggil service, ubah `AppError` menjadi respons. |
| Services | Satu-satunya tempat aturan bisnis (BR-*). Menerima `actor` (id, role) eksplisit sehingga dapat diuji tanpa HTTP. |
| Database | Penjaga terakhir integritas (CHECK, UNIQUE, FK) bila ada bug di lapisan atas. |
| Docker Compose | `db` (PostgreSQL), `migrate` (migrasi + seed sekali jalan), `app` (Next.js standalone). |

Keputusan: satu aplikasi Next.js (bukan layanan terpisah) agar lebih sederhana untuk direproduksi dan dijelaskan; pemisahan tetap terjaga lewat lapisan `src/server`.

Catatan Next.js 16 (`cacheComponents`): setiap Route Handler harus bersifat request-time. Semua handler membaca `cookies()`/header request (atau memanggil `connection()` dari `next/server`, mis. pada `/health`) sehingga tidak pernah diprerender saat build dan tidak men-cache data DB.

## 2. ERD

Lihat `erd.mmd`. Ringkasan relasi:
- `users` 1—N `receiving_documents` (dibuat oleh), `receipts` (diterima oleh), `inventory_transactions`.
- `products` 1—N `receiving_items`; `products` 1—1 `inventory`; `products` 1—N `inventory_transactions`.
- `receiving_documents` 1—N `receiving_items`; 1—N `receipts`.
- `receiving_items` 1—N `receipts`; `receipts` 1—1 `inventory_transactions`.

## 3. Desain Database

Konvensi: nama tabel/kolom `snake_case` (dipetakan dengan `@@map`/`@map` di Prisma); primary key `uuid` (`gen_random_uuid()`) kecuali dinyatakan lain; waktu `timestamptz`.

Enum: `role` = `OPERATOR | SUPERVISOR`; `document_status` = `DRAFT | OPEN | PARTIALLY_RECEIVED | COMPLETED | CANCELLED`; `inventory_transaction_type` = `RECEIPT`.

### users
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| username | varchar(50) | UNIQUE, huruf kecil |
| password_hash | text | bcrypt |
| full_name | varchar(100) | |
| role | role | |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |

### products
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| sku | varchar(32) | UNIQUE; CHECK `sku ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'` |
| name | varchar(150) | |
| unit | varchar(20) | default `pcs` |
| is_active | boolean | default true |
| created_at, updated_at | timestamptz | |

Index: UNIQUE(sku); index `name` untuk pencarian.

### receiving_documents
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| number | integer | UNIQUE, default `autoincrement()` (sequence); ditampilkan `RCV-` + 6 digit |
| supplier_name | varchar(150) | |
| reference_no | varchar(100) | nullable |
| expected_date | date | nullable |
| notes | varchar(500) | nullable |
| status | document_status | default `DRAFT` |
| created_by | uuid FK→users | |
| created_at, updated_at | timestamptz | |
| submitted_at, completed_at, cancelled_at | timestamptz | nullable |
| completed_by, cancelled_by | uuid FK→users | nullable |
| cancel_reason | varchar(500) | nullable; wajib bila CANCELLED (CHECK) |

Index: `(status, created_at DESC)`, `supplier_name`, UNIQUE(number).

### receiving_items
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| document_id | uuid FK→receiving_documents ON DELETE CASCADE | |
| product_id | uuid FK→products | ON DELETE RESTRICT |
| expected_qty | integer | CHECK `expected_qty BETWEEN 1 AND 1000000` |
| received_qty | integer | default 0; CHECK `received_qty >= 0 AND received_qty <= expected_qty` |

UNIQUE(document_id, product_id). Index pada `product_id`.

### receipts
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| document_id | uuid FK→receiving_documents | |
| item_id | uuid FK→receiving_items | |
| quantity | integer | CHECK `quantity BETWEEN 1 AND 1000000` |
| idempotency_key | varchar(100) | |
| notes | varchar(500) | nullable |
| received_by | uuid FK→users | |
| received_at | timestamptz | default now() |

UNIQUE(document_id, idempotency_key). Index `(item_id, received_at)`.

### inventory
| Kolom | Tipe | Catatan |
|-------|------|---------|
| product_id | uuid PK FK→products | satu baris per produk, dibuat bersama produk (quantity 0) |
| quantity | integer | CHECK `quantity >= 0` |
| updated_at | timestamptz | |

### inventory_transactions (append-only)
| Kolom | Tipe | Catatan |
|-------|------|---------|
| id | uuid PK | |
| product_id | uuid FK→products | |
| type | inventory_transaction_type | `RECEIPT` |
| quantity_delta | integer | CHECK `<> 0` |
| balance_after | integer | CHECK `>= 0` |
| document_id | uuid FK→receiving_documents | |
| receipt_id | uuid FK→receipts | UNIQUE (satu transaksi per penerimaan) |
| created_by | uuid FK→users | |
| created_at | timestamptz | default now() |

Index: `(product_id, created_at DESC)`, `(document_id)`, `(created_at DESC)`. Tidak ada endpoint update/delete. Opsional pada migrasi: trigger yang menolak `UPDATE`/`DELETE` pada tabel ini.

### Strategi migrasi
- Prisma Migrate; folder `prisma/migrations` di-commit. Skema awal + SQL tambahan (CHECK constraint, trigger append-only, regex SKU) ditulis di migrasi yang sama karena Prisma belum mendukung CHECK secara deklaratif.
- Pengembangan: `prisma migrate dev`. Produksi/Compose: `prisma migrate deploy` (idempoten) dijalankan oleh service `migrate` sebelum `app` start (`depends_on: condition: service_completed_successfully`).
- Seed (`prisma/seed.ts`, idempoten via upsert): 2 pengguna dan beberapa produk contoh; password dari `SEED_OPERATOR_PASSWORD` dan `SEED_SUPERVISOR_PASSWORD`. Produk contoh hanya bila `SEED_DEMO_DATA=true`.

## 4. Kontrak API

Basis: `/api/v1`. Format: JSON UTF-8. Detail skema di `openapi.yaml`.

### Autentikasi
`POST /auth/login` mengembalikan cookie `session` (JWT HS256, httpOnly, SameSite=Lax, `Secure` bila `COOKIE_SECURE=true`, kedaluwarsa 8 jam). Klien non-browser boleh memakai `Authorization: Bearer <token>` (token juga dikembalikan di body login). Mitigasi CSRF: SameSite=Lax dan semua mutasi hanya menerima `Content-Type: application/json`.

### Endpoint
| Method & path | Peran | Keterangan |
|---------------|-------|------------|
| POST `/auth/login` | publik | body `{username, password}` → 200 `{data:{user, token}}` |
| POST `/auth/logout` | login | hapus cookie → 204 |
| GET `/auth/me` | login | 200 `{data:{user}}` |
| GET `/products` | login | query `q`, `page`, `pageSize`, `isActive` |
| POST `/products` | SUPERVISOR | `{sku, name, unit?}` → 201 |
| GET `/products/{id}` | login | |
| PATCH `/products/{id}` | SUPERVISOR | `{name?, unit?, isActive?}` |
| GET `/receiving-documents` | login | query `status`, `q`, `page`, `pageSize` |
| POST `/receiving-documents` | login | `{supplierName, referenceNo?, expectedDate?, notes?, items:[{productId, expectedQty}]}` → 201 `DRAFT` |
| GET `/receiving-documents/{id}` | login | detail + items + receipts |
| PUT `/receiving-documents/{id}/items` | login | ganti semua item (hanya `DRAFT`) |
| POST `/receiving-documents/{id}/submit` | login | `DRAFT→OPEN` |
| POST `/receiving-documents/{id}/receipts` | login | header `Idempotency-Key`; body `{itemId, quantity, notes?}` → 201 (baru) atau 200 (replay) |
| POST `/receiving-documents/{id}/complete` | SUPERVISOR | → `COMPLETED` |
| POST `/receiving-documents/{id}/cancel` | SUPERVISOR | `{reason}` → `CANCELLED` |
| GET `/inventory` | login | query `q`, `page`, `pageSize` |
| GET `/inventory/transactions` | login | query `productId`, `documentId`, `page`, `pageSize` |
| GET `/health` | publik | 200 `{status:"ok"}` / 503 |

Respons sukses: `{ "data": ... }`; daftar: `{ "data": [...], "meta": { "page", "pageSize", "total" } }`. Paginasi default `page=1`, `pageSize=20`, maks 100.

### Respons error seragam
```json
{ "statusCode": 422, "error": "QUANTITY_EXCEEDS_REMAINING",
  "message": "Jumlah penerimaan (7) melebihi sisa (6).",
  "details": [ { "field": "quantity", "message": "maksimal 6" } ] }
```
| Status | `error` (kode) | Kapan |
|--------|----------------|-------|
| 400 | `VALIDATION_ERROR` | body/query tidak valid, `Idempotency-Key` hilang |
| 401 | `UNAUTHENTICATED` | tidak ada/invalid sesi, login salah (`INVALID_CREDENTIALS`) |
| 403 | `FORBIDDEN` | peran tidak berhak |
| 404 | `NOT_FOUND` | resource tidak ada |
| 409 | `SKU_ALREADY_EXISTS`, `INVALID_STATE_TRANSITION`, `DOCUMENT_NOT_RECEIVABLE`, `DOCUMENT_NOT_FULLY_RECEIVED`, `IDEMPOTENCY_KEY_REUSED` | konflik dengan keadaan saat ini |
| 422 | `QUANTITY_EXCEEDS_REMAINING`, `PRODUCT_INACTIVE` | input valid sintaks tetapi melanggar aturan bisnis |
| 500 | `INTERNAL_ERROR` | kesalahan tak terduga (detail hanya di log) |
| 503 | `SERVICE_UNAVAILABLE` | health check gagal |

### Validasi
Semua input divalidasi dengan zod di Route Handler (tipe, panjang, rentang, UUID), lalu service memvalidasi aturan bisnis yang bergantung pada data (BR-05..BR-10). Field tak dikenal ditolak (`strict`).

## 5. Alur Data
Lihat `data-flow.mmd`. Ringkas: UI → Route Handler (auth + zod) → service → transaksi Prisma ke PostgreSQL → hasil dipetakan ke DTO → UI memperbarui tampilan. Stok hanya berubah lewat satu jalur: `ReceivingService.recordReceipt`.

## 6. Alur API Penerimaan (langkah demi langkah)
Lihat `api-flow.mmd`. `POST /receiving-documents/{id}/receipts`:
1. Route Handler: autentikasi sesi; baca `Idempotency-Key` (wajib, 1–100 karakter); validasi body dengan zod (`itemId` UUID, `quantity` integer 1..1.000.000).
2. Service membuka transaksi (`READ COMMITTED`).
3. `SELECT ... FROM receiving_documents WHERE id = $1 FOR UPDATE` — mengunci dokumen (urutan kunci selalu dokumen → item agar tidak deadlock). 404 bila tidak ada.
4. Cek idempotensi: cari `receipts` dengan `(document_id, idempotency_key)`. Bila ada: jika `item_id` dan `quantity` sama → kembalikan receipt asli (200, `replayed:true`; nilai item, stok, dan status dokumen adalah kondisi saat ini, bukan snapshot respons pertama); bila berbeda → 409 `IDEMPOTENCY_KEY_REUSED`. Transaksi selesai tanpa efek.
5. Cek status dokumen ∈ {`OPEN`, `PARTIALLY_RECEIVED`}, jika tidak 409 `DOCUMENT_NOT_RECEIVABLE`.
6. `SELECT ... FROM receiving_items WHERE id = $2 AND document_id = $1 FOR UPDATE`; 404 bila tidak ada.
7. Hitung `remaining = expected_qty - received_qty`; bila `quantity > remaining` → 422 `QUANTITY_EXCEEDS_REMAINING` (transaksi di-rollback).
8. Insert `receipts`.
9. `UPDATE receiving_items SET received_qty = received_qty + quantity`.
10. Upsert stok atomik: `INSERT INTO inventory ... ON CONFLICT (product_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity RETURNING quantity`.
11. Insert `inventory_transactions` (`quantity_delta`, `balance_after` dari langkah 10, `receipt_id`).
12. Bila status `OPEN` → `PARTIALLY_RECEIVED`.
13. Commit; respons 201 berisi receipt, item terbaru, saldo stok, dan status dokumen.

Pengamanan berlapis: kunci baris (langkah 3, 6), CHECK constraint (`received_qty <= expected_qty`, `quantity >= 0`), UNIQUE idempotensi. Jika dua request mengirim key yang sama bersamaan, kunci dokumen menyerialkannya; request kedua melihat receipt pertama pada langkah 4.

`complete`: kunci dokumen → status harus `PARTIALLY_RECEIVED` (409 `INVALID_STATE_TRANSITION`) → ambil semua item; bila ada `received_qty < expected_qty` → 409 `DOCUMENT_NOT_FULLY_RECEIVED` beserta daftar item → set `COMPLETED`, `completed_at/by`.

## 7. Transisi Status
Lihat `state-machine.mmd`.

| Dari | Ke | Aksi | Syarat | Peran |
|------|----|------|--------|-------|
| (baru) | DRAFT | create | ≥1 item valid | OPERATOR, SUPERVISOR |
| DRAFT | OPEN | submit | ≥1 item | OPERATOR, SUPERVISOR |
| OPEN | PARTIALLY_RECEIVED | penerimaan pertama | otomatis | OPERATOR, SUPERVISOR |
| PARTIALLY_RECEIVED | PARTIALLY_RECEIVED | penerimaan berikutnya | sisa cukup | OPERATOR, SUPERVISOR |
| PARTIALLY_RECEIVED | COMPLETED | complete | semua item penuh | SUPERVISOR |
| DRAFT, OPEN | CANCELLED | cancel | alasan; belum ada penerimaan | SUPERVISOR |

Semua pasangan lain ditolak 409 `INVALID_STATE_TRANSITION`. `COMPLETED` dan `CANCELLED` adalah status akhir.

## 8. Otorisasi

| Aksi | OPERATOR | SUPERVISOR |
|------|:--------:|:----------:|
| Login/logout/me | ✔ | ✔ |
| Lihat produk, dokumen, stok, riwayat | ✔ | ✔ |
| Buat/ubah produk | ✘ | ✔ |
| Buat dokumen, ganti item (DRAFT), submit | ✔ | ✔ |
| Catat penerimaan | ✔ | ✔ |
| Complete dokumen | ✘ | ✔ |
| Cancel dokumen | ✘ | ✔ |

Ditegakkan di service (`assertRole(actor, ...)`), bukan hanya menyembunyikan tombol di UI. Pengguna `is_active=false` ditolak saat login dan pada tiap request.

## 9. Strategi Pengujian

Alat: Vitest + PostgreSQL sungguhan (service `db` pada Compose, database `warehouse_test`, migrasi dijalankan sebelum tes; tabel dibersihkan antar tes).

| Level | Cakupan |
|-------|---------|
| Unit | Fungsi murni: normalisasi/validasi SKU, skema zod (jumlah, key), pemetaan error → respons, mesin status (tabel transisi). |
| Integrasi (service + DB) | Setiap BR: penerimaan sebagian/penuh, kelebihan ditolak tanpa mengubah stok, status salah, complete ditolak bila belum penuh, cancel setelah penerimaan ditolak, idempotensi (replay, key berbeda isi), **konkurensi** (20 penerimaan paralel, total tidak melebihi sisa; stok = jumlah receipt sukses), invarian: `inventory.quantity = SUM(receipts.quantity)` per produk dan `received_qty = SUM(receipts.quantity)` per item, tiap receipt punya tepat satu transaksi, `balance_after` berurutan. |
| API (Route Handler) | Memanggil handler dengan `Request` nyata: 400/401/403/404/409/422, format error seragam, cookie/Bearer, otorisasi per peran. |
| End-to-end | Skrip alur penuh lewat HTTP terhadap `docker compose up` (login → produk → dokumen → submit → terima parsial → terima sisa → complete → cek stok dan riwayat), dijalankan sebagai tes Vitest terhadap `BASE_URL` atau manual di browser. |

Bukti hasil tes dan invarian dikumpulkan di `docs/testing.md`.

## 10. Konfigurasi (Environment Variable)
`DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET` (≥ 32 karakter), `COOKIE_SECURE`, `SEED_OPERATOR_PASSWORD`, `SEED_SUPERVISOR_PASSWORD`, `SEED_DEMO_DATA`, `PORT`. Contoh nilai fiktif ada di `.env.example`; `.env` tidak boleh di-commit.

## 11. Deployment Lokal
`docker compose up --build` menjalankan `db` → `migrate` → `app` (port 3000). Healthcheck: `db` memakai `pg_isready`; `app` memakai `GET /api/v1/health`. Tes dijalankan dengan `docker compose --profile test run --rm test`. Tidak ada deployment publik.
