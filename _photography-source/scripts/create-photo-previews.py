#!/usr/bin/env python3
"""Create high-quality display copies without changing the original photograph."""

import hashlib
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageCms, ImageOps


WIDTHS = (600, 1200, 2000)
QUALITY = 92
VERSION = "webp-q92-srgb-v1"
FORMATS = {"JPEG", "PNG", "WEBP", "AVIF"}


def file_hash(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_image(original):
    """Honor orientation and embedded color while preserving an alpha channel."""
    image = ImageOps.exif_transpose(original)
    alpha = "A" in image.getbands() or (image.mode == "P" and "transparency" in image.info)
    mode = "RGBA" if alpha else "RGB"
    profile = image.info.get("icc_profile")
    if profile:
        try:
            image = ImageCms.profileToProfile(
                image,
                ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                ImageCms.createProfile("sRGB"),
                outputMode=mode,
            )
        except (OSError, ValueError, ImageCms.PyCMSError):
            image = image.convert(mode)
    else:
        image = image.convert(mode)
    image.info.clear()
    return image


def cached_result(cache_file, output, source_hash):
    try:
        record = json.loads(cache_file.read_text(encoding="utf-8"))
        if record.get("version") != VERSION or record.get("sourceHash") != source_hash:
            return None
        result = record["result"]
        widths = sorted({min(result["width"], width) for width in WIDTHS})
        if [item["width"] for item in result["variants"]] != widths:
            return None
        for item in result["variants"]:
            if item["file"] != f'{item["width"]}.webp':
                return None
            file = output / item["file"]
            if file.stat().st_size != item["byteSize"] or file_hash(file) != record["outputHashes"][item["file"]]:
                return None
        return result
    except (OSError, ValueError, KeyError, TypeError):
        return None


def create_previews(source, output):
    source = source.resolve(strict=True)
    if not source.is_file():
        raise ValueError("Choose an original photograph file.")
    output = output.resolve()
    source_hash = file_hash(source)
    cache_file = output / ".preview-cache.json"
    cached = cached_result(cache_file, output, source_hash)
    if cached:
        return cached

    # Refuse a destination that could replace the original, even for WebP input.
    if source.parent == output and source.name in {f"{width}.webp" for width in WIDTHS}:
        raise ValueError("Display copies must use a different folder from the original.")

    output.mkdir(parents=True, exist_ok=True)
    temporary_files = []
    try:
        with Image.open(source) as original:
            if original.format not in FORMATS:
                raise ValueError("Choose a JPEG, PNG, WebP, or AVIF photograph.")
            if getattr(original, "is_animated", False):
                raise ValueError("Choose a still photograph.")
            image = display_image(original)
            width, height = image.size
            variants = []
            output_hashes = {}
            for target_width in sorted({min(width, value) for value in WIDTHS}):
                target_height = max(1, round(height * target_width / width))
                filename = f"{target_width}.webp"
                target = output / filename
                if source == target:
                    raise ValueError("Display copies must not replace the original photograph.")
                with tempfile.NamedTemporaryFile(prefix=".preview-", suffix=".tmp", dir=output, delete=False) as temporary:
                    temporary_path = Path(temporary.name)
                temporary_files.append((temporary_path, target))
                resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
                resized.info.clear()
                resized.save(temporary_path, format="WEBP", quality=QUALITY, method=6)
                variants.append({
                    "file": filename,
                    "width": target_width,
                    "height": target_height,
                    "byteSize": temporary_path.stat().st_size,
                })
                output_hashes[filename] = file_hash(temporary_path)
            image.close()

        # Publish the cache only after all resized copies have been encoded.
        for temporary, target in temporary_files:
            temporary.replace(target)
        result = {"width": width, "height": height, "variants": variants}
        record = {"version": VERSION, "sourceHash": source_hash, "result": result, "outputHashes": output_hashes}
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix=".cache-", suffix=".tmp", dir=output, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary_files.append((temporary_path, cache_file))
            json.dump(record, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
        temporary_path.replace(cache_file)
        return result
    finally:
        for temporary, _ in temporary_files:
            temporary.unlink(missing_ok=True)


def main():
    if len(sys.argv) != 3:
        print("Usage: create-photo-previews.py INPUT_PATH OUTPUT_DIR", file=sys.stderr)
        return 2
    try:
        result = create_previews(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(f"Could not create display copies: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
