import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const runFile = promisify(execFile);
const supportedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const photosRoot = path.join(projectRoot, 'public', 'photos');
const dataDirectory = path.join(projectRoot, 'src', 'data');
const dataOutputPath = path.join(dataDirectory, 'galleryData.generated.js');
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const collectionCovers = {
  Coziness: 'DSC00661.jpg',
  'Half-covered Face': 'DSC00717.jpg',
  Overbearing: 'DSC00981.jpg',
  Smoke: 'DSC00796.jpg',
};
const photoDescriptions = {
  'Coziness/DSC00654.jpg': 'A tabby cat looks through a lattice of bamboo stems in warm sunlight.',
  'Coziness/DSC00661.jpg': 'A sunlit tabby cat tilts its head toward the camera.',
  'Coziness/DSC00667.jpg': 'A tabby cat looks upward, seen from behind through crossing bamboo stems.',
  'Coziness/DSC00668.jpg': 'A tabby cat lifts its face toward the light behind a lattice of bamboo.',
  'Coziness/DSC00670.jpg': 'A tabby cat rests in sunlight with its eyes nearly closed.',
  'Half-covered Face/DSC00715.jpg': 'A tabby cat peers from behind dark railings, pale posts, and small leaves.',
  'Half-covered Face/DSC00717.jpg': 'Sunlight catches one eye of a tabby cat behind a diagonal dark railing.',
  'Overbearing/DSC00981.jpg': 'A white calico cat sits upright on leaf-strewn ground against a blurred background.',
  'Overbearing/DSC00998.jpg': 'A close portrait of a calico cat with green eyes and black and orange markings.',
  'Smoke/DSC00772.jpg': 'A person in a dark jacket bends over a large cooking vessel surrounded by smoke.',
  'Smoke/DSC00796.jpg': 'A person in a cap and patterned apron stands beside rising cooking smoke.',
  'Smoke/DSC02268.jpg': 'A person works at a street food stall at night beneath a bright plume of smoke.',
};
let inFlight;

function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'collection';
}

function titleFromFilename(filename) {
  return path.parse(filename).name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isImageEntry(entry) {
  return entry.isFile() && !entry.name.startsWith('.') &&
    supportedImageExtensions.has(path.extname(entry.name).toLowerCase());
}

async function readDirectorySafe(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function collectionFromDirectory(directoryEntry, optimized, collectionId) {
  const collectionName = directoryEntry.name;
  const imageEntries = (await readDirectorySafe(path.join(photosRoot, collectionName)))
    .filter(isImageEntry)
    .sort((first, second) => collator.compare(first.name, second.name));

  const photos = imageEntries.map((entry, index) => {
    const metadata = optimized[`${collectionName}/${entry.name}`];
    if (!metadata) throw new Error(`Missing optimized image: ${collectionName}/${entry.name}`);
    const { width, height, variants } = metadata;
    const gallery = variants.find((variant) => variant.width >= 1200) ?? variants.at(-1);
    return {
      id: `${collectionId}-${index + 1}`,
      title: titleFromFilename(entry.name),
      alt: photoDescriptions[`${collectionName}/${entry.name}`] ?? `${collectionName}, photograph ${index + 1}`,
      filename: entry.name,
      src: gallery.src,
      fullSrc: variants.at(-1).src,
      srcSet: variants.map((variant) => `${variant.src} ${variant.width}w`).join(', '),
      width,
      height,
      variants,
    };
  });

  const coverPhoto = photos.find((photo) => photo.filename === collectionCovers[collectionName]) ?? photos[0] ?? null;
  return {
    id: collectionId,
    title: collectionName,
    folder: collectionName,
    cover: coverPhoto?.src ?? null,
    coverPhoto,
    count: photos.length,
    photos,
  };
}

async function generate() {
  await fs.mkdir(dataDirectory, { recursive: true });
  const sourceEntries = await readDirectorySafe(photosRoot);
  const directories = sourceEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((first, second) => collator.compare(first.name, second.name));
  const hasOriginals = (await Promise.all(directories.map(async (entry) =>
    (await readDirectorySafe(path.join(photosRoot, entry.name))).some(isImageEntry)))).some(Boolean);
  // Deployment checkouts may contain only metadata and optimized images. Keep that
  // complete gallery rather than replacing it with an empty collection list.
  if (!hasOriginals) {
    try {
      const saved = await fs.readFile(dataOutputPath, 'utf8');
      const match = saved.match(/export const collections = ([\s\S]*);\s*$/);
      const collections = match ? JSON.parse(match[1]) : [];
      if (collections.length) {
        const sources = collections.flatMap((collection) => collection.photos.flatMap((photo) =>
          photo.variants?.map((variant) => variant.src) ?? [photo.src]));
        await Promise.all(sources.map((source) => fs.access(path.join(projectRoot, 'public', source))));
        return {
          collectionCount: collections.length,
          photoCount: collections.reduce((total, collection) => total + collection.count, 0),
          outputPath: dataOutputPath,
          preservedOptimizedGallery: true,
        };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.mkdir(photosRoot, { recursive: true });
  let optimized;
  try {
    const { stdout } = await runFile(process.env.PYTHON || 'python3', [path.join(scriptDirectory, 'prepare-photos.py')], {
      maxBuffer: 8 * 1024 * 1024,
    });
    optimized = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Photo preparation failed. Install Pillow with: python3 -m pip install Pillow\n${error.stderr || error.message}`, { cause: error });
  }
  const slugCounts = new Map();
  for (const entry of directories) {
    const slug = slugify(entry.name);
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }
  const collections = await Promise.all(directories.map((entry) => {
    const slug = slugify(entry.name);
    const collectionId = slugCounts.get(slug) > 1
      ? `${slug}-${createHash('sha256').update(entry.name).digest('hex').slice(0, 8)}`
      : slug;
    return collectionFromDirectory(entry, optimized, collectionId);
  }));
  const contents = `// Generated by scripts/generate-gallery-data.mjs. Add folders/photos in public/photos.\n// URLs are relative to import.meta.env.BASE_URL so project GitHub Pages work.\n\nexport const collections = ${JSON.stringify(collections, null, 2)};\n`;
  let previous;
  try { previous = await fs.readFile(dataOutputPath, 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous !== contents) await fs.writeFile(dataOutputPath, contents);
  return {
    collectionCount: collections.length,
    photoCount: collections.reduce((total, collection) => total + collection.count, 0),
    outputPath: dataOutputPath,
  };
}

export function generateGalleryData() {
  inFlight ??= generate().finally(() => { inFlight = undefined; });
  return inFlight;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  generateGalleryData().then((result) => {
    console.log(`Generated ${result.collectionCount} collections and ${result.photoCount} photos.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
