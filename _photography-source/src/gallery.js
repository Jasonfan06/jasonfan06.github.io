import { collections as fallbackCollections } from './data/galleryData.generated.js';

function safeImagePath(value) {
  return typeof value === 'string' && /^(optimized|photos|originals)\//.test(value) && !value.includes('..') && !/[\\\u0000-\u001f]/.test(value);
}

export function validateGallery(value) {
  if (value?.version !== 1 || !Array.isArray(value.collections)) throw new Error('Invalid gallery format.');
  const ids = new Set();
  return value.collections.map((collection) => {
    if (typeof collection.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(collection.id) || ids.has(collection.id) ||
        typeof collection.title !== 'string' || !collection.title.trim() || !Array.isArray(collection.photos) || !collection.photos.length) {
      throw new Error('Invalid photograph set.');
    }
    ids.add(collection.id);
    const photos = collection.photos.map((photo) => {
      if (typeof photo.id !== 'string' || !safeImagePath(photo.src) || !safeImagePath(photo.fullSrc ?? photo.src) ||
          !Number.isFinite(photo.width) || photo.width <= 0 || !Number.isFinite(photo.height) || photo.height <= 0 ||
          (photo.coverSrc && !safeImagePath(photo.coverSrc)) ||
          [photo.variants, photo.coverVariants].some((variants) => variants && (!Array.isArray(variants) || variants.some((variant) =>
            !safeImagePath(variant.src) || !Number.isFinite(variant.width) || variant.width <= 0)))) {
        throw new Error('Invalid photograph metadata.');
      }
      return photo;
    });
    const coverPhoto = photos.find((photo) => photo.id === collection.coverPhoto?.id || photo.src === collection.cover) ?? photos[0];
    return { ...collection, photos, coverPhoto, cover: coverPhoto.coverSrc ?? coverPhoto.src, count: photos.length };
  });
}

export async function loadGallery() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}gallery.json`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Gallery could not be loaded.');
    return validateGallery(await response.json());
  } catch (error) {
    console.warn('Using the saved gallery:', error.message);
    return fallbackCollections;
  }
}
