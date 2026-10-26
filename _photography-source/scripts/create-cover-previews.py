#!/usr/bin/env python3
"""Small cropped WebP covers; original files and gallery previews stay untouched."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageOps

spec = importlib.util.spec_from_file_location('canoe_photo_previews', Path(__file__).with_name('create-photo-previews.py'))
photo_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photo_tools)
WIDTHS = (480, 800, 1200)
QUALITY = 76
VERSION = 'cover-3x2-webp-q76-v1'


def create_covers(source, output):
    source = source.resolve(strict=True)
    output = output.resolve()
    if source.parent == output:
        raise ValueError('Cover copies must use a separate directory.')
    digest = photo_tools.file_hash(source)
    cache = output / '.cover-cache.json'
    try:
        saved = json.loads(cache.read_text())
        if saved['version'] == VERSION and saved['sourceHash'] == digest and all(
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
            maximum = max(1, min(width, int(height * 1.5)))
            variants = []
            hashes = {}
            for target_width in sorted({min(maximum, item) for item in WIDTHS}):
                target_height = max(1, round(target_width / 1.5))
                filename = f'{target_width}.webp'
                with tempfile.NamedTemporaryFile(prefix='.cover-', suffix='.tmp', dir=output, delete=False) as handle:
                    temporary = Path(handle.name)
                temporary_files.append((temporary, output / filename))
                cover = ImageOps.fit(image, (target_width, target_height), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
                cover.info.clear()
                cover.save(temporary, format='WEBP', quality=QUALITY, method=4)
                variants.append({'file': filename, 'width': target_width, 'height': target_height, 'byteSize': temporary.stat().st_size})
                hashes[filename] = photo_tools.file_hash(temporary)
                cover.close()
            image.close()
        for temporary, target in temporary_files:
            temporary.replace(target)
        result = {'width': width, 'height': height, 'variants': variants, 'quality': QUALITY}
        record = {'version': VERSION, 'sourceHash': digest, 'result': result, 'outputHashes': hashes}
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
        if len(sys.argv) != 3:
            raise ValueError('Usage: create-cover-previews.py INPUT_PATH OUTPUT_DIR')
        print(json.dumps(create_covers(Path(sys.argv[1]), Path(sys.argv[2]))))
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        print(f'Could not create cover copies: {error}', file=sys.stderr)
        sys.exit(1)
