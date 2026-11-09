/**
 * Fetches official brand logos (and a representative photo) from each brand's OFFICIAL website, for brands the
 * project owner has permission to feature, and stores re-encoded copies in MAM! storage.
 *
 *   npx ts-node --transpile-only scripts/fetch-brand-logos.ts <official-sites.json> "<permission note>" [--force]
 *
 * - Only brands without a free (Wikimedia Commons) logo are processed unless --force.
 * - Candidates: <img> whose tag mentions "logo" → apple-touch-icon → icon (largest). og:image becomes the photo.
 * - Files are downloaded (≤ 5 MB, image/* only, public hosts only), validated and re-encoded with sharp
 *   (logo → PNG ≤ 512 px, photo → WebP ≤ 960 px), which also strips any script inside SVGs.
 * - Stored with media_source = OWNER, license "Izin pemilik merek", source URL and the permission note.
 * - Never uses Google Maps or any third-party listing — only the brand's own website.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { StorageService } from '../src/modules/uploads/storage.service';

interface Site {
  name: string;
  wikidata: string | null;
  website: string | null;
}

const UA = 'MAM-brand-logo-fetcher/0.1 (food discovery app; logos used with brand owner permission)';
const MAX_BYTES = 5 * 1024 * 1024;
export const OWNER_LICENSE = 'Izin pemilik merek';

/** Blocks loopback, private, link-local and similar ranges (SSRF guard). */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return !(v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v === '::' || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.'));
  }
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

async function safeFetch(url: string, accept: string): Promise<Response | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const ips = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!ips.length || !ips.every((r) => isPublicIp(r.address))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: ctrl.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
};

/** Ordered logo candidates + og:image from a homepage. Pure (unit-tested). */
export function findCandidates(html: string, base: string, brand: string): { logos: string[]; photo: string | null } {
  const abs = (h: string | null) => {
    if (!h || h.startsWith('data:')) return null;
    try {
      return new URL(h.replace(/&amp;/g, '&'), base).toString();
    } catch {
      return null;
    }
  };
  const brandWord = brand.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const logoImgs = imgs
    .filter((t) => /logo/i.test(t) || (brandWord.length >= 3 && new RegExp(brandWord, 'i').test(attr(t, 'alt') ?? '')))
    .map((t) => abs(attr(t, 'src') ?? attr(t, 'data-src') ?? attr(t, 'data-lazy-src')))
    .filter((u): u is string => !!u)
    .sort((a, b) => Number(/\.svg(\?|$)/i.test(b)) - Number(/\.svg(\?|$)/i.test(a)));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const size = (t: string) => Number(/(\d+)x\d+/.exec(attr(t, 'sizes') ?? '')?.[1] ?? 0);
  const touch = links.filter((t) => /apple-touch-icon/i.test(attr(t, 'rel') ?? '')).sort((a, b) => size(b) - size(a)).map((t) => abs(attr(t, 'href')));
  const icons = links
    .filter((t) => /(^|\s)icon(\s|$)/i.test(attr(t, 'rel') ?? ''))
    .sort((a, b) => Number(/svg/i.test(attr(b, 'type') ?? attr(b, 'href') ?? '')) - Number(/svg/i.test(attr(a, 'type') ?? attr(a, 'href') ?? '')) || size(b) - size(a))
    .map((t) => abs(attr(t, 'href')));
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => /og:image$/i.test(attr(t, 'property') ?? attr(t, 'name') ?? ''));
  const logos = [...new Set([...logoImgs, ...touch, ...icons].filter((u): u is string => !!u))];
  return { logos, photo: og ? abs(attr(og, 'content')) : null };
}

async function download(url: string): Promise<Buffer | null> {
  const res = await safeFetch(url, 'image/*');
  if (!res) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!/^image\//i.test(type) && !/\.(svg|png|jpe?g|webp|ico)(\?|$)/i.test(url)) return null;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
}

/** True when the visible (non-transparent) pixels are mostly very light, e.g. a white wordmark on transparency. */
export async function isLightLogo(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    n++;
  }
  const transparentShare = 1 - n / (info.width * info.height);
  return n > 0 && sum / n > 0.85 && transparentShare > 0.2;
}

/** Re-encodes an image; returns null when it is not a real image or too small to be useful. */
async function reencode(buf: Buffer, kind: 'logo' | 'photo'): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const img = sharp(buf, { density: 300, failOn: 'error', limitInputPixels: 40_000_000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    if (kind === 'logo' && Math.max(meta.width, meta.height) < 64 && meta.format !== 'svg') return null;
    if (kind === 'photo' && (meta.width < 300 || meta.height < 150)) return null;
    if (kind === 'logo') {
      const resized = await img.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: meta.format !== 'svg' }).png().toBuffer();
      // White/very light logos on transparent backgrounds disappear on white cards: put them on a dark plate.
      const light = await isLightLogo(resized);
      const final = light
        ? await sharp(resized).extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } }).flatten({ background: '#2B2B2B' }).png().toBuffer({ resolveWithObject: true })
        : await sharp(resized).png().toBuffer({ resolveWithObject: true });
      return { data: final.data, width: final.info.width, height: final.info.height };
    }
    const out =
      kind === 'logo'
        ? await img.png().toBuffer({ resolveWithObject: true })
        : await img.rotate().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

async function main() {
  const [file, permission, ...flags] = process.argv.slice(2);
  if (!file || !permission || permission.trim().length < 5) throw new Error('usage: fetch-brand-logos.ts <official-sites.json> "<permission note>" [--force]');
  const force = flags.includes('--force');
  const sites = JSON.parse(readFileSync(file, 'utf8')) as Site[];
  const overridesFile = join(__dirname, '..', 'prisma', 'data', 'brand-media-overrides.json');
  const overrides = JSON.parse(readFileSync(overridesFile, 'utf8')) as Record<string, { logo?: boolean; photo?: boolean }>;
  const prisma = new PrismaClient();
  const storage = new StorageService();
  const report: string[] = [];
  let logos = 0;
  let photos = 0;
  try {
    const brands = await prisma.brand.findMany();
    for (const b of brands) {
      const site = sites.find((s) => (s.wikidata && s.wikidata === b.wikidata) || s.name.toLowerCase() === b.name.toLowerCase());
      const website = site?.website ?? b.website;
      // Free Commons files are kept; owner files are refreshed on every run.
      const ov = overrides[b.name] ?? {};
      const needLogo = ov.logo !== false && (force || !b.logoUrl || b.logoLicense === OWNER_LICENSE);
      const needPhoto = ov.photo !== false && (force || !b.imageUrl || b.imageLicense === OWNER_LICENSE);
      // Media rejected in manual review are removed if a previous run stored them.
      if ((ov.logo === false && b.logoLicense === OWNER_LICENSE) || (ov.photo === false && b.imageLicense === OWNER_LICENSE)) {
        await prisma.brand.update({
          where: { wikidata: b.wikidata },
          data: {
            ...(ov.logo === false && b.logoLicense === OWNER_LICENSE ? { logoUrl: null, logoThumbUrl: null, logoLicense: null, logoLicenseUrl: null, logoAuthor: null, logoSourceUrl: null } : {}),
            ...(ov.photo === false && b.imageLicense === OWNER_LICENSE ? { imageUrl: null, imageThumbUrl: null, imageLicense: null, imageLicenseUrl: null, imageAuthor: null, imageSourceUrl: null } : {}),
          },
        });
        report.push(`- ${b.name}: rejected media removed (overrides)`);
      }
      if (!website || (!needLogo && !needPhoto)) {
        if (!website) report.push(`- ${b.name}: no official website`);
        continue;
      }
      const page = await safeFetch(website, 'text/html');
      if (!page) {
        report.push(`- ${b.name}: website not reachable (${website})`);
        continue;
      }
      const html = (await page.text()).slice(0, 2_000_000);
      const { logos: cands, photo } = findCandidates(html, page.url || website, b.name);
      const key = b.wikidata.toLowerCase();
      const data: Record<string, unknown> = {};
      if (needLogo) {
        for (const c of cands.slice(0, 6)) {
          const raw = await download(c);
          const img = raw && (await reencode(raw, 'logo'));
          if (!img) continue;
          const k = `brands/${key}-logo.png`;
          await storage.put(k, img.data, 'image/png');
          Object.assign(data, { logoUrl: storage.publicUrl(k), logoThumbUrl: storage.publicUrl(k), logoLicense: OWNER_LICENSE, logoLicenseUrl: null, logoAuthor: b.name, logoSourceUrl: c.slice(0, 600) });
          logos++;
          report.push(`- ${b.name}: logo ${img.width}×${img.height} from ${c}`);
          break;
        }
        if (!data.logoUrl) report.push(`- ${b.name}: no usable logo on ${website}`);
      }
      if (needPhoto && photo) {
        const raw = await download(photo);
        const img = raw && (await reencode(raw, 'photo'));
        if (img) {
          const k = `brands/${key}-photo.webp`;
          await storage.put(k, img.data, 'image/webp');
          Object.assign(data, { imageUrl: storage.publicUrl(k), imageThumbUrl: storage.publicUrl(k), imageLicense: OWNER_LICENSE, imageLicenseUrl: null, imageAuthor: b.name, imageSourceUrl: photo.slice(0, 600) });
          photos++;
        }
      }
      if (Object.keys(data).length) {
        await prisma.brand.update({ where: { wikidata: b.wikidata }, data: { ...data, website: website.slice(0, 300), mediaSource: 'OWNER', permissionNote: permission.trim().slice(0, 300) } });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(report.join('\n'));
  console.log(JSON.stringify({ ownerLogos: logos, ownerPhotos: photos }));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
