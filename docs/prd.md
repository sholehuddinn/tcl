# Product Requirements Document — Sistem Penerimaan Barang Gudang

Versi 1.0 · Bahasa: Indonesia · Dokumen ini adalah masukan utama bagi spesifikasi teknis (`technical-spec.md`) dan implementasi oleh AI agent.

## 1. Latar Belakang dan Tujuan

### 1.1 Problem statement
Gudang saat ini mencatat barang masuk di spreadsheet. Akibatnya:
- jumlah yang diterima mudah salah ketik atau melebihi jumlah yang dijanjikan pemasok;
- tidak ada status yang jelas apakah suatu pengiriman sudah selesai diterima;
- stok tersedia harus dihitung manual dan sulit ditelusuri asal-usulnya;
- tidak ada jejak siapa menerima apa dan kapan.

### 1.2 Tujuan bisnis
| ID | Tujuan | Indikator keberhasilan |
|----|--------|------------------------|
| G1 | Mencatat pengiriman masuk dalam dokumen penerimaan terstruktur | Setiap pengiriman punya dokumen dengan nomor unik |
| G2 | Mencegah kesalahan jumlah penerimaan | Sistem menolak 100% penerimaan yang melebihi sisa |
| G3 | Stok selalu mencerminkan barang yang benar-benar diterima | Stok produk = jumlah seluruh penerimaan produk itu |
| G4 | Jejak audit penuh | Setiap perubahan stok punya satu baris riwayat transaksi |

### 1.3 Pengguna
Aplikasi dipakai oleh operator dan supervisor gudang di satu gudang.

## 2. Peran Pengguna

| Peran | Tanggung jawab |
|-------|----------------|
| **OPERATOR** (operator gudang) | Membuat dokumen penerimaan (draft), mengisi item, mengajukan (submit) dokumen, mencatat barang yang diterima, melihat produk, stok, dan riwayat |
| **SUPERVISOR** (supervisor gudang) | Semua hak Operator, ditambah: mengelola produk (buat/ubah), menyelesaikan (complete) dokumen, membatalkan dokumen |

Pembuatan akun pengguna di luar scope; dua akun awal dibuat lewat seed (lihat 8. Asumsi).

## 3. Ruang Lingkup

### 3.1 Dalam scope
Manajemen produk dan SKU; dokumen penerimaan beserta item dan jumlah yang diharapkan; pencatatan penerimaan sebagian atau penuh; status dokumen; stok tersedia; riwayat transaksi stok; autentikasi berbasis peran; REST API terdokumentasi; deployment Docker lokal.

### 3.2 Di luar scope
Retur ke pemasok, penerimaan melebihi jumlah yang diharapkan (over-receipt), koreksi/penyesuaian stok manual, barang keluar (outbound), transfer antar gudang, lokasi/rak/bin, batch/lot/tanggal kedaluwarsa, harga dan biaya, master pemasok, upload lampiran, notifikasi, pendaftaran dan manajemen pengguna lewat UI, multi-bahasa, deployment publik.

## 4. Kebutuhan Fungsional

| ID | Kebutuhan |
|----|-----------|
| FR-01 | Pengguna dapat login dengan username dan password dan logout. |
| FR-02 | Sistem menampilkan daftar produk (dengan pencarian SKU/nama dan paginasi). |
| FR-03 | Supervisor dapat membuat produk (SKU, nama, satuan) dan mengubah nama, satuan, serta status aktif. |
| FR-04 | Pengguna dapat membuat dokumen penerimaan berisi pemasok, nomor referensi (opsional), tanggal diharapkan (opsional), catatan, dan minimal satu item (produk + jumlah diharapkan). |
| FR-05 | Item dokumen dapat diganti selama status `DRAFT`. |
| FR-06 | Dokumen `DRAFT` dapat diajukan menjadi `OPEN`. |
| FR-07 | Sistem menampilkan daftar dokumen (filter status, pencarian, paginasi) dan detail dokumen beserta item, jumlah diharapkan, diterima, sisa, dan riwayat penerimaannya. |
| FR-08 | Pengguna dapat mencatat penerimaan sebagian atau penuh untuk satu item dokumen berstatus `OPEN` atau `PARTIALLY_RECEIVED`. |
| FR-09 | Setiap penerimaan otomatis menambah stok produk dan membuat satu baris riwayat transaksi. |
| FR-10 | Supervisor dapat menyelesaikan dokumen hanya jika semua item diterima penuh. |
| FR-11 | Supervisor dapat membatalkan dokumen `DRAFT` atau `OPEN` dengan alasan. |
| FR-12 | Sistem menampilkan stok tersedia per produk. |
| FR-13 | Sistem menampilkan riwayat transaksi stok (filter produk/dokumen, paginasi), terbaru dahulu. |
| FR-14 | Sistem menyediakan endpoint health check yang memeriksa koneksi database. |

## 5. Kebutuhan Non-Fungsional

| ID | Kebutuhan |
|----|-----------|
| NFR-01 Integritas data | Aturan bisnis ditegakkan di backend dan didukung constraint database; validasi UI hanya kemudahan. |
| NFR-02 Konsistensi | Penerimaan, pembaruan item, stok, riwayat, dan status dokumen terjadi dalam satu transaksi atomik. Penerimaan paralel tidak boleh melampaui jumlah diharapkan. |
| NFR-03 Idempotensi | Pengiriman ulang request penerimaan yang sama tidak menambah stok dua kali. |
| NFR-04 Keamanan | Password di-hash (bcrypt); sesi memakai JWT di cookie httpOnly; semua endpoint kecuali login dan health butuh autentikasi; otorisasi per peran di backend; tidak ada secret di repository. |
| NFR-05 Kinerja | Daftar dan detail merespons < 500 ms untuk hingga 10.000 produk dan 10.000 dokumen pada satu instance (daftar dipaginasi, kolom pencarian diindeks). |
| NFR-06 Auditabilitas | Riwayat transaksi tidak dapat diubah/dihapus lewat API. |
| NFR-07 Operasional | Konfigurasi lewat environment variable; migrasi database terversi dan dapat dijalankan ulang tanpa efek samping; health check; log error terstruktur tanpa data sensitif. |
| NFR-08 Kegunaan | UI responsif (desktop dan tablet), teks Bahasa Indonesia, pesan error yang jelas. |
| NFR-09 Keterujian | Logika bisnis terpisah dari HTTP sehingga dapat diuji otomatis terhadap PostgreSQL sungguhan. |

## 6. Aturan Bisnis dan Validasi

| ID | Aturan |
|----|--------|
| BR-01 | SKU unik, huruf besar, format `^[A-Z0-9][A-Z0-9._-]{1,31}$`; input huruf kecil dinormalisasi ke huruf besar; SKU tidak dapat diubah setelah dibuat. |
| BR-02 | Semua jumlah adalah bilangan bulat, 1 ≤ jumlah ≤ 1.000.000. |
| BR-03 | Satu dokumen punya 1–200 item; satu produk hanya boleh muncul sekali per dokumen. Dokumen tanpa item tidak dapat diajukan. |
| BR-04 | Item dokumen hanya dapat diubah saat `DRAFT`. Dokumen `COMPLETED`/`CANCELLED` tidak dapat diubah lagi. |
| BR-05 | Produk nonaktif tidak dapat ditambahkan ke dokumen baru/diganti; dokumen yang sudah ada tetap dapat menerima produk tersebut. |
| BR-06 | Penerimaan hanya pada status `OPEN` atau `PARTIALLY_RECEIVED`. |
| BR-07 | Jumlah penerimaan ≤ sisa (`jumlah_diharapkan − jumlah_diterima`) item tersebut; kelebihan ditolak seluruhnya (tidak dipotong otomatis). |
| BR-08 | Penerimaan pertama pada dokumen `OPEN` mengubah status menjadi `PARTIALLY_RECEIVED`. Status tidak otomatis menjadi `COMPLETED`. |
| BR-09 | `COMPLETED` hanya dari `PARTIALLY_RECEIVED` dan hanya bila setiap item `diterima = diharapkan`. Selain itu ditolak. |
| BR-10 | `CANCELLED` hanya dari `DRAFT` atau `OPEN` (belum ada penerimaan), wajib alasan 3–500 karakter. Dokumen yang sudah ada penerimaan tidak dapat dibatalkan karena stok sudah bertambah. |
| BR-11 | Setiap penerimaan menambah stok produk sebesar jumlah penerimaan dan menulis satu baris riwayat dengan saldo setelahnya. |
| BR-12 | Request penerimaan wajib membawa `Idempotency-Key`. Key sama pada dokumen sama dengan isi sama mengembalikan hasil semula tanpa efek baru; key sama dengan isi berbeda ditolak. |
| BR-13 | Stok tidak boleh negatif; riwayat transaksi hanya bertambah (append-only). |
| BR-14 | Hak akses mengikuti matriks pada spesifikasi teknis; pelanggaran menghasilkan 403. |
| BR-15 | Field wajib: pemasok (1–150 karakter); nama produk (1–150); satuan (1–20, default `pcs`); catatan penerimaan opsional (≤ 500). |

## 7. User Story dan Kriteria Penerimaan

**US-01 Login** — Sebagai pengguna, saya login agar dapat memakai sistem.
- Given kredensial benar, When login, Then sesi dibuat dan saya melihat nama serta peran saya.
- Given kredensial salah, Then ditolak dengan pesan umum (tanpa membocorkan apakah username ada).
- Given belum login, When mengakses halaman/API terproteksi, Then diarahkan ke login / 401.

**US-02 Kelola produk (Supervisor)** — Sebagai supervisor, saya membuat dan mengubah produk.
- Given SKU baru valid, When membuat produk, Then produk muncul di daftar dengan stok 0.
- Given SKU sudah ada (tanpa memandang huruf besar/kecil), Then ditolak 409.
- Given saya Operator, When membuat produk, Then ditolak 403.

**US-03 Buat dokumen penerimaan** — Sebagai pengguna, saya membuat dokumen dengan item.
- Given pemasok dan ≥1 item valid, Then dokumen `DRAFT` terbuat dengan nomor unik `RCV-000001`, dst.
- Given produk duplikat, jumlah ≤ 0 atau bukan bilangan bulat, atau produk nonaktif, Then ditolak 400 dengan detail per field.
- Given dokumen `DRAFT`, When saya mengganti item, Then item lama diganti seluruhnya.

**US-04 Ajukan dokumen** — Given dokumen `DRAFT` berisi item, When submit, Then status `OPEN`. Given status lain, Then 409.

**US-05 Catat penerimaan** — Sebagai operator, saya mencatat barang yang datang.
- Given item sisa 10, When menerima 4, Then diterima=4, sisa=6, stok produk +4, status `PARTIALLY_RECEIVED`, satu riwayat transaksi tercipta.
- Given item sisa 6, When menerima 6, Then diterima=diharapkan, sisa=0.
- Given item sisa 6, When menerima 7, Then ditolak 422 dan stok, item, riwayat tidak berubah.
- Given dokumen `DRAFT`/`COMPLETED`/`CANCELLED`, Then ditolak 409.
- Given `Idempotency-Key` tidak ada, Then 400.

**US-06 Cegah penerimaan ganda** — Given request penerimaan sukses, When dikirim ulang dengan key sama dan isi sama, Then respons sama (status 200, `replayed: true`) dan stok tidak bertambah. Given key sama tetapi isi berbeda, Then 409. Given 20 request paralel dengan key berbeda untuk sisa total 10, Then total diterima tepat 10 dan sisanya ditolak 422.

**US-07 Selesaikan dokumen (Supervisor)** — Given semua item diterima penuh, When complete, Then `COMPLETED`. Given ada item belum penuh, Then 409 dengan daftar item yang belum penuh. Given Operator, Then 403.

**US-08 Batalkan dokumen (Supervisor)** — Given `DRAFT`/`OPEN` dan alasan valid, Then `CANCELLED`. Given sudah ada penerimaan, Then 409.

**US-09 Lihat stok** — Given penerimaan sudah dicatat, When membuka stok, Then jumlah per produk sama dengan total penerimaan produk itu; produk tanpa penerimaan tampil 0.

**US-10 Lihat riwayat transaksi** — Given penerimaan, When membuka riwayat, Then tiap penerimaan muncul dengan tanggal, produk, dokumen, perubahan, saldo setelahnya, dan pelaku; terbaru di atas; dapat difilter produk atau dokumen.

**US-11 Health check** — When `GET /api/v1/health`, Then 200 `{status:"ok"}` jika database terhubung, 503 jika tidak.

## 8. Asumsi, Batasan, dan Pertanyaan Terbuka

### Asumsi (keputusan sementara karena kebutuhan awal tidak jelas)
| ID | Asumsi dan alasan |
|----|-------------------|
| A-01 | Satu gudang tanpa lokasi/batch; stok adalah satu angka per produk. Menyederhanakan model sesuai kebutuhan "available stock". |
| A-02 | Operator tidak mengelola master produk agar SKU konsisten; supervisor yang bertanggung jawab. |
| A-03 | Tahap `DRAFT` dan `OPEN` dipisah agar dokumen dapat dikoreksi sebelum diumumkan siap diterima. |
| A-04 | Over-receipt tidak diizinkan; kelebihan barang fisik ditangani di luar sistem. Aturan eksplisit di soal. |
| A-05 | `COMPLETED` adalah keputusan eksplisit supervisor, bukan otomatis, sehingga ada tanda tangan pengesahan; sistem hanya mengizinkannya bila semua item penuh. |
| A-06 | Dokumen yang sudah ada penerimaan tidak dapat dibatalkan; koreksi stok masuk scope berikutnya. |
| A-07 | Penerimaan dicatat per item, bukan per surat jalan, agar request sederhana dan idempoten. |
| A-08 | Dua akun awal (`operator`, `supervisor`) dibuat lewat seed; passwordnya dari environment variable. |
| A-09 | Nomor dokumen berurut `RCV-` + 6 digit dari sequence database; celah nomor mungkin terjadi bila transaksi gagal. |
| A-10 | Waktu disimpan UTC; UI menampilkan zona waktu browser. |

### Batasan
Stack: Next.js, Prisma, PostgreSQL, Docker. Satu instance aplikasi. Tidak ada deployment publik. Tidak ada secret di repository.

### Pertanyaan terbuka (untuk pemilik bisnis)
- Q-01 Apakah toleransi kelebihan kiriman (mis. ±5%) perlu didukung?
- Q-02 Apakah dokumen yang sudah ada penerimaan sebagian boleh ditutup paksa (short-close) dengan alasan?
- Q-03 Apakah operator boleh menyelesaikan dokumen dengan persetujuan supervisor terpisah?
- Q-04 Apakah diperlukan koreksi stok/retur, dan siapa yang berwenang?
- Q-05 Apakah penerimaan perlu mencatat lokasi rak atau nomor batch?
