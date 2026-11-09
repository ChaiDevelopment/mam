export const metadata = { title: 'Sumber data' };

export default function DataSourcesPage() {
  return (
    <>
      <h1>Dari mana data MAM! berasal?</h1>
      <h2>OpenStreetMap</h2>
      <ul>
        <li>
          Sebagian besar tempat makan di MAM! (nama, lokasi, alamat, jenis masakan, jam buka bila ada) berasal dari{' '}
          <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>, peta terbuka yang dibuat para kontributor di seluruh dunia. Peta di MAM! juga
          menggunakan tile OpenStreetMap.
        </li>
        <li>
          Data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap contributors
          </a>
          , tersedia di bawah{' '}
          <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer">
            Open Database License (ODbL)
          </a>
          . Tempat dari OpenStreetMap diberi label &quot;OSM&quot;.
        </li>
        <li>Info salah atau tempat sudah tutup? Kamu bisa memperbaikinya langsung di OpenStreetMap lewat tautan &quot;Lihat / perbaiki di OpenStreetMap&quot; di halaman tempat; perubahan ikut masuk ke MAM! saat data diperbarui.</li>
        <li>Rating Google tidak ditampilkan untuk tempat dari OpenStreetMap. MAM! tidak pernah menyalin data dari Google Maps.</li>
      </ul>
      <h2>Tempat tambahan dari komunitas</h2>
      <ul>
        <li>Tempat yang belum ada di peta dapat ditambahkan pengguna MAM! lewat halaman &quot;Tambah tempat&quot;. Tempat ini diberi label &quot;Ditambahkan komunitas MAM!&quot; dan dapat dikoreksi tim moderasi.</li>
      </ul>
      <h2>Google Maps (opsional)</h2>
      <ul>
        <li>Nama tempat, alamat, jam buka, rating Google, jumlah ulasan Google, foto tempat, dan cuplikan ulasan berasal dari Google Maps Platform dan diambil langsung saat kamu membuka halaman.</li>
        <li>Google hanya menyediakan maksimal 5 cuplikan ulasan per tempat. Untuk semua ulasan Google, buka tautan &quot;Buka di Google Maps&quot;.</li>
        <li>Penulis ulasan dan foto Google selalu ditampilkan sesuai atribusi dari Google.</li>
        <li>MAM! tidak menyalin konten Google ke database kami. Yang kami simpan hanyalah Place ID (diizinkan oleh Google) dan koordinat tempat selama maksimal 30 hari.</li>
      </ul>
      <h2>Komunitas MAM!</h2>
      <ul>
        <li>Rating komunitas, ulasan, foto, dan harga yang dilaporkan berasal dari pengguna MAM!.</li>
        <li>Rating MAM! dan rating Google dihitung terpisah dan tidak pernah digabung menjadi satu angka.</li>
        <li>&quot;Harga dilaporkan&quot; adalah median harga yang dibayar pengulas — bukan harga resmi restoran.</li>
      </ul>
      <h2>Platform pesan-antar (GoFood, GrabFood, ShopeeFood)</h2>
      <ul>
        <li>MAM! belum memiliki akses API resmi ke platform-platform ini, sehingga kami tidak menampilkan menu, harga, atau ketersediaan dari sana.</li>
        <li>Yang kami tampilkan hanyalah tautan resmi yang diverifikasi tim MAM! (dengan tanggal verifikasi), atau tautan kiriman pengguna yang diberi label &quot;belum diverifikasi&quot;.</li>
      </ul>
    </>
  );
}
