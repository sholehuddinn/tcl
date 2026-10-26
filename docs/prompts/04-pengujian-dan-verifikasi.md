# Prompt 04 — Pengujian dan pembuktian

**Masukan:** `docs/prd.md` (user story dan BR-*), `docs/technical-spec.md` bagian 9.

**Instruksi tugas**

> Tulis tes otomatis untuk aturan bisnis kritis memakai Vitest terhadap PostgreSQL sungguhan (schema `test`, bukan mock). Tes harus menolak berjalan bila `DATABASE_URL` tidak memakai `schema=test`.
>
> 1. **Unit**: normalisasi SKU, batas jumlah, item duplikat, `Idempotency-Key`, pemetaan error.
> 2. **Integrasi service + DB**: satu tes per aturan bisnis penting, termasuk kasus tepi (menerima tepat sebesar sisa, satu unit lebih ditolak), DRAFT/COMPLETED/CANCELLED tidak menerima barang, otorisasi per peran, dan constraint database yang diuji langsung lewat SQL.
> 3. **Konkurensi**: 20 penerimaan paralel dengan sisa 10; key idempotensi sama paralel; dua dokumen untuk produk sama; balapan complete vs penerimaan.
> 4. **API**: panggil Route Handler dengan `Request` nyata dan periksa 400/401/403/404/409/422 serta bentuk error seragam.
> 5. Buat fungsi `assertInvariants()` yang memeriksa langsung di DB: stok = jumlah receipt per produk; `received_qty` = jumlah receipt per item; tiap receipt punya tepat satu transaksi stok; saldo tidak duplikat dan saldo tertinggi = stok. Panggil di tiap tes yang mengubah stok.
> 6. **Buktikan tes bermakna**: hapus sementara kunci `FOR UPDATE` dari `recordReceipt`, jalankan tes konkurensi, pastikan ada yang gagal, lalu kembalikan perubahan.
> 7. Tulis `scripts/smoke.mjs` untuk alur end-to-end via HTTP terhadap stack Docker yang berjalan.
> 8. Rangkum hasil, bukti, dan keterbatasan di `docs/testing.md`. Jangan menulis klaim yang belum kamu jalankan.

**Kriteria selesai:** semua tes lulus lewat `docker compose --profile test run --rm test`; uji mutasi terdokumentasi; smoke test lulus terhadap container produksi.

**Review manusia:** pengembang membaca `docs/testing.md`, memeriksa bahwa angka di dalamnya sama dengan keluaran tes nyata, dan menjalankan ulang tes.
