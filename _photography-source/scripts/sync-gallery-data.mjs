import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Refresh the offline fallback from the authoritative gallery, without touching images. */
export async function syncGalleryData() {
  const gallery = JSON.parse(await fs.readFile(path.join(root, 'public/gallery.json'), 'utf8'));
  if (gallery.version !== 1 || !Array.isArray(gallery.collections)) throw new Error('Invalid public/gallery.json.');
  const output = path.join(root, 'src/data/galleryData.generated.js');
  const source = `// Generated from public/gallery.json. Image files are never transformed.\n\nexport const collections = ${JSON.stringify(gallery.collections, null, 2)};\n`;
  let previous;
  try { previous = await fs.readFile(output, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== source) await fs.writeFile(output, source);
  return { sets: gallery.collections.length, photographs: gallery.collections.reduce((sum, set) => sum + set.photos.length, 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncGalleryData().then((result) => console.log(`Synced ${result.sets} sets and ${result.photographs} original photographs.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
