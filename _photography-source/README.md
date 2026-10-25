# Canoe — Photography

A white, image-led photography portfolio built with React and Vite. It opens with a nine-blade aperture animation, presents one cover per set, and reveals the set name in a translucent white bar on hover or keyboard focus. Small screens show the title bar persistently. Each set has an uncropped gallery and a full-screen viewer with keyboard navigation, swipe gestures, and native dialog focus handling.

Published at **https://jasonfan06.github.io/photography/**. The existing personal website at the domain root is preserved.

## Upload photographs with Canoe Studio

Double-click **Open Canoe Studio.command** in this folder. It opens a private page at `http://127.0.0.1:4317/#studio` on this Mac. Keep its Terminal window open while using the studio. You can also start it with `npm run studio`.

1. Give the new set a name.
2. Drop in photographs and select one as the cover. Optional image descriptions help screen-reader visitors.
3. Click **Publish set**.

The studio creates responsive WebP copies and publishes the complete set to the existing GitHub Pages repository using this Mac's Git sign-in. GitHub Pages then deploys it; the public link can take several minutes to update. The studio is bound to this Mac and does not expose an upload endpoint on the public portfolio. Original files are never uploaded or modified. The supported source formats are JPEG, PNG, WebP, and AVIF.

`public/gallery.json` is the authoritative set list. It includes both the existing sets and studio uploads. Builds copy it as-is, and the public portfolio fetches it before opening a set. The local studio's working checkout and pending uploads stay under ignored `.canoe-studio/`. Keep that folder when retrying an interrupted publication.

## Run locally

```sh
npm ci
npm run dev
```

## Photos and covers

Originals live in `public/photos/<set name>/`. Add a folder to create a set. JPG, JPEG, PNG, WebP and AVIF files are supported. The build generates 600, 1200 and 2000 pixel WebP variants without upscaling, preserves orientation, converts embedded color profiles to sRGB, and strips metadata. Gallery images retain their proportions. Covers use a consistent landscape frame.

Install Pillow when processing new originals:

```sh
python3 -m pip install Pillow
npm run generate:gallery
```

Set custom covers in `collectionCovers` in `scripts/generate-gallery-data.mjs`. Descriptive alternative text is configured in the same script. Generated metadata is in `src/data/galleryData.generated.js`.

Your local original photographs are never edited. Only optimized WebP copies are included in the published build. The repository source uses the optimized images and saved metadata so it builds without the original files or Pillow. To add new photographs, install Pillow and add the originals locally.

## Build and publish

```sh
npm run build
```

The self-contained `dist/` folder uses relative asset URLs, making it compatible with GitHub Pages subdirectories. Publish its contents to `photography/` in `Jasonfan06/jasonfan06.github.io` on the `main` branch. GitHub Pages serves the existing repository branch. Keep `_photography-source/` updated with this project; its leading underscore excludes development files from Jekyll output. Do not replace the existing personal site's root files.

## Verification

Production build verified. Browser checks cover desktop and 390px layouts, set navigation, responsive image loading, original gallery proportions, lightbox arrow keys and Escape. Reduced-motion preferences bypass the opening animation.

The visible layout contains the Canoe wordmark, photo covers, hover titles, each opened set's name above its gallery, icon controls, and a copyright footer with “All rights reserved”. Navigation labels, homepage headings, set/photo counts, credits, and Back to top text are omitted. Accessible labels remain available to screen readers.
