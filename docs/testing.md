# Pengujian dan Jaminan Kualitas

Strategi mengikuti `technical-spec.md` bagian 9. Semua tes berjalan terhadap **PostgreSQL sungguhan** (bukan mock) pada schema `test`, sehingga CHECK constraint, trigger, kunci baris, dan sequence ikut teruji.

## Cara menjalankan

```bash
cp .env.example .env            # sekali saja
docker compose --profile test run --rm test
```

`tests/setup.ts` menolak berjalan bila `DATABASE_URL` tidak memakai `?schema=test`, agar tes yang mengosongkan tabel tidak pernah menyentuh data aplikasi.

## Hasil terakhir

| Berkas | Jumlah tes | Cakupan |
|--------|-----------:|---------|
| `tests/unit/schemas.test.ts` | 27 | normalisasi/validasi SKU, jumlah (0, negatif, desimal, string, > 1.000.000), item duplikat, `Idempotency-Key`, format & parse nomor dokumen, pemetaan error → respons seragam (termasuk 500 tanpa membocorkan pesan internal) |
| `tests/integration/receiving.test.ts` | 32 | aturan BR-03…BR-13 pada service + DB: penerimaan sebagian/penuh, kelebihan ditolak, status tidak valid, complete/cancel, idempotensi, produk nonaktif, otorisasi, CHECK constraint & trigger |
| `tests/integration/concurrency.test.ts` | 5 | penerimaan paralel, key kembar paralel, dua dokumen untuk produk sama, balapan complete vs penerimaan |
| `tests/api/api.test.ts` | 18 | Route Handler dengan `Request` nyata: 400/401/403/404/409/422, format error, cookie & Bearer, alur penuh login → selesai |
| **Total** | **82** | **82 lulus, 0 gagal** (≈ 28 detik) |

Tambahan di luar Vitest: `scripts/smoke.mjs` (25 pemeriksaan HTTP terhadap container produksi, semuanya lulus), `tsc --noEmit` bersih, `eslint` bersih, `next build` sukses.

## Bukti: stok tetap benar setelah penerimaan

Setiap tes integrasi/konkurensi memanggil `assertInvariants()` (`tests/helpers.ts`) yang memeriksa langsung di database:

1. `inventory.quantity` = jumlah seluruh `receipts.quantity` untuk produk itu.
2. `receiving_items.received_qty` = jumlah receipt untuk item itu.
3. Setiap receipt punya tepat satu `inventory_transactions` (tidak ada receipt tanpa riwayat stok).
4. `balance_after` tidak duplikat per produk dan saldo tertinggi = stok saat ini.

Contoh konkret (`tests/integration/receiving.test.ts`):

| Skenario | Hasil yang diverifikasi |
|----------|--------------------------|
| Item 10: terima 4 lalu 6 | stok 4 → 10; riwayat `delta [4, 6]`, `balance_after [4, 10]`; sisa 0 |
| Tiga dokumen untuk produk sama | stok = jumlah semua penerimaan |

Pemeriksaan langsung pada database aplikasi setelah smoke test dan penelusuran UI:

```
 sku          | stok | total_receipt | cocok
--------------+------+---------------+-------
 BRG-001      |    4 |             4 | t
 BRG-002      |    0 |             0 | t
 SMK-MVOSCJVH |    8 |             8 | t
 receipts = 5, inventory_transactions = 5, item dengan received_qty > expected_qty = 0
```

## Bukti: operasi duplikat atau tidak valid tidak merusak stok

| Operasi | Respons | Bukti stok/data tidak berubah |
|---------|---------|-------------------------------|
| Terima melebihi sisa (7 dari sisa 6) | 422 `QUANTITY_EXCEEDS_REMAINING` | stok, `received_qty`, jumlah receipt & transaksi tetap (`receiving.test.ts`) |
| Kirim ulang request sama (key sama) | 200 `replayed: true` | stok +4 hanya sekali; 1 receipt, 1 transaksi |
| Key sama, isi berbeda | 409 `IDEMPOTENCY_KEY_REUSED` | stok tetap |
| 10 request paralel dengan key SAMA | 1 dibuat, 9 replay | stok +3 sekali; 1 receipt |
| 20 request paralel (key berbeda), sisa 10 | tepat 10 sukses, 10 ditolak 422 | `received_qty = 10`, stok 10, 10 receipt, 10 transaksi |
| 5 request paralel × 4 unit, sisa 10 | maksimal 2 sukses | stok 8, tidak pernah > 10 |
| 3 dokumen × 10 request paralel, produk sama | semua sukses | stok = 30 |
| Penerimaan pada DRAFT / COMPLETED / CANCELLED | 409 `DOCUMENT_NOT_RECEIVABLE` | stok tetap |
| Item milik dokumen lain | 404 | stok tetap |
| Jumlah 0, -1, 1.5, "3", tanpa key | 400 | stok tetap |
| `UPDATE received_qty > expected_qty` langsung via SQL | ditolak CHECK `receiving_items_received_qty_chk` | lapis pertahanan DB |
| `UPDATE inventory SET quantity = -1` via SQL | ditolak CHECK `inventory_quantity_chk` | lapis pertahanan DB |
| `UPDATE`/`DELETE inventory_transactions` via SQL | ditolak trigger append-only | riwayat utuh |

### Uji mutasi pada tes konkurensi
Untuk memastikan tes konkurensi benar-benar bermakna, kunci baris (`FOR UPDATE`) dihapus sementara dari `recordReceipt`. Hasilnya 2 dari 5 tes konkurensi **gagal** (termasuk pelanggaran unique idempotensi dan penerimaan melebihi sisa yang lolos ke CHECK database). Kunci dikembalikan dan seluruh tes lulus lagi. Artinya tes ini mendeteksi hilangnya penguncian.

## Pengujian end-to-end
- **Otomatis**: `node scripts/smoke.mjs` menjalankan alur penuh via HTTP (login, buat produk & dokumen, submit, terima sebagian, replay, melebihi sisa, paralel, complete, riwayat) terhadap stack `docker compose up`.
- **Manual (browser)**: login Supervisor → buat dokumen dua item lewat UI → ajukan → terima 4 dari 10 (status menjadi *Diterima Sebagian*, riwayat penerimaan tercatat, tombol *Selesaikan* menampilkan syarat item penuh).

## Keterbatasan dan masalah yang belum selesai

| # | Keterbatasan | Dampak / rencana |
|---|--------------|------------------|
| 1 | Tidak ada pembatasan percobaan login (rate limit / lockout) | Rentan tebak-password; tambahkan rate limit per IP/username |
| 2 | Perlindungan CSRF hanya SameSite=Lax + wajib `application/json` | Cukup untuk skala ini; produksi sebaiknya menambah token CSRF |
| 3 | JWT tidak dapat dicabut sebelum kedaluwarsa (8 jam); hanya status `is_active` dan peran dicek ulang tiap request | Tambah tabel sesi bila perlu logout paksa |
| 4 | Replay idempotensi mengembalikan receipt asli dengan **nilai item/stok saat ini**, bukan snapshot respons pertama | Cukup untuk mencegah duplikasi; snapshot butuh kolom respons tersimpan |
| 5 | Tidak ada manajemen pengguna lewat UI; akun hanya dari seed | Di luar scope PRD |
| 6 | Tidak ada koreksi stok, retur, over-receipt, lokasi/batch | Di luar scope; lihat pertanyaan terbuka Q-01…Q-05 di PRD |
| 7 | Nomor dokumen dapat memiliki celah bila transaksi pembuatan gagal | Perilaku sequence PostgreSQL; diterima (A-09) |
| 8 | Tidak ada tes browser otomatis (Playwright); UI diuji manual dan lewat smoke test API | Tambahkan Playwright untuk alur utama |
| 9 | Daftar dokumen memuat item untuk menghitung total; tidak dioptimalkan untuk puluhan ribu dokumen per halaman | Gunakan agregasi SQL bila data besar |
| 10 | Riwayat penerimaan pada detail dokumen tidak dipaginasi | Wajar untuk ≤ 200 item; paginasi bila perlu |
| 11 | Prisma 6 memberi peringatan bahwa `package.json#prisma` (konfigurasi seed) akan usang di Prisma 7 | Pindah ke `prisma.config.ts` saat upgrade |
| 12 | `npm install` langsung di Windows gagal pada jaringan penulis (TLS); semua perintah dijalankan di Docker | Lingkungan, bukan bug aplikasi |
| 13 | Nilai `change-me...` di `.env.example` hanya contoh dan wajib diganti | Jangan dipakai di lingkungan nyata |
| 14 | Tidak ada deployment publik (sesuai instruksi) | Image sudah siap; tinggal host dan HTTPS (`COOKIE_SECURE=true`) |

## Jika ada waktu tambahan
Playwright untuk alur UI utama, rate limiting login, CSRF token, pagination riwayat per dokumen, pencabutan sesi, koreksi stok dengan persetujuan Supervisor, dan ekspor CSV.
