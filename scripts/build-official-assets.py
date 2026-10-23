#!/usr/bin/env python3
"""Builds web-sized copies of the official artwork.

Source of truth: assets/official/*.png (original files, never modified).
Output: apps/web/public/assets/official/*.png — resized only (Lanczos), padded
to a square transparent canvas so icons line up. Images are never upscaled.

Usage: python3 scripts/build-official-assets.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "official"
OUT = ROOT / "apps" / "web" / "public" / "assets" / "official"
MAX_SIDE = 256

OUT.mkdir(parents=True, exist_ok=True)
for src in sorted(SRC.glob("*.png")):
    img = Image.open(src).convert("RGBA")
    scale = min(1.0, MAX_SIDE / max(img.size))
    if scale < 1.0:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    dst = OUT / src.name
    canvas.save(dst, optimize=True)
    print(f"{src.name}: {Image.open(src).size} -> {canvas.size}, {dst.stat().st_size // 1024} KB")
