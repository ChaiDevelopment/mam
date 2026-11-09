export const metadata = { title: 'Kebijakan Privasi' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Kebijakan Privasi</h1>
      <p>Dokumen ini menjelaskan data yang diproses MAM! dan alasannya. Template ini perlu ditinjau oleh penasihat hukum sebelum peluncuran publik.</p>
      <h2>Data yang kami simpan</h2>
      <ul>
        <li>Identitas akun dari Google: email, nama, foto profil, dan ID akun Google. Kami tidak menyimpan token akses Google.</li>
        <li>Konten yang kamu buat: ulasan, rating, harga yang kamu laporkan, foto, reaksi, laporan, koleksi, dan favorit.</li>
        <li>Preferensi dan riwayat pencarian teks (bisa dimatikan; dihapus otomatis setelah 90 hari).</li>
        <li>Log keamanan: alamat IP dan user-agent per sesi login, untuk mencegah penyalahgunaan.</li>
      </ul>
      <h2>Lokasi</h2>
      <ul>
        <li>Lokasi diminta hanya saat kamu menekan &quot;Gunakan lokasiku&quot;, dan hanya sekali (tanpa pelacakan di latar belakang).</li>
        <li>Koordinatmu dikirim ke server MAM! untuk mencari tempat di sekitarmu dan diteruskan ke Google Places API. Kami tidak menyimpan riwayat lokasimu dan tidak mencatat koordinat di log.</li>
        <li>Data lokasi (EXIF GPS) pada foto yang kamu unggah dihapus otomatis.</li>
      </ul>
      <h2>Layanan pihak ketiga</h2>
      <p>
        MAM! menggunakan Google Maps Platform. Penggunaan fitur peta dan tempat tunduk pada{' '}
        <a href="https://policies.google.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Kebijakan Privasi Google</a> dan{' '}
        <a href="https://maps.google.com/help/terms_maps/" className="underline" target="_blank" rel="noopener noreferrer">Persyaratan Layanan Google Maps</a>.
      </p>
      <h2>Hak kamu</h2>
      <ul>
        <li>Mengubah profil dan preferensi kapan saja di halaman Profil.</li>
        <li>Menghapus riwayat pencarian.</li>
        <li>Menghapus akun: profil, favorit, koleksi, riwayat, dan foto dihapus segera; ulasan disembunyikan segera dan isinya dihapus permanen setelah 30 hari (masa peninjauan penyalahgunaan).</li>
      </ul>
    </>
  );
}
