# Alur Kerja dengan AI Agent

Agent yang dipakai: **Claude Code** (model Claude Sonnet 5.5) di aplikasi desktop, dengan akses ke terminal, Docker, dan browser pada mesin pengembang. Pengembang manusia bertugas menetapkan arah, menyetujui rencana, mereview, dan memutuskan.

## Prinsip: dokumen lebih dulu, bukan satu prompt besar

```
PDF assessment ──► PRD ──► Spesifikasi teknis + ERD + OpenAPI + diagram ──► kode ──► tes ──► verifikasi
   (input)      docs/prd   docs/technical-spec, erd.mmd, openapi.yaml        src/    tests/   Docker + smoke
```

1. **Mode rencana dulu.** Agent membaca PDF assessment, memeriksa kondisi proyek (repo kosong/scaffold, toolchain terpasang), lalu menyusun rencana tertulis yang disetujui pengembang sebelum ada file proyek yang diubah. Pengembang beberapa kali menghentikan eksekusi untuk meminta penjelasan dan memutuskan arah.
2. **Spesifikasi sebagai masukan implementasi.** Setelah `CLAUDE.md` ditulis, dokumen di `docs/` dibuat dan di-commit *sebelum* kode. `CLAUDE.md` memerintahkan agent membaca `docs/prd.md` → `docs/technical-spec.md` → `docs/openapi.yaml` sebelum menulis kode, dan memperbarui spesifikasi lebih dulu bila perilaku berubah.
3. **Aturan bisnis bernomor (BR-01…BR-15)** di PRD dipakai sebagai kontrak: nama tes (`BR-07`, `BR-12`, …) dan komentar kode merujuk ke nomor itu sehingga mudah ditelusuri.
4. **Verifikasi bukan kepercayaan.** Setiap tahap diverifikasi dengan menjalankan sesuatu (lihat "Temuan verifikasi").

## Keputusan pengembang (arahan manusia)

| Keputusan | Pengaruh |
|-----------|----------|
| Dokumen, UI, dan komunikasi dalam Bahasa Indonesia | Semua dokumen dan teks UI berbahasa Indonesia; identifier kode tetap Inggris |
| Proyek memakai Next.js dan repo GitHub yang sudah ada | Arsitektur diubah dari rencana awal (NestJS + React) menjadi Next.js fullstack dengan lapisan `src/server` |
| Jangan deploy publik | Docker dibuat dan diuji lokal saja |
| Pengembang yang melakukan `git push` | Agent hanya commit lokal |
| Docker Desktop disiapkan pengembang; semua perintah npm lewat Docker | Muncul dari kegagalan `npm install` di host (lihat bawah) |

## Berkas instruksi agent

- [`CLAUDE.md`](../CLAUDE.md): urutan membaca spesifikasi, aturan bisnis yang tidak boleh dilanggar, struktur kode, konvensi, larangan commit secret, dan perintah umum via Docker.
- Izin alat lokal (`.claude/settings.local.json`) tidak di-commit.

## Prompt dan instruksi tugas

Instruksi tugas per tahap disimpan di [`docs/prompts/`](prompts):

| Berkas | Tahap | Masukan utama | Keluaran |
|--------|-------|---------------|----------|
| [01-prd-dan-spesifikasi.md](prompts/01-prd-dan-spesifikasi.md) | Menurunkan PRD dan spesifikasi teknis dari PDF | PDF assessment | `docs/prd.md`, `technical-spec.md`, `erd.mmd`, `openapi.yaml`, diagram |
| [02-database-dan-migrasi.md](prompts/02-database-dan-migrasi.md) | Skema database dan migrasi | `technical-spec.md` §3, `erd.mmd` | `prisma/schema.prisma`, migrasi dengan CHECK/trigger, seed |
| [03-layanan-penerimaan.md](prompts/03-layanan-penerimaan.md) | Logika penerimaan atomik dan API | PRD BR-*, spec §4 & §6, `openapi.yaml` | `src/server/**`, `app/api/v1/**` |
| [04-pengujian-dan-verifikasi.md](prompts/04-pengujian-dan-verifikasi.md) | Tes kritis dan pembuktian | PRD user story, spec §9 | `tests/**`, uji mutasi, smoke test |
| [05-antarmuka-pengguna.md](prompts/05-antarmuka-pengguna.md) | UI utama | `openapi.yaml`, PRD §7 | `app/**`, `src/client/**` |

Catatan kejujuran: dalam sesi ini pengembang manusia memberi arahan singkat (lampiran PDF, pilihan bahasa/stack, larangan deploy/push, persetujuan rencana). Isi berkas prompt di atas adalah instruksi tugas terstruktur yang dipakai agent pada tiap tahap, ditulis ulang agar dapat dibaca dan dipakai ulang oleh orang lain.

## Temuan verifikasi: kesalahan yang tertangkap

Bagian ini mencatat di mana keluaran AI atau asumsinya perlu dikoreksi, sebagai bukti review dan bukan penerimaan buta.

| # | Temuan | Cara terdeteksi | Perbaikan |
|---|--------|-----------------|-----------|
| 1 | `npm install` di host Windows gagal (`ERR_SSL_CIPHER_OPERATION_FAILED`) dan meninggalkan `node_modules` rusak | Menjalankan instalasi, membaca log npm; mencoba TLS 1.2, satu socket, dan Node lain | Semua perintah npm dijalankan di container Docker; lockfile dibuat di sana |
| 2 | Konflik peer dependency: `@types/node@20` vs Vitest 5 | Error resolusi npm | Naik ke `@types/node@22` |
| 3 | `next build` dengan `cacheComponents` menolak `usePathname()` di luar `Suspense` | Menjalankan build produksi | Shell klien dipindah ke `AppShell` dan dibungkus `Suspense` di layout server |
| 4 | Lint React: `setState` sinkron di dalam `useEffect` pada hook `useApi` | `eslint` | Hook ditulis ulang dengan state terkunci per permintaan |
| 5 | `.gitignore` bawaan (`.env*`) akan ikut mengabaikan `.env.example` yang wajib dikumpulkan | Membaca `.gitignore` saat scan | Ditambah `!.env.example` |
| 6 | Apakah tes konkurensi benar-benar menangkap bug? | Uji mutasi: kunci `FOR UPDATE` dihapus sementara | 2 tes gagal sesuai harapan; kunci dikembalikan, semua lulus |
| 7 | Replay idempotensi mengembalikan nilai item/stok *saat ini*, bukan snapshot | Meninjau perilaku saat menulis tes | Didokumentasikan di spesifikasi dan keterbatasan |

## Cara menelusuri satu operasi (untuk sesi review teknis)

Penerimaan barang dari klik tombol sampai baris database:

1. UI `app/(app)/receiving/[id]/page.tsx` → `ReceiveForm` membuat `Idempotency-Key` dan memanggil `POST /api/v1/receiving-documents/{id}/receipts`.
2. `app/api/v1/receiving-documents/[id]/receipts/route.ts` → `authed()` (`src/server/http.ts`) memverifikasi sesi, menvalidasi UUID, header key, dan body (zod).
3. `recordReceipt()` di `src/server/services/receiving.ts`: kunci dokumen → cek idempotensi → cek status → kunci item → cek sisa → insert receipt → update item → upsert stok → insert riwayat → update status (satu transaksi).
4. Respons 201/200 → UI memuat ulang dokumen.
5. Diagram: `docs/api-flow.mmd`; tes: `tests/integration/receiving.test.ts` dan `concurrency.test.ts`.
