#!/usr/bin/env python3
"""
Gundersen app-icon generator — the shared "gold-framed dark tile" style.

Produces a consistent icon set (dark #0a0a0a tile + metallic gold border +
centered mark) so every app on the home screen — Alfred, CMS, Consultant,
Legal, Laundroweb — reads as one family.

USAGE
    pip install Pillow numpy
    python3 make_icon.py --art path/to/logo.png --out public/icons

    # If your logo art has the mark sitting inside a larger image (wordmark,
    # background, etc.), pass the pixel box of JUST the mark to isolate it:
    python3 make_icon.py --art art.png --crop 219,169,706,459 --out public/icons

OUTPUT (into --out, plus favicons into --out/..)
    apple-touch-icon.png   180x180   (iOS home screen — the important one)
    icon-192.png           192x192   (PWA / Android, maskable-safe center)
    icon-512.png           512x512   (PWA / Android)
    icon-tile-512.png      512x512   (bordered tile, for previews)
    favicon.ico            16/32/48  (browser tab)
    favicon-16.png / -32.png

THE LOCKED BRAND CONSTANTS (do not change — this is what keeps them matched):
    Background      #0a0a0a
    Gold gradient   #F2DD92 (top) -> #C9A04C (mid) -> #865F22 (bottom)
    Border weight   3.0% of icon side
    Border inset    1.2% of icon side  (flush to edge, no dark gap)
    Corner radius   22.5% of icon side (matches the iOS squircle)
    Mark coverage   78% of icon width  (tune per art so it reads well)
    Supersample     3x then downscale  (clean anti-aliased edges)

Only --coverage should normally be adjusted per app, so a wide mark and a
tall mark both look balanced. Everything else stays fixed.
"""
import argparse
from PIL import Image, ImageDraw, ImageFilter, ImageChops

# ---- Locked brand constants -------------------------------------------------
BG = (10, 10, 10)                       # #0a0a0a
GOLD_TOP = (0xF2, 0xDD, 0x92)
GOLD_MID = (0xC9, 0xA0, 0x4C)
GOLD_BOT = (0x86, 0x5F, 0x22)
BORDER_F = 0.030                        # line weight  (3.0%)
INSET_F = 0.012                         # flush to edge (1.2%)
RADIUS_F = 0.225                        # iOS squircle (22.5%)
FEATHER_F = 0.053                       # mark edge feather, fraction of mark w


def load_mark(art_path, crop):
    """Return an RGBA mark, feathered so it melts onto the dark tile."""
    im = Image.open(art_path).convert("RGB")
    if crop:
        l, t, r, b = crop
        im = im.crop((l, t, r, b))
    mark = im.convert("RGBA")
    w, h = mark.size
    f = max(4, int(w * FEATHER_F))
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rectangle([f, f, w - f, h - f], fill=255)
    mark.putalpha(m.filter(ImageFilter.GaussianBlur(f / 2)))
    return mark


def gold_gradient(size):
    g = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(g)
    lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    for y in range(size):
        t = y / size
        c = lerp(GOLD_TOP, GOLD_MID, t / 0.5) if t < 0.5 else lerp(GOLD_MID, GOLD_BOT, (t - 0.5) / 0.5)
        d.line([(0, y), (size, y)], fill=c)
    return g


def bordered(mark, side, coverage, border=True):
    """Render the dark tile + centered mark (+ gold border) at `side` px."""
    S = side * 3  # supersample
    canvas = Image.new("RGBA", (S, S), BG + (255,))
    mw, mh = mark.size
    tw = int(S * coverage)
    e = mark.resize((tw, max(1, int(mh * tw / mw))), Image.LANCZOS)
    canvas.alpha_composite(e, ((S - e.width) // 2, (S - e.height) // 2))

    if border:
        inset = int(S * INSET_F)
        bw = int(S * BORDER_F)
        radius = int(S * RADIUS_F)
        outer = Image.new("L", (S, S), 0)
        ImageDraw.Draw(outer).rounded_rectangle(
            [inset, inset, S - 1 - inset, S - 1 - inset], radius=radius, fill=255)
        inner = Image.new("L", (S, S), 0)
        ImageDraw.Draw(inner).rounded_rectangle(
            [inset + bw, inset + bw, S - 1 - inset - bw, S - 1 - inset - bw],
            radius=max(1, radius - bw), fill=255)
        ring = ImageChops.subtract(outer, inner)
        grad = gold_gradient(S).convert("RGBA")
        grad.putalpha(ring)
        glow = gold_gradient(S).convert("RGBA")
        glow.putalpha(ring.filter(ImageFilter.GaussianBlur(S * 0.006)))
        canvas.alpha_composite(glow)
        canvas.alpha_composite(grad)

    return canvas.resize((side, side), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--art", required=True, help="Path to the app's logo/mark image")
    ap.add_argument("--crop", help="L,T,R,B pixel box isolating the mark (optional)")
    ap.add_argument("--out", default="public/icons", help="Output dir for the icons")
    ap.add_argument("--coverage", type=float, default=0.78,
                    help="Mark size as fraction of icon width (default 0.78)")
    args = ap.parse_args()

    import os
    crop = tuple(int(x) for x in args.crop.split(",")) if args.crop else None
    mark = load_mark(args.art, crop)
    out = args.out.rstrip("/")
    parent = os.path.dirname(out) or "."
    os.makedirs(out, exist_ok=True)

    # Home-screen / bordered icons
    bordered(mark, 180, args.coverage).convert("RGB").save(f"{out}/apple-touch-icon.png")
    bordered(mark, 512, args.coverage).convert("RGB").save(f"{out}/icon-tile-512.png")
    # PWA icons: no border so Android's maskable crop can't shave the frame;
    # slightly smaller mark to stay in the maskable safe zone.
    bordered(mark, 512, min(args.coverage, 0.74), border=False).save(f"{out}/icon-512.png")
    bordered(mark, 192, min(args.coverage, 0.74), border=False).save(f"{out}/icon-192.png")

    # Favicons (bare mark, filling the frame for legibility at tiny sizes)
    fav = bordered(mark, 96, 0.92, border=False).convert("RGB")
    fav.resize((32, 32), Image.LANCZOS).save(f"{parent}/favicon-32.png")
    fav.resize((16, 16), Image.LANCZOS).save(f"{parent}/favicon-16.png")
    fav.save(f"{parent}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    print("wrote:")
    for f in ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-tile-512.png"]:
        print(f"  {out}/{f}")
    for f in ["favicon.ico", "favicon-32.png", "favicon-16.png"]:
        print(f"  {parent}/{f}")


if __name__ == "__main__":
    main()
