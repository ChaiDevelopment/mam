import Link from 'next/link';

export const metadata = { title: 'Ketentuan Layanan' };

export default function TermsPage() {
  return (
    <>
      <h1>Ketentuan Layanan</h1>
      <p>Template ketentuan; tinjau bersama penasihat hukum sebelum peluncuran publik.</p>
      <h2>Tentang MAM!</h2>
      <p>MAM! adalah komunitas penemuan dan ulasan kuliner. MAM! bukan layanan pesan-antar: kami tidak menerima pesanan, pembayaran, atau mengelola pengiriman.</p>
      <h2>Pedoman ulasan</h2>
      <ul>
        <li>Tulis berdasarkan pengalaman pribadi yang nyata. Satu akun hanya boleh memiliki satu ulasan per tempat (bisa diedit).</li>
        <li>Dilarang: promosi/spam, tautan iklan, nomor telepon, ujaran kebencian, informasi pribadi orang lain, ulasan palsu atau berbayar.</li>
        <li>Foto harus milikmu sendiri dan menggambarkan makanan/tempat terkait.</li>
      </ul>
      <h2>Moderasi</h2>
      <ul>
        <li>Ulasan yang mengandung tautan, nomor telepon, teks berulang, atau berasal dari lonjakan akun baru akan ditahan (PENDING) untuk ditinjau.</li>
        <li>Ulasan yang dilaporkan oleh 5 pengguna berbeda disembunyikan sementara sampai ditinjau moderator.</li>
        <li>Moderator dapat menyembunyikan, menolak, memulihkan, atau menghapus ulasan; setiap tindakan dicatat beserta alasannya dan penulis diberi tahu.</li>
        <li>Penulis dapat mengedit ulasan yang disembunyikan/ditolak; ulasan tersebut akan ditinjau ulang.</li>
      </ul>
      <h2>Konten pihak ketiga</h2>
      <p>
        Informasi tempat, rating Google, dan cuplikan ulasan Google disediakan oleh Google Maps dan tunduk pada{' '}
        <a href="https://maps.google.com/help/terms_maps/" className="underline" target="_blank" rel="noopener noreferrer">Persyaratan Layanan Google Maps</a>. Lihat juga <Link href="/tentang-data" className="underline">sumber data</Link>.
      </p>
    </>
  );
}
