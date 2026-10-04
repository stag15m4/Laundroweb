# Gundersen App-Icon Template

One look for every app on the home screen — **Alfred, CMS, Consultant, Legal,
Laundroweb** — so they read as a matched set: a near-black tile with a thin
**metallic gold border** and the app's own mark centered inside.

> **Visual spec (shareable):** https://claude.ai/code/artifact/9227d065-2b55-4f0a-a1c7-f6754923adc3
> — the same recipe as a page you can hand to another session at a glance.

![reference](../../public/icons/icon-tile-512.png)

## How to generate

```bash
pip install Pillow numpy
python3 scripts/make_icon.py --art path/to/your-logo.png --out public/icons
```

If your logo art has the mark inside a larger image (a wordmark, a
background, a canvas), pass the pixel box of **just the mark** to isolate it:

```bash
python3 scripts/make_icon.py --art art.png --crop L,T,R,B --out public/icons
```

It writes `apple-touch-icon.png` (180 — the iOS home-screen icon),
`icon-192.png` / `icon-512.png` (PWA), `icon-tile-512.png` (preview), and a
favicon set (`favicon.ico`, `favicon-16.png`, `favicon-32.png`).

## The locked constants (do NOT change — this is what keeps them matched)

| Property        | Value                                        |
| --------------- | -------------------------------------------- |
| Background      | `#0a0a0a`                                     |
| Gold gradient   | `#F2DD92` → `#C9A04C` → `#865F22` (top→bottom)|
| Border weight   | **3.0%** of icon side                        |
| Border inset    | **1.2%** of icon side (flush to the edge)     |
| Corner radius   | **22.5%** of icon side (matches iOS squircle) |
| Supersample     | 3× then downscale (clean edges)              |

**The only knob you tune per app is `--coverage`** — the mark's size as a
fraction of icon width (default `0.78`). A wide mark may want `~0.74`; a
compact mark `~0.82`. Pick whatever makes the mark sit balanced inside the
gold frame. Leave everything else at the defaults.

## Wiring it into a Next.js app

`app/layout.tsx`:

```ts
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};
```

`public/manifest.json` (theme + background must be the same near-black):

```json
{
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

## Seeing the new icon on an iPhone

iOS caches home-screen icons hard. After deploying:

1. **Delete** the old icon from the home screen.
2. Open the site in Safari (if it's behind Cloudflare, **Purge Everything**).
3. **Share → Add to Home Screen** again.

Just redeploying will NOT swap an already-placed icon — the re-add is what
picks up the new art.

## Laundroweb-specific notes

- `scripts/make_icon.py` here is Alfred's canonical version, unmodified --
  keep it that way so Laundroweb stays byte-identical to the rest of the
  family's generator.
- Source art: the brand image the owner provided in chat (shield + gear +
  laurel + arrow mark). Generated with:
  ```bash
  python3 scripts/make_icon.py \
    --art e9b5511a-image.jpg --crop 245,82,613,413 --out public/icons
  ```
  `--coverage` left at the script's default (0.78) -- it already balances
  well for this mark.
- The crop box has a deliberate margin around the mark's visible edges
  (not cropped flush to the art) because this script blends via a feathered
  rectangular alpha mask at the crop's own edges, not by keying out the
  background color -- a flush crop would feather into the mark itself
  rather than into background. The source render's background luminance is
  already close to the tile's `#0a0a0a`, so the un-keyed margin inside the
  crop doesn't show as a mismatched halo.
- Favicons land in the parent of `--out` by the script's own design (so
  `--out public/icons` puts `favicon.ico`/`favicon-32.png`/`favicon-16.png`
  at the public root, and the bordered/PWA icons in `public/icons/`) --
  matches the root-level favicon paths in the wiring example above exactly;
  no manual copying needed.
- The full emblem used elsewhere on the login page (`public/logo-hero.png`)
  is a separate asset, not part of this icon system -- it isn't regenerated
  by `make_icon.py` and doesn't need to match these constants.
