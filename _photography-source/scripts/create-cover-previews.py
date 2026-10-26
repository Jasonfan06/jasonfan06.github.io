#!/usr/bin/env python3
"""Small cropped WebP covers; original files and gallery previews stay untouched."""
import importlib.util
import json
import math
import sys
import tempfile
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('canoe_photo_previews', Path(__file__).with_name('create-photo-previews.py'))
photo_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photo_tools)
WIDTHS = (480, 800, 1200)
QUALITY = 76
VERSION = 'cover-3x2-webp-q76-v2'


def create_covers(source, output, crop=None):
    crop = {'x': 0.5, 'y': 0.5, 'zoom': 1} if crop is None else crop
    if not isinstance(crop, dict) or any(
        isinstance(crop.get(key), bool) or not isinstance(crop.get(key), (int, float)) or
        not math.isfinite(crop[key]) or not low <= crop[key] <= high
        for key, low, high in [('x', 0, 1), ('y', 0, 1), ('zoom', 1, 3)]
    ):
        raise ValueError('Choose a valid cover position and zoom between 1 and 3.')
    source = source.resolve(strict=True)
    output = output.resolve()
    if source.parent == output:
        raise ValueError('Cover copies must use a separate directory.')
    digest = photo_tools.file_hash(source)
    cache = output / '.cover-cache.json'
    try:
        saved = json.loads(cache.read_text())
        if saved['version'] == VERSION and saved['sourceHash'] == digest and saved['crop'] == crop and all(
            photo_tools.file_hash(output / item['file']) == saved['outputHashes'][item['file']]
            for item in saved['result']['variants']
        ):
            return saved['result']
    except (OSError, ValueError, KeyError, TypeError):
        pass
    output.mkdir(parents=True, exist_ok=True)
    temporary_files = []
    try:
        with Image.open(source) as original:
            if original.format not in photo_tools.FORMATS or getattr(original, 'is_animated', False):
                raise ValueError('Choose a still JPEG, PNG, WebP, or AVIF photograph.')
            image = photo_tools.display_image(original)
            width, height = image.size
            crop_width = min(width, height * 1.5) / crop['zoom']
            crop_height = crop_width / 1.5
            left = (width - crop_width) * crop['x']
            top = (height - crop_height) * crop['y']
            box = (left, top, left + crop_width, top + crop_height)
            maximum = max(1, int(crop_width))
            variants = []
            hashes = {}
            for target_width in sorted({min(maximum, item) for item in WIDTHS}):
                target_height = max(1, round(target_width / 1.5))
                filename = f'{target_width}.webp'
                with tempfile.NamedTemporaryFile(prefix='.cover-', suffix='.tmp', dir=output, delete=False) as handle:
                    temporary = Path(handle.name)
                temporary_files.append((temporary, output / filename))
                cover = image.resize((target_width, target_height), Image.Resampling.LANCZOS, box=box)
                cover.info.clear()
                cover.save(temporary, format='WEBP', quality=QUALITY, method=4)
                variants.append({'file': filename, 'width': target_width, 'height': target_height, 'byteSize': temporary.stat().st_size})
                hashes[filename] = photo_tools.file_hash(temporary)
                cover.close()
            image.close()
        for temporary, target in temporary_files:
            temporary.replace(target)
        result = {'width': width, 'height': height, 'variants': variants, 'quality': QUALITY}
        record = {'version': VERSION, 'sourceHash': digest, 'crop': crop, 'result': result, 'outputHashes': hashes}
        with tempfile.NamedTemporaryFile(mode='w', prefix='.cache-', suffix='.tmp', dir=output, delete=False) as handle:
            temporary = Path(handle.name)
            temporary_files.append((temporary, cache))
            json.dump(record, handle)
        temporary.replace(cache)
        return result
    finally:
        for temporary, _ in temporary_files:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        if len(sys.argv) not in (3, 4):
            raise ValueError('Usage: create-cover-previews.py INPUT_PATH OUTPUT_DIR [CROP_JSON]')
        print(json.dumps(create_covers(Path(sys.argv[1]), Path(sys.argv[2]), json.loads(sys.argv[3]) if len(sys.argv) == 4 else None)))
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(f'Could not create cover copies: {error}', file=sys.stderr)
        sys.exit(1)
