/** Staged image loading. Preview decode and original transfer never run during animation. */
const PREVIEW_PIXEL_BUDGET = 16_000_000;
const abortError = () => new DOMException('Image loading was superseded.', 'AbortError');

export function createLoadingCoordinator(collections, options = {}) {
  const env = options.environment || globalThis;
  const page = options.document || env.document;
  const viewport = options.viewport || (() => ({ width: env.innerWidth || 1200, height: env.innerHeight || 900, dpr: env.devicePixelRatio || 1 }));
  const asset = options.asset || ((value) => value);
  const fetchResource = options.fetch || env.fetch.bind(env);
  const makeImage = options.createImage || (() => new env.Image());
  const later = options.setTimeout || env.setTimeout.bind(env);
  const clearLater = options.clearTimeout || env.clearTimeout.bind(env);
  const allPhotos = collections.flatMap((collection) => collection.photos);
  const photosById = new Map(allPhotos.map((photo) => [photo.id, photo]));
  const collectionByPhoto = new Map(collections.flatMap((collection) => collection.photos.map((photo) => [photo.id, collection])));
  const covers = collections.map((collection) => collection.coverPhoto || collection.photos.find((photo) => photo.src === collection.cover) || collection.photos[0]).filter(Boolean);
  const previewReady = new Set();
  const originalReady = new Set();
  const failed = new Set();
  const decodedPreviews = new Map();
  const pinnedPreviews = new Map();
  const listeners = new Set();
  let decodedPixels = 0;
  let animating = true;
  let transitioning = false;
  let selectedId = null;
  let destroyed = false;
  let epoch = 0;
  let running = false;
  let background = null;
  let cancelIdle = null;
  let foreground = null;
  let foregroundId = 0;
  let stage = 'aperture';
  let resizeTimer;

  const absolute = (value) => {
    if (!value) return undefined;
    const result = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : asset(value);
    try { return new URL(result, options.baseURI || page?.baseURI || env.location?.href).href; }
    catch { return result; }
  };
  const hidden = () => Boolean(page?.hidden);
  const isSaveData = () => Boolean(env.navigator?.connection?.saveData);
  const variantChoices = (photo) => (photo.variants || []).filter((variant) => variant?.src && variant.width > 0).map((variant) => ({ ...variant, url: absolute(variant.src) })).sort((a, b) => a.width - b.width);

  function displayWidth(photo, cover) {
    const { width, height, dpr } = viewport();
    const container = width >= 1500 ? Math.min(1400, width - 160) : width > 900 ? Math.min(1320, width - 112) : width > 700 ? width - 64 : width - 40;
    if (cover) return Math.max(1, Math.min(700, width <= 700 ? container : (container - (width >= 1500 ? 40 : width <= 900 ? 22 : 30)) / 2)) * Math.min(3, dpr);
    const collection = collectionByPhoto.get(photo.id);
    const count = collection?.photos.length || 1;
    const columns = Math.min(count, width <= 700 ? 1 : width <= 1000 ? 2 : 3);
    const gap = width <= 1000 ? 20 : 24;
    const ratio = Math.min(...(collection?.photos || [photo]).map((item) => item.width / item.height));
    return Math.max(1, Math.min((container - gap * (columns - 1)) / columns, Math.min(height * 0.68, 680) * ratio)) * Math.min(3, dpr);
  }

  function getPreviewSrc(photo, { cover = false } = {}) {
    if (!photo) return undefined;
    const view = viewport();
    const key = `${photo.id}:${cover ? 'cover' : 'gallery'}:${view.width}:${view.height}:${view.dpr}`;
    if (pinnedPreviews.has(key)) return pinnedPreviews.get(key);
    const variants = variantChoices(photo);
    const needed = displayWidth(photo, cover);
    const chosen = variants.find((variant) => variant.width >= needed) || variants.at(-1);
    // A larger, already-loaded cover is a free gallery preview rather than another download.
    const cached = !cover && variants.find((variant) => variant.width >= needed && previewReady.has(variant.url));
    const url = cached?.url || chosen?.url || (/\.(?:webp|avif)(?:[?#]|$)/i.test(photo.src || '') && photo.src !== photo.fullSrc ? absolute(photo.src) : undefined);
    pinnedPreviews.set(key, url);
    return url;
  }

  function getCachedPreviewSrc(photo) {
    const variants = variantChoices(photo);
    const ready = variants.filter((variant) => previewReady.has(variant.url));
    const decoded = ready.filter((variant) => decodedPreviews.has(variant.url));
    return (decoded.at(-1) || ready.at(-1))?.url;
  }
  const getOriginalSrc = (photo) => absolute(photo?.fullSrc || photo?.src);

  function orderedPhotos() {
    const selected = collections.find((collection) => collection.id === selectedId)?.photos || [];
    let preferred = selected;
    if (foreground?.photo && selected.some((photo) => photo.id === foreground.photo.id)) {
      const index = selected.findIndex((photo) => photo.id === foreground.photo.id);
      const adjacent = [selected[index + 1], selected[index - 1]].filter(Boolean);
      preferred = [...adjacent, ...selected];
    }
    const seen = new Set();
    return [...preferred, ...allPhotos].filter((photo) => !seen.has(photo.id) && seen.add(photo.id));
  }
  const uniqueJobs = (items) => {
    const seen = new Set();
    return items.filter((item) => item.url && !seen.has(item.url) && seen.add(item.url));
  };
  const coverJobs = () => uniqueJobs(covers.map((photo) => ({ kind: 'cover', photo, url: getPreviewSrc(photo, { cover: true }) })));
  const previewJobs = () => uniqueJobs(orderedPhotos().map((photo) => ({ kind: 'preview', photo, url: getPreviewSrc(photo) })));
  const originalJobs = () => uniqueJobs(orderedPhotos().map((photo) => ({ kind: 'original', photo, url: getOriginalSrc(photo) })));

  function snapshot() {
    const coverList = coverJobs();
    const previewList = previewJobs();
    return {
      stage, animating, transitioning, selectedCollectionId: selectedId,
      coversReady: coverList.every((job) => previewReady.has(job.url)),
      previewsReady: previewList.every((job) => previewReady.has(job.url)),
      previewsLoaded: previewList.filter((job) => previewReady.has(job.url)).length,
      previewCount: previewList.length,
      originalsLoaded: originalReady.size,
      originalCount: originalJobs().length,
      foregroundReady: Boolean(foreground?.ready),
    };
  }
  function emit() {
    if (!listeners.size) return;
    const state = snapshot();
    for (const listener of listeners) listener(state);
  }
  function setStage(value) { if (stage !== value) { stage = value; emit(); } }

  function retainPreview(url, image) {
    if (decodedPreviews.has(url)) {
      decodedPixels -= decodedPreviews.get(url).pixels;
      decodedPreviews.delete(url);
    }
    const pixels = (image.naturalWidth || 0) * (image.naturalHeight || 0);
    decodedPreviews.set(url, { image, pixels });
    decodedPixels += pixels;
    while (decodedPixels > PREVIEW_PIXEL_BUDGET && decodedPreviews.size > 1) {
      const oldest = decodedPreviews.keys().next().value;
      decodedPixels -= decodedPreviews.get(oldest).pixels;
      decodedPreviews.delete(oldest);
    }
  }

  function decodedImage(url, signal, priority) {
    return new Promise((resolve, reject) => {
      const image = makeImage();
      let finished = false;
      let decoding = false;
      const cleanup = () => {
        signal.removeEventListener('abort', aborted);
        image.onload = null;
        image.onerror = null;
      };
      const finish = (error) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(image);
      };
      const aborted = () => { image.src = ''; finish(abortError()); };
      image.decoding = 'async';
      image.fetchPriority = priority;
      image.onload = async () => {
        if (decoding || finished) return;
        decoding = true;
        try {
          if (image.decode) await image.decode();
          finish(signal.aborted ? abortError() : null);
        } catch (error) { finish(error); }
      };
      image.onerror = () => finish(new Error('A photograph could not be loaded.'));
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) { aborted(); return; }
      image.src = url;
    });
  }

  function interruptBackground() {
    epoch += 1;
    background?.abort();
    background = null;
    cancelIdle?.();
    cancelIdle = null;
  }
  function cancelForeground() {
    if (!foreground) return;
    foreground.controller.abort();
    if (!foreground.ready) foreground.reject(abortError());
    foreground = null;
    foregroundId += 1;
  }
  function allowed() { return !destroyed && !animating && !transitioning && !hidden() && (!foreground || foreground.ready); }

  function nextJob() {
    const coverList = coverJobs();
    const cover = coverList.find((job) => !previewReady.has(job.url) && !failed.has(`preview:${job.url}`));
    if (cover) return cover;
    const previewList = previewJobs();
    const preview = previewList.find((job) => !previewReady.has(job.url) && !failed.has(`preview:${job.url}`));
    if (preview) return preview;
    // Failed essential previews do not justify spending bandwidth on optional originals.
    if (!coverList.every((job) => previewReady.has(job.url)) || !previewList.every((job) => previewReady.has(job.url))) return null;
    if (isSaveData()) return null;
    return originalJobs().find((job) => !originalReady.has(job.url) && !failed.has(`original:${job.url}`));
  }

  function idleTurn(signal) {
    return new Promise((resolve) => {
      let done = false;
      let handle;
      const finish = () => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', cancel);
        cancelIdle = null;
        resolve();
      };
      const cancel = () => {
        if (env.requestIdleCallback) env.cancelIdleCallback?.(handle);
        else clearLater(handle);
        finish();
      };
      if (env.requestIdleCallback) {
        handle = env.requestIdleCallback(finish);
      } else {
        handle = later(finish, 120);
      }
      cancelIdle = cancel;
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  async function drainOriginal(response, signal) {
    if (!response.body?.getReader) {
      await response.arrayBuffer();
      return;
    }
    const reader = response.body.getReader();
    try {
      while (!signal.aborted) {
        const { done } = await reader.read();
        if (done) return;
      }
      throw abortError();
    } finally {
      if (signal.aborted) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function runBackground(runEpoch) {
    while (allowed() && epoch === runEpoch) {
      const job = nextJob();
      if (!job) { setStage('idle'); return; }
      const controller = new AbortController();
      background = controller;
      setStage(job.kind === 'cover' ? 'covers' : job.kind === 'preview' ? 'previews' : 'originals');
      try {
        // All gallery work and original transfers yield before starting. Covers are essential.
        if (job.kind !== 'cover') await idleTurn(controller.signal);
        if (!allowed() || epoch !== runEpoch || controller.signal.aborted) return;
        if (job.kind === 'original') {
          const response = await fetchResource(job.url, { priority: 'low', cache: 'force-cache', signal: controller.signal });
          if (!response.ok) throw new Error('An original photograph could not be fetched.');
          await drainOriginal(response, controller.signal);
          if (!controller.signal.aborted) originalReady.add(job.url);
        } else {
          const image = await decodedImage(job.url, controller.signal, job.kind === 'cover' ? 'high' : 'low');
          if (!controller.signal.aborted) {
            previewReady.add(job.url);
            retainPreview(job.url, image);
          }
        }
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        failed.add(`${job.kind === 'original' ? 'original' : 'preview'}:${job.url}`);
      } finally {
        if (background === controller) background = null;
      }
      emit();
    }
  }

  function kick() {
    if (destroyed) return;
    if (animating) { setStage('aperture'); return; }
    if (transitioning) { setStage('transition'); return; }
    if (hidden()) { setStage('paused'); return; }
    if (foreground && !foreground.ready) { startForeground(); setStage('foreground'); return; }
    if (running) return;
    const runEpoch = epoch;
    running = true;
    runBackground(runEpoch).finally(() => {
      running = false;
      if (!destroyed && epoch !== runEpoch) kick();
    });
  }

  function startForeground() {
    const target = foreground;
    if (!target || target.started || animating || transitioning || hidden() || destroyed) return;
    target.started = true;
    decodedImage(target.url, target.controller.signal, 'high').then((image) => {
      if (foreground !== target || target.controller.signal.aborted) return;
      target.ready = true;
      target.image = image; // Keep only the displayed original decoded; background originals are transfer-only.
      originalReady.add(target.url);
      target.resolve(target.url);
      emit();
      kick();
    }).catch((error) => {
      if (foreground !== target) return;
      foreground = null;
      target.reject(error);
      if (error?.name !== 'AbortError') failed.add(`original:${target.url}`);
      emit();
      kick();
    });
  }

  function loadOriginal(photoOrId) {
    const photo = typeof photoOrId === 'string' ? photosById.get(photoOrId) : photoOrId;
    if (!photo) return Promise.reject(new Error('The photograph does not exist.'));
    if (destroyed) return Promise.reject(abortError());
    interruptBackground();
    cancelForeground();
    const url = getOriginalSrc(photo);
    failed.delete(`original:${url}`);
    return new Promise((resolve, reject) => {
      foreground = { id: ++foregroundId, photo, url, resolve, reject, ready: false, started: false, controller: new AbortController() };
      startForeground();
      setStage('foreground');
      emit();
    });
  }

  function notifyPreviewLoaded(photoOrId, url, image) {
    const photo = typeof photoOrId === 'string' ? photosById.get(photoOrId) : photoOrId;
    const resolved = url ? absolute(url) : photo && getPreviewSrc(photo);
    if (!photo || !resolved) return;
    previewReady.add(resolved);
    failed.delete(`preview:${resolved}`);
    if (image) retainPreview(resolved, image);
    emit();
    kick();
  }

  function animationStarted() {
    animating = true;
    interruptBackground();
    cancelForeground();
    setStage('aperture');
  }
  function animationFinished() { animating = false; emit(); kick(); }
  function enterCollection(id = null) {
    selectedId = id;
    transitioning = true;
    interruptBackground();
    cancelForeground();
    failed.clear();
    setStage('transition');
  }
  function transitionFinished(id = selectedId) {
    if (id !== selectedId) return;
    transitioning = false;
    emit();
    kick();
  }
  function closePhoto() {
    interruptBackground();
    cancelForeground();
    emit();
    kick();
  }
  function visibilityChanged() {
    interruptBackground();
    if (hidden()) {
      // Keep the viewer's explicitly requested image alive. Its decode promise is
      // still owned by the mounted viewer; only optional background work pauses.
      setStage('paused');
    } else kick();
  }
  function refresh() {
    if (destroyed) return;
    pinnedPreviews.clear();
    failed.clear();
    interruptBackground();
    emit();
    kick();
  }
  const resize = () => { clearLater(resizeTimer); resizeTimer = later(refresh, 160); };
  const online = () => { failed.clear(); kick(); };
  page?.addEventListener?.('visibilitychange', visibilityChanged);
  env.addEventListener?.('resize', resize);
  env.addEventListener?.('online', online);

  return {
    getPreviewSrc, getOriginalSrc, getCachedPreviewSrc,
    isPreviewReady: (photo) => Boolean(getCachedPreviewSrc(photo)),
    notifyPreviewLoaded,
    coverSettled: (photoOrId, url, image) => notifyPreviewLoaded(photoOrId, url || getPreviewSrc(typeof photoOrId === 'string' ? photosById.get(photoOrId) : photoOrId, { cover: true }), image),
    animationStarted, animationFinished, enterCollection, transitionFinished,
    loadOriginal, closePhoto, refresh, snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      interruptBackground();
      cancelForeground();
      clearLater(resizeTimer);
      page?.removeEventListener?.('visibilitychange', visibilityChanged);
      env.removeEventListener?.('resize', resize);
      env.removeEventListener?.('online', online);
      listeners.clear();
      decodedPreviews.clear();
      pinnedPreviews.clear();
    },
  };
}
