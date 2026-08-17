#!/usr/bin/env python3
"""Derive Ridr icon/asset PNGs from the design-handoff source logo.

Rebrand: BasisRide (crimson) -> Ridr (teal/orange).

Source: ~/Downloads/design_handoff_ridr_app/assets/logo.jpg
  Flat-design teal/orange car icon centered on a near-white background,
  1024x559, RGB (no alpha). The car glyph has a light-gray gradient
  "windshield" detail that must be preserved (not treated as background).

Pipeline:
  1. Load source, inspect pixel values to pick a background threshold
     (done empirically -- see notes below).
  2. Auto-detect the glyph bounding box via thresholding.
  3. Crop + pad to a square "master" canvas with margin.
  4. Matte near-white background to transparent (soft-edged ramp to avoid
     jaggies), producing a transparent-background RGBA master.
  5. Compose each target asset from that master.

Threshold notes (measured with Pillow/numpy against the actual source):
  - True background pixels sit at RGB >= ~246 (corners: (254,254,254),
    (250,250,250), (246,246,246); flat white field: (255,255,255)).
  - The gray windshield detail inside the glyph sits at RGB ~ (186..221),
    comfortably below the background band.
  - The glyph edge has ~2px of JPEG/anti-alias transition pixels between
    255 and the solid glyph color (e.g. 254,252,222,73 at x=434..438 on a
    scanline through the glyph).
  - A background threshold of 244 produces a clean glyph bounding box with
    zero stray far-field noise pixels (checked across 235/240/244/248 --
    248 starts picking up isolated JPEG noise near the far edges of the
    canvas, 244 does not).
  So: alpha ramps from fully transparent at RGB>=246 down to fully opaque
  at RGB<=236, linearly in between. This keeps the windshield (~186-221)
  fully opaque while cleanly clearing the white field and softening the
  glyph's outer edge.
"""

import os
import numpy as np
from PIL import Image

REPO = "/Users/vidhaan/Developer/BasisRide"
SRC = os.path.expanduser("~/Downloads/design_handoff_ridr_app/assets/logo.jpg")
ASSETS = os.path.join(REPO, "assets")

BRAND_TEAL_LIGHT = (0xE6, 0xF5, 0xF5)  # #E6F5F5
MONO_COLOR = (0x00, 0x00, 0x00)  # #000000, alpha-only silhouette

# Background matting thresholds (see module docstring).
BG_TRANSPARENT_AT = 246  # RGB >= this -> alpha 0
BG_OPAQUE_AT = 236  # RGB <= this -> alpha 255 (unchanged)


def load_master():
    """Build the transparent-background square master from the source jpg."""
    im = Image.open(SRC).convert("RGB")
    arr = np.array(im).astype(np.int32)
    h, w, _ = arr.shape

    # --- bbox detection: threshold near-white background pixels ---
    is_bg = np.all(arr >= 244, axis=2)
    is_fg = ~is_bg
    ys, xs = np.where(is_fg)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    print(f"detected glyph bbox: ({x0}, {y0}) - ({x1}, {y1})")

    # --- crop to bbox ---
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))
    cw, ch = crop.size

    # --- pad to square with ~8% margin on the longer side ---
    longer = max(cw, ch)
    margin = int(round(longer * 0.08))
    canvas_size = longer + margin * 2

    square = Image.new("RGB", (canvas_size, canvas_size), (255, 255, 255))
    paste_x = (canvas_size - cw) // 2
    paste_y = (canvas_size - ch) // 2
    square.paste(crop, (paste_x, paste_y))

    # --- matte near-white background to transparent ---
    sq_arr = np.array(square).astype(np.int32)
    minc = sq_arr.min(axis=2)  # conservative: darkest channel per pixel

    alpha = np.zeros(minc.shape, dtype=np.float32)
    # fully opaque where minc <= BG_OPAQUE_AT
    # fully transparent where minc >= BG_TRANSPARENT_AT
    # linear ramp in between
    opaque_mask = minc <= BG_OPAQUE_AT
    transparent_mask = minc >= BG_TRANSPARENT_AT
    ramp_mask = ~opaque_mask & ~transparent_mask

    alpha[opaque_mask] = 255
    alpha[transparent_mask] = 0
    span = float(BG_TRANSPARENT_AT - BG_OPAQUE_AT)
    ramp_frac = (BG_TRANSPARENT_AT - minc[ramp_mask]) / span
    alpha[ramp_mask] = np.clip(ramp_frac, 0, 1) * 255

    rgba = np.dstack([sq_arr.astype(np.uint8), alpha.astype(np.uint8)])
    master = Image.fromarray(rgba, mode="RGBA")
    return master


def matte_onto(master_rgba, size, fill_rgb, glyph_fill_frac):
    """Resize the glyph (preserving aspect, alpha) to occupy `glyph_fill_frac`
    of `size`, center it, and matte onto an opaque `fill_rgb` background."""
    bg = Image.new("RGBA", (size, size), fill_rgb + (255,))
    glyph_size = int(round(size * glyph_fill_frac))
    glyph = master_rgba.resize((glyph_size, glyph_size), Image.LANCZOS)
    off = (size - glyph_size) // 2
    bg.alpha_composite(glyph, (off, off))
    return bg.convert("RGB")


def transparent_canvas(master_rgba, size, glyph_fill_frac):
    """Place the glyph on a fully transparent canvas, centered, at the given
    fill fraction of the canvas size."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glyph_size = int(round(size * glyph_fill_frac))
    glyph = master_rgba.resize((glyph_size, glyph_size), Image.LANCZOS)
    off = (size - glyph_size) // 2
    canvas.alpha_composite(glyph, (off, off))
    return canvas


def to_monochrome(rgba_canvas, color_rgb):
    """Recolor to a single flat color, preserving only the alpha silhouette."""
    arr = np.array(rgba_canvas)
    alpha = arr[:, :, 3]
    out = np.zeros_like(arr)
    out[:, :, 0] = color_rgb[0]
    out[:, :, 1] = color_rgb[1]
    out[:, :, 2] = color_rgb[2]
    out[:, :, 3] = alpha
    return Image.fromarray(out, mode="RGBA")


def main():
    master = load_master()
    mw, mh = master.size
    print(f"master square size: {mw}x{mh}")

    # sanity checks on the matting
    cx, cy = mw // 2, mh // 2
    print("center (windshield-ish) pixel:", master.getpixel((cx, cy)))
    print("corner (margin) pixel:", master.getpixel((2, 2)))

    # --- icon.png: 1024x1024, teal-light bg, ~70% fill ---
    icon = matte_onto(master, 1024, BRAND_TEAL_LIGHT, 0.70)
    icon.save(os.path.join(ASSETS, "icon.png"))

    # --- favicon.png: same composition, downsampled to existing size (48x48) ---
    favicon_size = 48
    favicon = icon.resize((favicon_size, favicon_size), Image.LANCZOS)
    favicon.save(os.path.join(ASSETS, "favicon.png"))

    # --- splash-icon.png: identical composition to icon.png ---
    splash = matte_onto(master, 1024, BRAND_TEAL_LIGHT, 0.70)
    splash.save(os.path.join(ASSETS, "splash-icon.png"))

    # --- android-icon-foreground.png: 512x512, transparent bg, glyph in center ~66% ---
    fg = transparent_canvas(master, 512, 0.66)
    fg.save(os.path.join(ASSETS, "android-icon-foreground.png"))

    # --- android-icon-background.png: 512x512, flat opaque teal-light, no glyph ---
    bg = Image.new("RGB", (512, 512), BRAND_TEAL_LIGHT)
    bg.save(os.path.join(ASSETS, "android-icon-background.png"))

    # --- android-icon-monochrome.png: 432x432, same safe-zone framing, alpha-only silhouette ---
    mono_canvas = transparent_canvas(master, 432, 0.66)
    mono = to_monochrome(mono_canvas, MONO_COLOR)
    mono.save(os.path.join(ASSETS, "android-icon-monochrome.png"))

    # --- logo-mark.png: 512x512, transparent bg, general in-app use, light padding ---
    logo_mark = transparent_canvas(master, 512, 0.88)
    logo_mark.save(os.path.join(ASSETS, "logo-mark.png"))

    print("done")


if __name__ == "__main__":
    main()
