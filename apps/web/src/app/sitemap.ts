import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return ['', '/jelajah', '/feed', '/kejutan', '/peringkat', '/tentang-data', '/privasi', '/ketentuan'].map((p) => ({ url: `${base}${p}`, changeFrequency: 'daily' }));
}
