"""Generate ASTERGRID brand assets from the supplied source artwork.

The original JPEG is never modified. The generated hero and radar mark are
committed so the frontend does not need Pillow at runtime.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Astergrid.jpeg"
PUBLIC = ROOT / "frontend" / "public" / "brand"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"source artwork not found: {SOURCE}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    image = Image.open(SOURCE).convert("RGB")
    width, height = image.size

    # Full-bleed hero. Keep the original aspect ratio and use a quality that
    # stays below a few hundred kilobytes for a fast first paint.
    hero = image.copy()
    hero.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
    hero.save(PUBLIC / "astergrid-hero.jpg", "JPEG", quality=88, optimize=True)

    # The orange radar sweep is the visual signature of the supplied artwork.
    # Crop a square around it, then apply a circular alpha mask for the compact
    # brand mark used in the top bar and favicon.
    center_x = int(width * 0.508)
    center_y = int(height * 0.368)
    radius = int(min(width, height) * 0.105)
    box = (
        center_x - radius,
        center_y - radius,
        center_x + radius,
        center_y + radius,
    )
    mark = image.crop(box).resize((512, 512), Image.Resampling.LANCZOS)
    mask = Image.new("L", (512, 512), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((8, 8, 504, 504), fill=255)
    mark = mark.convert("RGBA")
    mark.putalpha(mask)
    mark.save(PUBLIC / "astergrid-mark.png", "PNG", optimize=True)

    for size, name in ((64, "astergrid-mark-64.png"), (32, "favicon-32.png")):
        mark.resize((size, size), Image.Resampling.LANCZOS).save(
            PUBLIC / name, "PNG", optimize=True
        )

    # A tiny favicon.ico keeps browser tabs legible on Windows.
    mark.resize((64, 64), Image.Resampling.LANCZOS).save(
        ROOT / "frontend" / "public" / "favicon.ico", sizes=[(32, 32), (64, 64)]
    )

    print(f"source: {SOURCE} ({width}x{height})")
    print(f"hero:   {PUBLIC / 'astergrid-hero.jpg'}")
    print(f"mark:   {PUBLIC / 'astergrid-mark.png'}")
    print(f"favicon: {ROOT / 'frontend' / 'public' / 'favicon.ico'}")


if __name__ == "__main__":
    main()
