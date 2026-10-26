# Prompt 01 — PRD dan spesifikasi teknis

**Konteks yang diberikan ke agent:** PDF "Technical Assessment: AI-Driven Fullstack Developer Intern"; keputusan pengembang (Bahasa Indonesia, Next.js, tanpa deploy publik); `CLAUDE.md`.

**Instruksi tugas**

> Baca PDF assessment. Kebutuhan bisnisnya sengaja tidak jelas, jadi tugasmu menerjemahkannya menjadi dokumen yang cukup spesifik agar agent lain dapat mengimplementasikannya tanpa menebak perilaku bisnis.
>
> 1. Tulis `docs/prd.md`: problem statement dan tujuan terukur, peran dan tanggung jawab, kebutuhan fungsional (FR-*) dan non-fungsional (NFR-*), aturan bisnis bernomor (BR-*) beserta batas validasi (panjang, rentang angka, format SKU), user story dengan kriteria penerimaan Given/When/Then, scope dan di luar scope, serta asumsi (A-*) dengan alasannya dan pertanyaan terbuka (Q-*). Jangan menyembunyikan ketidakjelasan: setiap keputusan yang kamu ambil harus tercatat sebagai asumsi.
> 2. Tulis `docs/technical-spec.md` yang diturunkan dari PRD: arsitektur dan tanggung jawab komponen, desain tabel (tipe, constraint, index, strategi migrasi), kontrak API (endpoint, peran, skema, kode error), alur data, urutan langkah API penerimaan (termasuk strategi penguncian dan idempotensi), tabel transisi status, matriks otorisasi, dan strategi tes unit/integrasi/e2e.
> 3. Hasilkan `docs/erd.mmd`, `docs/openapi.yaml`, `docs/data-flow.mmd`, `docs/api-flow.mmd`, `docs/state-machine.mmd`.
>
> Aturan inti yang harus eksplisit dan konsisten di semua dokumen: penerimaan tidak boleh melebihi sisa; dokumen tidak boleh COMPLETED kecuali semua item diterima penuh; request penerimaan ganda tidak boleh menggandakan stok; backend menegakkan semua aturan, bukan UI. Pastikan nama field, kode error, dan status identik di PRD, spesifikasi, dan OpenAPI.

**Kriteria selesai:** tidak ada kontradiksi antar dokumen; setiap BR-* dapat dipetakan ke minimal satu tes; semua pertanyaan terbuka tercantum.

**Review manusia:** pengembang memeriksa asumsi (peran, status, over-receipt, pembatalan) dan menyetujui rencana sebelum implementasi.
