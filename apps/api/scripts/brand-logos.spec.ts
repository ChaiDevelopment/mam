import { findCandidates, isPublicIp } from './fetch-brand-logos';
import { brandKey, cleanAuthor, freeMedia } from './import-brands';

describe('brand logo fetching (official websites)', () => {
  const html = `<html><head>
    <link rel="icon" href="/favicon-16.png" sizes="16x16"><link rel="icon" type="image/svg+xml" href="/icon.svg">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-180.png"><link rel="apple-touch-icon" sizes="57x57" href="/apple-57.png">
    <meta property="og:image" content="https://cdn.contoh.id/hero.jpg?a=1&amp;b=2">
  </head><body>
    <img src="/img/banner.jpg" alt="Promo">
    <img class="site-logo" src="/img/logo.png" alt="x"><img src="/img/brand-logo.svg">
    <img data-src="//cdn.contoh.id/kopi-kenangan.png" alt="Kopi Kenangan">
  </body></html>`;

  it('orders logo candidates: svg <img> logos, other logos, apple-touch-icon (largest first), icons (svg first)', () => {
    const c = findCandidates(html, 'https://kopikenangan.co.id/', 'Kopi Kenangan');
    expect(c.logos.slice(0, 3)).toEqual(['https://kopikenangan.co.id/img/brand-logo.svg', 'https://kopikenangan.co.id/img/logo.png', 'https://cdn.contoh.id/kopi-kenangan.png']);
    expect(c.logos).toContain('https://kopikenangan.co.id/apple-180.png');
    expect(c.logos.indexOf('https://kopikenangan.co.id/apple-180.png')).toBeLessThan(c.logos.indexOf('https://kopikenangan.co.id/apple-57.png'));
    expect(c.logos.indexOf('https://kopikenangan.co.id/icon.svg')).toBeLessThan(c.logos.indexOf('https://kopikenangan.co.id/favicon-16.png'));
    expect(c.logos).not.toContain('https://kopikenangan.co.id/img/banner.jpg');
    expect(c.photo).toBe('https://cdn.contoh.id/hero.jpg?a=1&b=2');
  });

  it('blocks private and loopback addresses (SSRF guard)', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1']) expect(isPublicIp(ip)).toBe(false);
    for (const ip of ['104.18.2.3', '8.8.8.8', '2606:4700::1111']) expect(isPublicIp(ip)).toBe(true);
  });
});

describe('brand import helpers', () => {
  it('keys brands without Wikidata as MAM-<slug>', () => {
    expect(brandKey('Kopi Tuku')).toBe('MAM-kopi-tuku');
    expect(brandKey('Es Teh Indonesia')).toBe('MAM-es-teh-indonesia');
    expect(brandKey('% Arabica')).toBe('MAM-arabica');
    expect(brandKey('Ayam Bakar Wong Solo').length).toBeLessThanOrEqual(20);
  });

  it('cleans repeated/unknown Commons authors', () => {
    expect(cleanAuthor('Unknown authorUnknown author')).toBe('pembuat tidak diketahui');
    expect(cleanAuthor('Yum! Brands')).toBe('Yum! Brands');
    expect(cleanAuthor(null)).toBe('pembuat tidak diketahui');
  });

  it('accepts only free licenses on Wikimedia hosts and strips tracking parameters', () => {
    const ok = freeMedia({ license: 'CC BY-SA 4.0', url: 'https://upload.wikimedia.org/a.png?utm_source=x', thumbUrl: 'https://thumb.wikimedia.org/a/256px.png', author: 'A', file: 'File:A.png' });
    expect(ok).toMatchObject({ url: 'https://upload.wikimedia.org/a.png', license: 'CC BY-SA 4.0' });
    expect(freeMedia({ license: 'Fair use', url: 'https://upload.wikimedia.org/a.png' })).toBeNull();
    expect(freeMedia({ license: 'CC BY 4.0', url: 'https://example.com/a.png' })).toBeNull();
  });
});
