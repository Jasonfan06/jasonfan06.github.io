# Canoe — Photography

A white, image-led photography portfolio with an aperture reveal, photo set covers, rising hover titles, centered set names, and an uncropped masonry gallery. Photos flow at their natural proportions with consistent gaps and no reserved row space. Portraits fit within a comfortable viewport height; images retain their original proportions and full resolution.

Published at **https://jasonfan06.github.io/photography/**. The personal website at the domain root is preserved.

## Upload with Canoe Studio

Double-click **Open Canoe Studio.command** in this folder. The private studio opens at `http://127.0.0.1:4317/#studio` on this Mac. You can also run `npm run studio`.

1. Name the set.
2. Drop in photographs and choose a cover.
3. Click **Publish set**.

Original files are uploaded unchanged, at full resolution. The studio creates high-quality WebP gallery previews and separate lightweight cover copies. Clicking a photograph to magnify it loads its original file. It uploads files individually, then publishes the complete set in one commit. JPEG, PNG, WebP, and AVIF files up to 50 MiB each are supported, with up to 30 photos per set. The public page scales images only for display.

To edit a published set, choose it in **Set to edit** or click **Edit set** under Published sets. Add files, remove photos with the × button, and reorder them with the drag handles or earlier/later arrows. Select a cover photo, then drag its preview or use the position and zoom sliders to frame it. **Save changes** updates the existing set at the same link. Cover crops are separate WebP files; gallery photographs and original files stay uncropped. Removed photos leave the set, while original files remain preserved. A stale edit is rejected so a newer published version cannot be overwritten. Use **Reload sets** and reopen the set to review the latest version.

The studio uses this Mac's existing GitHub sign-in. A saved, interrupted publication can be resumed. GitHub Pages can take a few minutes to deploy a submitted set. Keep the studio's Terminal window open while using it; the public portfolio stays online when the studio closes.

The studio binds only to this Mac. It does not expose a public upload endpoint, store a GitHub token in the webpage, or modify source photographs. Its managed checkout and resumable uploads remain under ignored `.canoe-studio/`.

## Run or build

```sh
npm ci
npm run dev
npm run build
```

`public/gallery.json` is the authoritative set list. Builds refresh the offline metadata fallback from that JSON and copy the originals and prepared display copies. Display copies are generated at 600, 1200, and 2000 pixels without upscaling, with orientation and color preserved. Originals are never modified. Existing originals live under `public/photos/`; future studio uploads live under `public/originals/`. Display copies live under public/optimized/. Every preview visible in the first viewport, plus a 100px buffer, must finish downloading and decoding before the aperture starts. Three small image requests run at a time; the iris stays closed with a Retry button if a required preview fails. Covers use dedicated 480/800/1200px WebP copies at quality 76, cropped to the same 3:2 cover frame, while gallery previews retain quality 92 and their original proportions. During opening, up to two additional offscreen cover/preview files may download sequentially at low priority; extra decoding and original transfers remain paused. Covers load first, followed by all gallery previews. Once previews are ready, originals preload sequentially at low priority without being decoded. Entering a collection pauses background work immediately; it resumes after the transition, with that collection first. Magnifying shows the cached preview immediately, requests and decodes the original at foreground priority, and crossfades it in only when ready. Changing photos or navigating cancels obsolete foreground/background work.

The build uses relative URLs. To publish source updates, copy `dist/` into `photography/` in the `main` branch of `Jasonfan06/jasonfan06.github.io`. Keep the project source under `_photography-source/` updated. Preserve the latest remote gallery JSON and image files when publishing code changes.

## Verification

```sh
npm run test:studio
npm run test:loading
```

The studio's isolated tests cover original byte preservation, image signatures, local request protections, creating and editing sets, image order and removal, cover crop pixels and zoom, legacy photograph paths, stale-edit protection, idempotent retries, failed-push recovery, and preservation of the personal homepage. Gallery browser checks cover portrait sizing, mixed proportions, and desktop/mobile layouts.

The public photo elements suppress ordinary right-click menus, copy/cut, drag saving, selection, and supported touch callouts. These are interaction deterrents; public images can still be accessed through browser tools or captured in screenshots.

Loading order: all first-viewport previews downloaded and decoded; aperture with at most one low-priority preview-byte transfer and no extra decode; WebP covers; decoded gallery previews; sequential low-priority original transfers. A collection click aborts background originals before navigation. Preview-first magnification promotes the requested original, decodes it off the display path, then crossfades it over the preview.
