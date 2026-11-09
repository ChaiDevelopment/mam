# Panduan Admin MAM!

Dasbor admin: `https://admin.mam.id` (dev: `http://localhost:3001`). Masuk dengan Google; akun harus berperan
MODERATOR atau lebih tinggi. **Semua hak akses diperiksa ulang oleh server** — menyembunyikan menu di UI bukan pengaman.

## Peran

| Peran | Bisa |
|---|---|
| MODERATOR | Ringkasan, antrean laporan, moderasi ulasan, melihat pengguna/restoran/kategori |
| ADMIN | + tangguhkan/pulihkan pengguna, ubah peran (hanya di bawah perannya), kelola restoran, gabungkan duplikat, verifikasi tautan platform, kategori, log audit, integrasi, penyimpanan |
| SUPER_ADMIN | + konfigurasi platform, kelola admin lain |

Tidak ada yang bisa mengubah peran/status akunnya sendiri. Akun SUPER_ADMIN pertama dibuat lewat `BOOTSTRAP_SUPER_ADMIN_EMAILS`.

## Kebijakan moderasi (transparan)

| Status | Arti |
|---|---|
| PENDING | Ditahan otomatis (tautan, nomor telepon, teks berulang, duplikat, lonjakan akun baru) atau mode persetujuan aktif |
| PUBLISHED | Tampil publik dan dihitung di statistik komunitas |
| HIDDEN | Disembunyikan sementara (moderator, atau otomatis setelah 5 laporan berbeda) |
| REJECTED | Ditolak karena melanggar pedoman |
| DELETED | Dihapus penulis (bisa dibuat ulang) atau moderator (terkunci) |

Setiap tindakan **wajib alasan** (min. 5 karakter), dicatat di `moderation_actions` dan log audit, dan penulis menerima
notifikasi berisi alasan tersebut. Penulis dapat mengedit ulasan HIDDEN/REJECTED; ulasan itu kembali ke PENDING.

## Alur kerja harian
1. **Ringkasan** — cek kartu "Laporan menunggu" dan "Ulasan menunggu moderasi".
2. **Laporan** — tinjau terlama dulu. *Ambil tindakan* (HIDE/REJECT/DELETE) menyelesaikan semua laporan terbuka untuk ulasan itu; *Tidak melanggar* / *Abaikan* hanya laporan tersebut. Pelapor diberi tahu.
3. **Moderasi ulasan** — filter PENDING → PUBLISH / HIDE / REJECT.
4. **Restoran → Kemungkinan duplikat** — pasangan berjarak < 30 m. *Gabungkan* memindahkan ulasan, favorit, koleksi, Place ID, dan tautan; jika satu pengguna mengulas keduanya, ulasan di restoran tujuan dipertahankan.
5. **Restoran → Kelola → Platform pesan-antar** — buka aplikasi penyedia, pastikan restorannya sama, simpan tautan resmi (VERIFIED) atau tandai *Tidak tersedia*. Jangan memasukkan menu atau harga.

## Sistem
* **Integrasi** — status Google, database, Redis, penyimpanan, dan platform pesan-antar (sukses/error 24 jam, latensi, error terakhir). Tombol *Periksa integrasi sekarang* menjalankan pemeriksaan aktif.
* **Penyimpanan** — jumlah/ukuran foto, unggahan yatim (dibersihkan otomatis setelah 24 jam).
* **Konfigurasi** (SUPER_ADMIN) — radius bawaan, panjang minimum ulasan, batas ulasan per hari, mode persetujuan.
* **Log audit** — siapa melakukan apa, kapan, dari IP mana, beserta alasannya. Tidak dapat diubah dari dasbor.

## Pengajuan tempat (moderator)

Pengguna dapat menambahkan tempat makan yang belum ada (menu **Tambah tempat**). Pengajuan berstatus **PENDING** dan
**tidak tampil** di pencarian sampai disetujui.

1. Buka **Pengajuan tempat** di dashboard admin (ringkasan menampilkan jumlah yang menunggu).
2. Periksa nama, kategori, alamat, dan **titik koordinat** (tautan OpenStreetMap/Google Maps), serta peringatan
   *"Mungkin duplikat"* (tempat lain ≤ 150 m).
3. **Setujui** → tempat langsung tampil; pengaju mendapat notifikasi + email.
   **Tolak** → wajib alasan (min. 5 karakter, tersedia alasan cepat); alasan **dikirim ke email pengaju** dan tampil di
   daftar *Pengajuan tempatku*. Pengguna boleh mengajukan ulang setelah memperbaiki data.
4. Setiap keputusan tercatat di **Log audit** (`PLACE_APPROVED` / `PLACE_REJECTED`). Dua moderator tidak bisa memproses
   pengajuan yang sama (yang kedua mendapat pesan "sudah diproses").

Tempat yang ditambahkan oleh staf (moderator/admin) langsung terbit. Pengajuan PENDING/REJECTED tidak dapat diubah
lewat menu *Restoran* — gunakan halaman *Pengajuan tempat*.

## Login staf dengan MFA

Akun MODERATOR/ADMIN/SUPER_ADMIN yang masuk dengan email + kata sandi wajib memasukkan **kode 6 angka** yang dikirim ke
email akun (berlaku 10 menit, maks. 5 percobaan, kirim ulang tiap 30 detik). Membuat akun staf:
`npm run user:set-password -w @mam/api -- email@contoh.id "kata-sandi-kuat" MODERATOR`.
