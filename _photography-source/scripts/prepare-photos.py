#!/usr/bin/env python3
"""Create orientation-correct, metadata-free responsive images; never edit originals."""

import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "public" / "photos"
OUTPUT = ROOT / "public" / "optimized"
CACHE = OUTPUT / ".gallery-cache.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
WIDTHS = (600, 1200, 2000)
VERSION = 1


def slug(value):
    import re
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "photo"


def srgb_image(image):
    """Honor embedded input color profiles, then strip all output metadata."""
    profile = image.info.get("icc_profile")
    if profile:
        try:
            import io
            image = ImageCms.profileToProfile(
                image,
                ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                ImageCms.createProfile("sRGB"),
                outputMode="RGBA" if "A" in image.getbands() else "RGB",
            )
        except (OSError, ValueError, ImageCms.PyCMSError):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    else:
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    return image


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    try:
        previous = json.loads(CACHE.read_text())
    except (OSError, ValueError):
        previous = {"version": VERSION, "photos": {}}
    cached = previous.get("photos", {}) if previous.get("version") == VERSION else {}
    records = {}
    folders = sorted(PHOTOS.iterdir()) if PHOTOS.exists() else []
    for folder in folders:
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        for source in sorted(folder.iterdir()):
            if not source.is_file() or source.name.startswith(".") or source.suffix.lower() not in EXTENSIONS:
                continue
            relative = source.relative_to(PHOTOS).as_posix()
            stat = source.stat()
            fingerprint = f"{stat.st_size}:{stat.st_mtime_ns}"
            record = cached.get(relative)
            if record and record.get("fingerprint") == fingerprint and all(
                (ROOT / "public" / variant["src"]).is_file() for variant in record["variants"]
            ):
                records[relative] = record
                continue
            identity = hashlib.sha256(relative.encode()).hexdigest()[:10]
            destination = OUTPUT / f"{slug(folder.name)}-{slug(source.stem)}-{identity}"
            destination.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as original:
                image = srgb_image(ImageOps.exif_transpose(original))
                width, height = image.size
                variants = []
                for target_width in sorted({min(width, candidate) for candidate in WIDTHS}):
                    target_height = round(height * target_width / width)
                    resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
                    resized.info.clear()
                    target = destination / f"{target_width}.webp"
                    temporary = target.with_suffix(f".{os.getpid()}.tmp")
                    resized.save(temporary, format="WEBP", quality=86, method=6)
                    temporary.replace(target)
                    variants.append({
                        "src": target.relative_to(ROOT / "public").as_posix(),
                        "width": target_width,
                        "height": target_height,
                    })
            records[relative] = {
                "fingerprint": fingerprint,
                "width": width,
                "height": height,
                "variants": variants,
            }
    serialized = json.dumps({"version": VERSION, "photos": records}, indent=2) + "\n"
    if not CACHE.exists() or CACHE.read_text() != serialized:
        temporary = CACHE.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_text(serialized)
        temporary.replace(CACHE)
    print(json.dumps(records))


if __name__ == "__main__":
    main()
