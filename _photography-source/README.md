# Canoe — Photography

A white, image-led photography portfolio with an aperture reveal, photo set covers, rising hover titles, centered set names, and an uncropped masonry gallery. Photos flow at their natural proportions with consistent gaps and no reserved row space. Portraits fit within a comfortable viewport height; images retain their original proportions and full resolution.

Published at **https://jasonfan06.github.io/photography/**. The personal website at the domain root is preserved.

## Upload with Canoe Studio

Double-click **Open Canoe Studio.command** in this folder. The private studio opens at `http://127.0.0.1:4317/#studio` on this Mac. You can also run `npm run studio`.

1. Name the set.
2. Drop in photographs and choose a cover.
3. Click **Publish set**.

Original files are uploaded unchanged, at full resolution. The studio keeps those originals unchanged and creates separate high-quality WebP display copies for covers and galleries. Clicking a photograph to magnify it loads its original file. It uploads files individually, then publishes the complete set in one commit. JPEG, PNG, WebP, and AVIF files up to 50 MiB each are supported, with up to 30 photos per set. The public page scales images only for display.

The studio uses this Mac's existing GitHub sign-in. A saved, interrupted publication can be resumed. GitHub Pages can take a few minutes to deploy a submitted set. Keep the studio's Terminal window open while using it; the public portfolio stays online when the studio closes.

The studio binds only to this Mac. It does not expose a public upload endpoint, store a GitHub token in the webpage, or modify source photographs. Its managed checkout and resumable uploads remain under ignored `.canoe-studio/`.

## Run or build

```sh
npm ci
npm run dev
npm run build
```

`public/gallery.json` is the authoritative set list. Builds refresh the offline metadata fallback from that JSON and copy the originals and prepared display copies. Display copies are generated at 600, 1200, and 2000 pixels without upscaling, with orientation and color preserved. Originals are never modified. Existing originals live under `public/photos/`; future studio uploads live under `public/originals/`. Display copies live under public/optimized/. A small batch of visible WebP previews warms up before the aperture starts, with a 320 ms deadline. During opening, only one critical preview-byte download may continue at low priority; extra decoding and original transfers remain paused. Covers load first, followed by all gallery previews. Once previews are ready, originals preload sequentially at low priority without being decoded. Entering a collection pauses background work immediately; it resumes after the transition, with that collection first. Magnifying shows the cached preview immediately, requests and decodes the original at foreground priority, and crossfades it in only when ready. Changing photos or navigating cancels obsolete foreground/background work.

The build uses relative URLs. To publish source updates, copy `dist/` into `photography/` in the `main` branch of `Jasonfan06/jasonfan06.github.io`. Keep the project source under `_photography-source/` updated. Preserve the latest remote gallery JSON and image files when publishing code changes.

## Verification

```sh
npm run test:studio
```

The studio's isolated tests cover original byte preservation, image signatures, local request protections, repository publishing, idempotent retries, failed-push recovery, and preservation of the personal homepage. Gallery browser checks cover portrait sizing, mixed proportions, and desktop/mobile layouts.

The public photo elements suppress ordinary right-click menus, copy/cut, drag saving, selection, and supported touch callouts. These are interaction deterrents; public images can still be accessed through browser tools or captured in screenshots.

Loading order: bounded critical-preview warmup; aperture with at most one low-priority preview-byte transfer and no extra decode; WebP covers; decoded gallery previews; sequential low-priority original transfers. A collection click aborts background originals before navigation. Preview-first magnification promotes the requested original, decodes it off the display path, then crossfades it over the preview.
