# Prompt 03 — Layanan penerimaan dan REST API

**Masukan:** `docs/prd.md` (BR-05…BR-13, user story US-05…US-08), `docs/technical-spec.md` bagian 4, 6, 7, 8, `docs/openapi.yaml`, `docs/api-flow.mmd`.

**Instruksi tugas**

> Implementasikan lapisan server di `src/server` dan Route Handler tipis di `app/api/v1`.
>
> - Pisahkan tanggung jawab: Route Handler hanya autentikasi → validasi zod → panggil service → format respons. Seluruh aturan bisnis ada di `src/server/services` dan menerima `actor` secara eksplisit sehingga dapat diuji tanpa HTTP.
> - Buat satu kelas `AppError` dengan kode (`QUANTITY_EXCEEDS_REMAINING`, `DOCUMENT_NOT_FULLY_RECEIVED`, …) dan satu pemeta ke respons `{statusCode, error, message, details[]}`. Error tak dikenal menjadi 500 tanpa membocorkan pesan internal.
> - Implementasikan `recordReceipt` sebagai **satu transaksi**, mengikuti urutan di spesifikasi bagian 6: kunci baris dokumen (`SELECT … FOR UPDATE`) → cek idempotensi → cek status → kunci baris item → hitung sisa → insert receipt → naikkan `received_qty` → upsert stok atomik (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) → insert riwayat dengan `balance_after` → ubah status OPEN→PARTIALLY_RECEIVED bila perlu. Urutan kunci selalu dokumen lalu item agar tidak deadlock.
> - `complete` hanya dari PARTIALLY_RECEIVED dan hanya bila semua item penuh (sebutkan item yang belum penuh di `details`); `cancel` hanya dari DRAFT/OPEN.
> - Otorisasi per peran ditegakkan di service (`assertRole`), pengguna nonaktif ditolak, dan data pengguna dimuat ulang dari DB pada tiap request.
> - Next.js memakai `cacheComponents`: pastikan setiap Route Handler bersifat request-time (baca `connection()`/header) dan jangan men-cache data DB. Baca dokumentasi Next yang terpasang bila ragu.
> - Jangan menambah fitur di luar PRD.

**Kriteria selesai:** `tsc --noEmit` dan `next build` bersih; semua endpoint di OpenAPI ada dengan kode status yang sama.

**Review manusia:** pengembang menelusuri `recordReceipt` baris demi baris dan menjelaskan mengapa urutan kunci dan tempat pengecekan idempotensi dipilih demikian.
