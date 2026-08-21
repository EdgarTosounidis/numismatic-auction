# Image scraper

A keyword image scraper: give it words, it finds matching pictures and downloads them
with their license/attribution details.

Built for pulling reference photos for auction lots ("1909 VDB Lincoln cent",
"morgan silver dollar VAM 4"), but the keyword is free text — it works for anything.

* No dependencies to install — plain Node 18+ (uses the built-in `fetch`).
* No API keys.
* Records where every file came from and under what license, in `manifest.json`.

## Quick start

```bash
node tools/image-scraper/scrape-images.js "1909 VDB Lincoln cent"
```

That downloads up to 20 images into `scraped-images/1909-vdb-lincoln-cent/`.

Have a look before committing to a download:

```bash
node tools/image-scraper/scrape-images.js "morgan silver dollar" --dry-run
```

## Where the pictures come from

| Source | What it searches | Notes |
| --- | --- | --- |
| `commons` | Wikimedia Commons | Public-domain and Creative Commons media. Excellent coin coverage. Default. |
| `openverse` | Openverse (Flickr, museums, Smithsonian, …) | Creative Commons images. Default. Anonymous use is rate limited — if you see HTTP 429, wait a bit or drop `--source openverse`. |
| `page` | Any page URL you pass with `--page` | Grabs the images off that page and keeps the ones matching your keyword. Use for a specific auction lot, dealer listing, or your own site. |

```bash
# just one source
node tools/image-scraper/scrape-images.js "seated liberty dime" --source commons

# only images you can reuse commercially without attribution
node tools/image-scraper/scrape-images.js "gold eagle coin" --source openverse --license cc0

# pull the photos off a specific listing page
node tools/image-scraper/scrape-images.js "tetradrachm" \
  --page https://example.com/lots/1234 \
  --page https://example.com/lots/1235
```

## Options

```
-n, --limit <n>        Max images to download            (default 20)
-o, --out <dir>        Output directory                  (default ./scraped-images/<keyword>)
-s, --source <list>    commons,openverse,page or all     (default commons,openverse)
-u, --page <url>       Scrape images off this page (repeatable; implies source "page")
    --match <mode>     Page mode keyword test: any|all|none (default any)
    --min-width <px>   Skip images narrower than this    (default 200)
    --min-height <px>  Skip images shorter than this     (default 0)
    --max-bytes <n>    Skip files larger than this       (default 25 MB)
    --ext <list>       Allowed extensions                (default jpg,jpeg,png,webp,gif)
    --license <list>   Openverse license filter, e.g. cc0,by,by-sa
    --concurrency <n>  Parallel downloads                (default 3)
    --delay <ms>       Pause between requests to a host  (default 500)
    --timeout <ms>     Per-request timeout               (default 30000)
    --dry-run          List what would be downloaded, save nothing
    --no-manifest      Do not write manifest.json
    --ignore-robots    Page mode only: skip the robots.txt check
    --user-agent <s>   Override the User-Agent header
-q, --quiet            Only print errors and the summary
-h, --help             Show this help
```

`--match` controls how strict page mode is. `any` (default) keeps an image if **any**
keyword word appears in its alt text, title or filename; `all` requires every word;
`none` takes every image on the page.

## What you get

```
scraped-images/1909-vdb-lincoln-cent/
├── 001-1909-s-vdb-wheat-cent.jpg
├── 002-1909-s-vdb-lincoln-cent-obverse.jpg
└── manifest.json
```

`manifest.json` holds one record per file:

```json
{
  "file": "001-1909-s-vdb-wheat-cent.jpg",
  "bytes": 103244,
  "width": 800,
  "height": 400,
  "sha256": "e19f9596…",
  "mime": "image/jpeg",
  "source": "commons",
  "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/7/7f/1909-s-vdb-wheat-cent.jpg",
  "pageUrl": "https://commons.wikimedia.org/wiki/File:1909-s-vdb-wheat-cent.jpg",
  "title": "1909-s-vdb-wheat-cent.jpg",
  "creator": "Bobby131313",
  "license": "CC BY-SA 3.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0"
}
```

Downloads are skipped when the file is a duplicate (same SHA-256), is not really an
image, is smaller than `--min-width`/`--min-height`, or is bigger than `--max-bytes`.

## Using the images on the site

The scraper records licenses; it does not clear them for you. Before putting a scraped
photo on a lot page, check `license` in the manifest:

* **Public domain / CC0** — free to use, no strings.
* **CC BY / CC BY-SA** — usable, but you must credit the `creator` and link the license.
* **Page-mode images** have no license data at all, because an arbitrary web page does
  not publish one. Someone owns those photos — use them for internal reference, or get
  permission before republishing.

For actual auction listings, photographs of the lot itself are the safest source.

## Being a good citizen

* One request per host at a time, `--delay` (500 ms) apart, 3 downloads in parallel.
* A real, identifiable User-Agent.
* Page mode reads `robots.txt` first and skips URLs it disallows. `--ignore-robots`
  exists for sites you own or have permission to crawl — nothing else.
* Retries back off (1s, 2s, 4s) instead of hammering.

Keep `--limit` and `--delay` sane, and do not point page mode at a site whose terms
forbid it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `openverse: search failed (HTTP 429 — anonymous rate limit)` | Wait a few minutes, or run with `--source commons`. |
| `commons: You are making too many requests` | Same — Wikimedia throttles per IP. Slow down with `--delay 2000`. |
| Page mode found 0 images | The page probably renders images with JavaScript. Open the page, copy the real image URL, and use `--page` on that, or try `--match none` to see everything found. |
| Everything skipped as "width … < --min-width" | The page only had thumbnails. Lower `--min-width`. |
