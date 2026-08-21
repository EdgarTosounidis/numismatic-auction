#!/usr/bin/env node
/**
 * scrape-images.js — download pictures that match a keyword.
 *
 * Zero dependencies, needs Node 18+ (uses the built-in fetch).
 *
 *   node tools/image-scraper/scrape-images.js "1909 VDB Lincoln cent" --limit 20
 *
 * Sources:
 *   commons    Wikimedia Commons search (free/licensed media, no API key)
 *   openverse  Openverse search across Flickr, museums, etc. (no API key)
 *   page       every image on the page URLs you pass with --page, filtered by keyword
 *
 * Run with --help for the full option list.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '1.0.0';
const DEFAULT_UA =
  `numismatic-auction-image-scraper/${VERSION} (+https://github.com/edgartosounidis/numismatic-auction)`;

/* ------------------------------------------------------------------ *
 * CLI parsing
 * ------------------------------------------------------------------ */

const HELP = `
scrape-images ${VERSION} — download pictures matching a keyword

Usage:
  node scrape-images.js "<keyword>" [options]

Options:
  -n, --limit <n>        Max images to download            (default 20)
  -o, --out <dir>        Output directory                  (default ./scraped-images/<keyword>)
  -s, --source <list>    commons,openverse,page or all     (default commons,openverse)
  -u, --page <url>       Scrape images off this page (repeatable; implies source "page")
      --match <mode>     Page mode keyword test: any|all|none (default any)
      --min-width <px>   Skip images narrower than this    (default 200)
      --min-height <px>  Skip images shorter than this     (default 0)
      --max-bytes <n>    Skip files larger than this       (default 26214400 = 25 MB)
      --ext <list>       Allowed extensions                (default jpg,jpeg,png,webp,gif)
      --license <list>   Openverse license filter, e.g. cc0,by,by-sa
      --concurrency <n>  Parallel downloads                (default 3)
      --delay <ms>       Pause between requests to a host  (default 500)
      --timeout <ms>     Per-request timeout               (default 30000)
      --dry-run          List what would be downloaded, save nothing
      --no-manifest      Do not write manifest.json
      --ignore-robots    Page mode only: skip the robots.txt check
                         (use only on sites you own or have permission to crawl)
      --user-agent <s>   Override the User-Agent header
  -q, --quiet            Only print errors and the summary
  -h, --help             Show this help

Examples:
  node scrape-images.js "1909 VDB Lincoln cent" -n 30
  node scrape-images.js "morgan silver dollar" --source openverse --license cc0,by
  node scrape-images.js "seated liberty" --page https://example.com/lot/1234 --match any
  node scrape-images.js "greek tetradrachm" --dry-run
`;

function parseArgs(argv) {
  const opts = {
    keyword: null,
    limit: 20,
    out: null,
    sources: null,
    pages: [],
    match: 'any',
    minWidth: 200,
    minHeight: 0,
    maxBytes: 25 * 1024 * 1024,
    ext: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    license: null,
    concurrency: 3,
    delay: 500,
    timeout: 30000,
    dryRun: false,
    manifest: true,
    ignoreRobots: false,
    userAgent: DEFAULT_UA,
    quiet: false,
    help: false,
  };

  const need = (i, flag) => {
    if (i + 1 >= argv.length) fail(`Option ${flag} needs a value.`);
    return argv[i + 1];
  };
  const int = (v, flag) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) fail(`Option ${flag} needs a non-negative number, got "${v}".`);
    return Math.floor(n);
  };
  const list = (v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '-q': case '--quiet': opts.quiet = true; break;
      case '-n': case '--limit': opts.limit = int(need(i, a), a); i++; break;
      case '-o': case '--out': opts.out = need(i, a); i++; break;
      case '-s': case '--source': case '--sources': opts.sources = list(need(i, a)); i++; break;
      case '-u': case '--page': case '--url': opts.pages.push(need(i, a)); i++; break;
      case '--match': opts.match = need(i, a).toLowerCase(); i++; break;
      case '--min-width': opts.minWidth = int(need(i, a), a); i++; break;
      case '--min-height': opts.minHeight = int(need(i, a), a); i++; break;
      case '--max-bytes': opts.maxBytes = int(need(i, a), a); i++; break;
      case '--ext': opts.ext = list(need(i, a)).map((e) => e.replace(/^\./, '')); i++; break;
      case '--license': opts.license = list(need(i, a)); i++; break;
      case '--concurrency': opts.concurrency = Math.max(1, int(need(i, a), a)); i++; break;
      case '--delay': opts.delay = int(need(i, a), a); i++; break;
      case '--timeout': opts.timeout = int(need(i, a), a); i++; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--manifest': opts.manifest = true; break;
      case '--no-manifest': opts.manifest = false; break;
      case '--ignore-robots': opts.ignoreRobots = true; break;
      case '--user-agent': opts.userAgent = need(i, a); i++; break;
      default:
        if (a.startsWith('-')) fail(`Unknown option "${a}". Run with --help.`);
        else if (opts.keyword === null) opts.keyword = a;
        else opts.keyword += ' ' + a;
    }
  }

  if (opts.help) return opts;
  if (!opts.keyword) fail('Missing keyword. Example: node scrape-images.js "1909 VDB Lincoln cent"');
  if (!['any', 'all', 'none'].includes(opts.match)) fail('--match must be any, all or none.');

  if (!opts.sources) opts.sources = opts.pages.length ? ['page'] : ['commons', 'openverse'];
  if (opts.sources.includes('all')) opts.sources = ['commons', 'openverse', 'page'];
  const known = ['commons', 'openverse', 'page'];
  for (const s of opts.sources) if (!known.includes(s)) fail(`Unknown source "${s}". Pick from: ${known.join(', ')}.`);
  if (opts.sources.includes('page') && !opts.pages.length) fail('Source "page" needs at least one --page <url>.');
  if (opts.pages.length && !opts.sources.includes('page')) opts.sources.push('page');
  if (!opts.out) opts.out = path.join('scraped-images', slug(opts.keyword) || 'images');

  return opts;
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/' };

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTITIES, key)) return ENTITIES[key];
    if (key[0] === '#') {
      const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code < 0x110000) return String.fromCodePoint(code);
    }
    return whole;
  });
}

function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extOf(url) {
  try {
    const p = new URL(url).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(p);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

/** Per-host politeness: never hammer one host faster than `delay`. */
const lastHit = new Map();
async function throttle(url, delay) {
  if (!delay) return;
  let host;
  try { host = new URL(url).host; } catch { return; }
  const prev = lastHit.get(host) || 0;
  const wait = prev + delay - Date.now();
  lastHit.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
}

async function request(url, opts, init = {}) {
  await throttle(url, opts.delay);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout);
  try {
    return await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': opts.userAgent, accept: '*/*', ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with retry + exponential backoff on network errors / 5xx / 429. */
async function requestRetry(url, opts, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request(url, opts, init);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (i < attempts - 1) { await sleep(1000 * 2 ** i); continue; }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 * Source: Wikimedia Commons
 * ------------------------------------------------------------------ */

async function searchCommons(keyword, want, opts, log) {
  const found = [];
  let offset = 0;

  while (found.length < want) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrsearch: `${keyword} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: String(Math.min(50, want - found.length + 10)),
      gsroffset: String(offset),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
    });
    const url = `https://commons.wikimedia.org/w/api.php?${params}`;

    const res = await requestRetry(url, opts);
    if (!res.ok) { log(`  commons: search failed (HTTP ${res.status})`); break; }

    const body = await res.json();
    if (body.error) { log(`  commons: ${body.error.info || body.error.code}`); break; }

    const pages = body?.query?.pages || [];
    for (const page of pages) {
      const info = page.imageinfo && page.imageinfo[0];
      if (!info || !info.url) continue;
      const meta = info.extmetadata || {};
      found.push({
        source: 'commons',
        url: info.url.split('?')[0],
        title: page.title ? page.title.replace(/^File:/, '') : '',
        width: info.width || 0,
        height: info.height || 0,
        mime: info.mime || '',
        creator: stripHtml(meta.Artist && meta.Artist.value),
        license: stripHtml(meta.LicenseShortName && meta.LicenseShortName.value),
        licenseUrl: stripHtml(meta.LicenseUrl && meta.LicenseUrl.value),
        pageUrl: info.descriptionurl || '',
      });
    }

    if (!body.continue || !pages.length) break;
    offset = Number(body.continue.gsroffset) || offset + pages.length;
  }

  log(`  commons: ${found.length} candidate(s)`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Source: Openverse
 * ------------------------------------------------------------------ */

async function searchOpenverse(keyword, want, opts, log) {
  const found = [];
  let page = 1;

  while (found.length < want && page <= 10) {
    const params = new URLSearchParams({
      q: keyword,
      page_size: String(Math.min(50, Math.max(10, want - found.length))),
      page: String(page),
    });
    if (opts.license) params.set('license', opts.license.join(','));
    const url = `https://api.openverse.org/v1/images/?${params}`;

    const res = await requestRetry(url, opts);
    if (!res.ok) {
      log(`  openverse: search failed (HTTP ${res.status}${res.status === 429 ? ' — anonymous rate limit' : ''})`);
      break;
    }

    const body = await res.json();
    const results = body.results || [];
    for (const r of results) {
      if (!r.url) continue;
      found.push({
        source: 'openverse',
        url: r.url,
        title: r.title || '',
        width: r.width || 0,
        height: r.height || 0,
        mime: r.filetype ? `image/${r.filetype}` : '',
        creator: r.creator || '',
        license: [r.license, r.license_version].filter(Boolean).join(' ').toUpperCase(),
        licenseUrl: r.license_url || '',
        pageUrl: r.foreign_landing_url || '',
      });
    }

    if (!results.length || page >= (body.page_count || 1)) break;
    page++;
  }

  log(`  openverse: ${found.length} candidate(s)`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Source: arbitrary page
 * ------------------------------------------------------------------ */

const robotsCache = new Map();

async function robotsAllows(target, opts) {
  let u;
  try { u = new URL(target); } catch { return false; }
  const key = u.origin;

  if (!robotsCache.has(key)) {
    let rules = [];
    try {
      const res = await request(`${u.origin}/robots.txt`, opts);
      if (res.ok) rules = parseRobots(await res.text(), opts.userAgent);
    } catch { /* no robots.txt reachable -> treat as allowed */ }
    robotsCache.set(key, rules);
  }

  const rules = robotsCache.get(key);
  const pathname = u.pathname + u.search;
  let verdict = true;
  let bestLen = -1;
  for (const rule of rules) {
    if (rule.path && pathname.startsWith(rule.path) && rule.path.length > bestLen) {
      bestLen = rule.path.length;
      verdict = rule.allow;
    }
  }
  return verdict;
}

function parseRobots(text, userAgent) {
  const uaToken = userAgent.split('/')[0].toLowerCase();
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || current.closed) { current = { agents: [], rules: [], closed: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) continue;
      current.closed = true;
      if (value) current.rules.push({ path: value.split('*')[0], allow: field === 'allow' });
      else if (field === 'disallow') current.rules.push({ path: '', allow: true });
    }
  }

  const exact = groups.find((g) => g.agents.some((a) => a !== '*' && uaToken.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  return (exact || star || { rules: [] }).rules;
}

function extractImages(html, baseUrl) {
  const out = new Map();
  const add = (raw, alt = '', title = '') => {
    if (!raw) return;
    const candidate = decodeEntities(String(raw).trim()).split(/\s+/)[0];
    if (!candidate || candidate.startsWith('data:')) return;
    let abs;
    try { abs = new URL(candidate, baseUrl).toString(); } catch { return; }
    if (!/^https?:/.test(abs)) return;
    const prev = out.get(abs);
    out.set(abs, { url: abs, alt: (prev && prev.alt) || alt, title: (prev && prev.title) || title });
  };

  // Widest entry of a srcset, or '' when there is nothing usable.
  const widestOf = (srcset) => {
    if (!srcset) return '';
    const best = decodeEntities(srcset)
      .split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [u, d] = part.split(/\s+/);
        return { u, w: d && d.endsWith('w') ? parseInt(d, 10) : 0 };
      })
      .filter((c) => c.u)
      .sort((a, b) => b.w - a.w)[0];
    return best ? best.u : '';
  };

  // <img>: take ONE url per tag so responsive variants of the same picture
  // do not each land in the output as a near-duplicate.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name) => {
      const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
      const hit = re.exec(tag);
      return hit ? (hit[2] ?? hit[3] ?? hit[4] ?? '') : '';
    };
    const alt = decodeEntities(attr('alt'));
    const title = decodeEntities(attr('title'));
    const best =
      widestOf(attr('srcset') || attr('data-srcset')) ||
      attr('data-src') ||          // lazy-loaded originals beat placeholder src attributes
      attr('data-original') ||
      attr('src');
    add(best, alt, title);
  }

  // <source srcset=...> inside <picture>
  for (const m of html.matchAll(/<source\b[^>]*srcset\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    add(widestOf(m[2] ?? m[3] ?? ''));
  }

  // <meta property="og:image" content=...> and twitter:image
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(og:image|twitter:image)/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (c) add(c[2] ?? c[3] ?? c[4] ?? '', 'og:image');
  }

  return [...out.values()];
}

function keywordMatches(text, tokens, mode) {
  if (mode === 'none') return true;
  const hay = text.toLowerCase();
  if (mode === 'all') return tokens.every((t) => hay.includes(t));
  return tokens.some((t) => hay.includes(t));
}

async function searchPages(keyword, opts, log) {
  const tokens = keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const found = [];

  for (const pageUrl of opts.pages) {
    if (!opts.ignoreRobots && !(await robotsAllows(pageUrl, opts))) {
      log(`  page: robots.txt disallows ${pageUrl} — skipped (use --ignore-robots if you own the site)`);
      continue;
    }

    let res;
    try {
      res = await requestRetry(pageUrl, opts, { headers: { accept: 'text/html,application/xhtml+xml' } });
    } catch (err) {
      log(`  page: ${pageUrl} failed (${err.message})`);
      continue;
    }
    if (!res.ok) { log(`  page: ${pageUrl} returned HTTP ${res.status}`); continue; }

    const html = await res.text();
    const finalUrl = res.url || pageUrl;
    const images = extractImages(html, finalUrl);
    let kept = 0;

    for (const img of images) {
      const haystack = `${img.alt} ${img.title} ${decodeURIComponent(img.url)}`;
      if (!keywordMatches(haystack, tokens, opts.match)) continue;
      kept++;
      found.push({
        source: 'page',
        url: img.url,
        title: img.alt || img.title || '',
        width: 0,
        height: 0,
        mime: '',
        creator: '',
        license: '',
        licenseUrl: '',
        pageUrl: finalUrl,
      });
    }
    log(`  page: ${kept}/${images.length} image(s) matched on ${finalUrl}`);
  }

  return found;
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

const MAGIC = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.slice(0, 3).toString('latin1') === 'GIF' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'bmp', mime: 'image/bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
  { ext: 'tif', mime: 'image/tiff', test: (b) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00) },
];

function sniff(buf) {
  for (const m of MAGIC) if (buf.length >= 12 && m.test(buf)) return m;
  return null;
}

/** JPEG/PNG/GIF/WEBP dimensions straight from the header bytes. */
function dimensions(buf, ext) {
  try {
    if (ext === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (ext === 'gif') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (ext === 'webp') {
      const fmt = buf.slice(12, 16).toString('latin1');
      if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (fmt === 'VP8X') return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    }
    if (ext === 'jpg') {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
  } catch { /* header shorter than expected */ }
  return { width: 0, height: 0 };
}

async function readCapped(res, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`exceeds --max-bytes (${maxBytes})`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function download(item, index, opts, state, log) {
  const res = await requestRetry(item.url, opts, { headers: { accept: 'image/*,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > opts.maxBytes) throw new Error(`exceeds --max-bytes (${declared} bytes)`);

  const buf = await readCapped(res, opts.maxBytes);
  const kind = sniff(buf);
  if (!kind) throw new Error('not an image (unrecognised file header)');

  const ext = kind.ext === 'jpg' && opts.ext.includes('jpeg') && !opts.ext.includes('jpg') ? 'jpeg' : kind.ext;
  if (!opts.ext.includes(ext) && !(ext === 'jpg' && opts.ext.includes('jpeg'))) {
    throw new Error(`extension .${ext} not in --ext`);
  }

  const dim = dimensions(buf, kind.ext);
  const width = dim.width || item.width;
  const height = dim.height || item.height;
  if (opts.minWidth && width && width < opts.minWidth) throw new Error(`width ${width}px < --min-width`);
  if (opts.minHeight && height && height < opts.minHeight) throw new Error(`height ${height}px < --min-height`);

  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (state.hashes.has(hash)) throw new Error('duplicate of an image already saved');
  state.hashes.add(hash);

  let rawName = item.title;
  if (!rawName) {
    rawName = path.basename(new URL(item.url).pathname);
    try { rawName = decodeURIComponent(rawName); } catch { /* keep the raw basename */ }
  }
  const base = slug(rawName.replace(/\.(jpe?g|png|gif|webp|bmp|tiff?|svg)$/i, '')) || 'image';
  const name = `${String(index).padStart(3, '0')}-${base}.${ext}`;
  const dest = path.join(opts.out, name);
  fs.writeFileSync(dest, buf);

  return {
    file: name,
    bytes: buf.length,
    width,
    height,
    sha256: hash,
    mime: kind.mime,
    source: item.source,
    sourceUrl: item.url,
    pageUrl: item.pageUrl,
    title: item.title,
    creator: item.creator,
    license: item.license,
    licenseUrl: item.licenseUrl,
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return 0; }

  const log = opts.quiet ? () => {} : (m) => process.stdout.write(`${m}\n`);
  const say = (m) => process.stdout.write(`${m}\n`);

  log(`keyword : ${opts.keyword}`);
  log(`sources : ${opts.sources.join(', ')}`);
  log(`output  : ${opts.out}${opts.dryRun ? ' (dry run — nothing will be written)' : ''}`);
  log('searching...');

  // Ask each source for more than we need: some candidates get filtered out.
  const overshoot = Math.max(opts.limit * 3, opts.limit + 10);
  let candidates = [];
  for (const source of opts.sources) {
    try {
      if (source === 'commons') candidates.push(...await searchCommons(opts.keyword, overshoot, opts, log));
      else if (source === 'openverse') candidates.push(...await searchOpenverse(opts.keyword, overshoot, opts, log));
      else if (source === 'page') candidates.push(...await searchPages(opts.keyword, opts, log));
    } catch (err) {
      log(`  ${source}: ${err.message}`);
    }
  }

  // Dedupe by URL, and drop obvious non-images / known-too-small results early.
  const seenUrls = new Set();
  candidates = candidates.filter((c) => {
    if (seenUrls.has(c.url)) return false;
    seenUrls.add(c.url);
    const e = extOf(c.url);
    if (e && !opts.ext.includes(e) && !(e === 'jpg' && opts.ext.includes('jpeg')) && !(e === 'jpeg' && opts.ext.includes('jpg'))) return false;
    if (opts.minWidth && c.width && c.width < opts.minWidth) return false;
    if (opts.minHeight && c.height && c.height < opts.minHeight) return false;
    return true;
  });

  log(`found ${candidates.length} candidate image(s)`);
  if (!candidates.length) { say('Nothing to download.'); return 1; }

  if (opts.dryRun) {
    candidates.slice(0, opts.limit).forEach((c, i) => {
      const size = c.width && c.height ? ` [${c.width}x${c.height}]` : '';
      say(`${String(i + 1).padStart(3)}. ${c.url}${size}${c.license ? ` (${c.license})` : ''}`);
    });
    say(`\nDry run: ${Math.min(opts.limit, candidates.length)} image(s) would be downloaded to ${opts.out}`);
    return 0;
  }

  fs.mkdirSync(opts.out, { recursive: true });

  const state = { hashes: new Set() };
  const saved = [];
  const failures = [];
  let cursor = 0;
  let counter = 0;

  const worker = async () => {
    while (saved.length < opts.limit) {
      const i = cursor++;
      if (i >= candidates.length) return;
      const item = candidates[i];
      try {
        const rec = await download(item, ++counter, opts, state, log);
        if (saved.length >= opts.limit) { fs.unlinkSync(path.join(opts.out, rec.file)); return; }
        saved.push(rec);
        log(`  [${saved.length}/${opts.limit}] ${rec.file} (${rec.width}x${rec.height}, ${(rec.bytes / 1024).toFixed(0)} KB)`);
      } catch (err) {
        failures.push({ url: item.url, reason: err.message });
      }
    }
  };

  log('downloading...');
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, candidates.length) }, worker));

  if (opts.manifest && saved.length) {
    const manifest = {
      keyword: opts.keyword,
      scrapedAt: new Date().toISOString(),
      sources: opts.sources,
      count: saved.length,
      images: saved,
    };
    fs.writeFileSync(path.join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }

  say(`\nSaved ${saved.length} image(s) to ${path.resolve(opts.out)}`);
  if (failures.length && !opts.quiet) {
    say(`Skipped ${failures.length}:`);
    for (const f of failures.slice(0, 10)) say(`  - ${f.reason}: ${f.url}`);
    if (failures.length > 10) say(`  ...and ${failures.length - 10} more`);
  }
  if (saved.length) {
    say('Check each image\'s license in manifest.json before reusing it publicly.');
  }
  return saved.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => { process.stderr.write(`error: ${err && err.stack ? err.stack : err}\n`); process.exit(1); },
);
