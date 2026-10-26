# Prompt 05 — Antarmuka pengguna

**Masukan:** `docs/openapi.yaml`, `docs/prd.md` bagian 7, `CLAUDE.md`.

**Instruksi tugas**

> Bangun UI yang dapat dipakai untuk alur utama, dalam Bahasa Indonesia, dengan Tailwind. Prioritaskan kebenaran alur dibanding tampilan; jangan menambah halaman di luar PRD.
>
> - Halaman: login; produk (daftar, cari, tambah, aktif/nonaktif untuk Supervisor); daftar dokumen (filter status, cari); buat dokumen (pemasok + banyak item); detail dokumen (item, diharapkan/diterima/sisa, form terima per item, riwayat penerimaan, tombol Ajukan/Ubah item/Selesaikan/Batalkan sesuai peran dan status); stok; riwayat transaksi.
> - Tombol dan aksi disesuaikan peran, tetapi **jangan** mengandalkan UI untuk keamanan: backend sudah menegakkan semuanya. Tampilkan pesan error dari API apa adanya.
> - Form terima harus mengirim `Idempotency-Key` yang dipertahankan selama isian tidak berubah, sehingga klik ganda atau kirim ulang setelah gangguan jaringan tidak menggandakan stok.
> - Next.js memakai `cacheComponents`: hook runtime seperti `usePathname`/`useParams` harus berada di bawah `Suspense`. Jalankan `next build` untuk memastikan.
> - Jalankan `tsc --noEmit`, `eslint`, dan `next build`; telusuri alur utama di browser terhadap `docker compose up`.

**Kriteria selesai:** operator dapat membuat dokumen, mengajukannya, dan mencatat penerimaan sebagian; supervisor dapat menyelesaikan atau membatalkan; build dan lint bersih.

**Review manusia:** pengembang mencoba alur di browser sebagai operator dan supervisor.
