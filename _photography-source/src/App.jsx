import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Aperture as ApertureIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Aperture from './Aperture.jsx';
import { collections as defaultCollections } from './data/galleryData.generated.js';
import { createLoadingCoordinator } from './loading.js';

const base = import.meta.env.BASE_URL;
const asset = (path = '') => `${base}${path.replace(/^\//, '')}`;
const preventPhotoAction = (event) => event.preventDefault();
const photoGuards = { onContextMenu: preventPhotoAction, onDragStart: preventPhotoAction, onCopy: preventPhotoAction, onCut: preventPhotoAction };

function Photo({ photo, loader, canLoad, prepared = false, cover = false, eager = false }) {
  const image = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [loadedSource, setLoadedSource] = useState(null);
  const warmed = !canLoad && prepared && loader.isPreviewReady(photo);
  const active = (canLoad && (cover || eager || nearViewport)) || warmed;
  const source = loader.getPreviewSrc(photo, { cover });

  useEffect(() => { if (warmed) setNearViewport(true); }, [warmed]);

  useEffect(() => {
    if (!canLoad || cover || eager || nearViewport) return undefined;
    if (!('IntersectionObserver' in window)) { setNearViewport(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: '200px 0px' });
    observer.observe(image.current);
    return () => observer.disconnect();
  }, [canLoad, cover, eager, nearViewport]);

  const ready = (event) => {
    const element = event.currentTarget;
    const url = element.currentSrc || source;
    const decoded = element.decode ? element.decode().catch(() => {}) : Promise.resolve();
    decoded.then(() => { setLoadedSource(url); loader.notifyPreviewLoaded(photo, url); });
  };

  return <img ref={image} className={`portfolio-photo${active && loadedSource === source ? '' : ' is-waiting'}`}
    data-photo-id={photo.id}
    draggable={false} {...photoGuards} src={active ? source : undefined}
    width={photo.width} height={photo.height} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    loading="eager" fetchPriority={cover || eager ? 'high' : 'auto'} decoding="async"
    onLoad={ready} alt={!active || cover ? '' : photo.alt ?? photo.title} />;
}

export default function App({ collections = defaultCollections }) {
  const collectionFromHash = () => collections.find((item) => `#${item.id}` === window.location.hash) ?? null;
  const [collection, setCollection] = useState(collectionFromHash);
  const [photoIndex, setPhotoIndex] = useState(null);
  const [apertureDone, setApertureDone] = useState(false);
  const [entryPrepared, setEntryPrepared] = useState(() => new Set());
  const [apertureReady, setApertureReady] = useState(false);
  const loader = useMemo(() => {
    const coordinator = createLoadingCoordinator(collections, { asset });
    const initialCollection = collectionFromHash()?.id ?? null;
    coordinator.enterCollection(initialCollection);
    coordinator.transitionFinished(initialCollection);
    return coordinator;
  }, [collections]);
  const cleanupTimer = useRef(null);
  const transitionTimer = useRef(null);
  const apertureStarted = useCallback(() => { setApertureDone(false); loader.animationStarted(); }, [loader]);
  const apertureFinished = useCallback(() => { setApertureDone(true); loader.animationFinished(); }, [loader]);
  const heading = useRef(null);
  const returningTo = useRef(null);
  const navigating = useRef(false);

  useEffect(() => {
    let obsolete = false;
    let frame;
    const candidates = [...document.querySelectorAll('.cover-image img, .gallery-photo img')]
      .map((image) => ({ id: image.dataset.photoId, rect: image.getBoundingClientRect() }));
    const visible = candidates.filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight + 100)
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    const photoIds = (visible.length ? visible : candidates).slice(0, 4).map(({ id }) => id);
    loader.prepareEntry({ photoIds, cover: !collection, budgetMs: 320 }).catch(() => ({ readyPhotoIds: [] })).then((result) => {
      if (obsolete) return;
      setEntryPrepared(new Set(result.readyPhotoIds));
      // Let already-decoded previews mount behind the closed iris before it moves.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { if (!obsolete) setApertureReady(true); }); });
    });
    return () => { obsolete = true; cancelAnimationFrame(frame); };
  }, [loader]);

  useEffect(() => {
    const sync = () => {
      const nextCollection = collectionFromHash();
      loader.enterCollection(nextCollection?.id ?? null);
      setCollection(nextCollection);
      setPhotoIndex(null);
      navigating.current = true;
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [loader]);

  useEffect(() => {
    window.clearTimeout(cleanupTimer.current);
    return () => { cleanupTimer.current = window.setTimeout(() => loader.destroy(), 0); };
  }, [loader]);

  useEffect(() => {
    if (!apertureDone) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    transitionTimer.current = window.setTimeout(() => loader.transitionFinished(collection?.id ?? null), reducedMotion ? 0 : 460);
    return () => window.clearTimeout(transitionTimer.current);
  }, [collection, apertureDone, loader]);

  useEffect(() => {
    document.title = collection ? `${collection.title} — Canoe Photography` : 'Canoe — Photography';
    if (navigating.current) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => {
        if (!collection && returningTo.current) {
          document.getElementById(`cover-${returningTo.current}`)?.focus();
        } else heading.current?.focus({ preventScroll: true });
      });
    }
  }, [collection]);

  function openCollection(item) {
    returningTo.current = item.id;
    loader.enterCollection(item.id);
    window.location.hash = item.id;
  }

  function home(event) {
    event?.preventDefault();
    if (collection) { loader.enterCollection(null); window.location.hash = ''; }
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const nextCollection = collection ? collections[(collections.indexOf(collection) + 1) % collections.length] : null;

  return <>
    <Aperture brand="Canoe" ready={apertureReady} onStart={apertureStarted} onComplete={apertureFinished} />
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to photographs</a>
    <header className="site-header page-width" inert={!apertureDone}>
      <a className="brand" href={base} onClick={home} aria-label="Canoe photography home">
        <ApertureIcon size={23} strokeWidth={1.25} aria-hidden="true" /><span>Canoe</span>
      </a>
    </header>

    <main id="main-content" className="page-width" tabIndex={-1} inert={!apertureDone} aria-busy={!apertureDone}>
      {collection ? <section className="collection-page" key={collection.id} aria-labelledby="collection-title" onAnimationEnd={(event) => { if (event.target === event.currentTarget) loader.transitionFinished(collection.id); }}>
        <a href={base} onClick={home} className="back-link" aria-label="Back to all sets"><ArrowLeft size={22} strokeWidth={1.25} /></a>
        <h1 className="collection-title" ref={heading} tabIndex={-1} id="collection-title">{collection.title}</h1>
        <div className={`photo-gallery ${collection.count <= 2 ? 'photo-gallery--pair' : ''} ${collection.count === 1 ? 'photo-gallery--single' : ''}`}
          style={{ '--gallery-min-ratio': Math.min(...collection.photos.map((photo) => photo.width / photo.height)) }}>
          {collection.photos.map((photo, index) => <button className="gallery-photo" key={photo.id}
            {...photoGuards}
            type="button" aria-label={`View ${collection.title}, photograph ${index + 1} of ${collection.count}`}
            onClick={() => setPhotoIndex(index)}>
            <Photo photo={photo} loader={loader} canLoad={apertureDone} prepared={entryPrepared.has(photo.id)} eager={index < 2} />
          </button>)}
        </div>
        {nextCollection && collections.length > 1 && <a className="next-set" href={`#${nextCollection.id}`} aria-label={`Next set: ${nextCollection.title}`} onClick={() => { returningTo.current = nextCollection.id; loader.enterCollection(nextCollection.id); }}>
          <ArrowRight size={26} strokeWidth={1.25} />
        </a>}
      </section> : <section className="home-page" aria-labelledby="page-title">
        <h1 className="sr-only" id="page-title" ref={heading} tabIndex={-1}>Canoe photography portfolio</h1>
        <div className="collection-grid" aria-label="Photography sets">
          {collections.map((item, index) => <a className="collection-cover" id={`cover-${item.id}`} key={item.id}
            {...photoGuards}
            href={`#${item.id}`} onClick={(event) => { event.preventDefault(); openCollection(item); }}
            aria-label={`Open ${item.title}, ${item.count} photographs`}>
            <span className="cover-image"><Photo photo={item.coverPhoto ?? item.photos[0]} loader={loader} canLoad={apertureDone} prepared={entryPrepared.has((item.coverPhoto ?? item.photos[0]).id)} cover eager={index < 2} />
              <span className="cover-title-bar"><span className="cover-title">{item.title}</span><span className="cover-arrow"><ArrowUpRight size={24} strokeWidth={1.2} /></span></span>
            </span>
          </a>)}
        </div>
        {!collections.length && <p className="empty-message">Photographs coming soon.</p>}
      </section>}
    </main>

    <footer className="site-footer page-width"><span>© {new Date().getFullYear()} Canoe. All rights reserved.</span></footer>

    {collection && photoIndex !== null && <Lightbox collection={collection} index={photoIndex} loader={loader}
      onClose={() => { loader.closePhoto(); setPhotoIndex(null); }} onChange={setPhotoIndex} />}
  </>;
}

function useModal(dialogRef, onClose) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = oldOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, []);
  return (event) => { event.preventDefault(); onClose(); };
}

function Lightbox({ collection, index, loader, onClose, onChange }) {
  const dialog = useRef(null);
  const touch = useRef(null);
  const cancel = useModal(dialog, onClose);
  const photo = collection.photos[index];
  const [resolvedOriginal, setResolvedOriginal] = useState(null);
  const [originalFailed, setOriginalFailed] = useState(false);
  const original = resolvedOriginal?.id === photo.id ? resolvedOriginal.src : null;
  const preview = loader.getCachedPreviewSrc(photo) || loader.getPreviewSrc(photo);
  const move = (direction) => onChange((index + direction + collection.count) % collection.count);

  useEffect(() => {
    let obsolete = false;
    let frame;
    setOriginalFailed(false);
    loader.loadOriginal(photo).then((src) => {
      if (obsolete) return;
      frame = requestAnimationFrame(() => { if (!obsolete) setResolvedOriginal({ id: photo.id, src }); });
    }).catch((error) => {
      if (!obsolete && error.name !== 'AbortError') setOriginalFailed(true);
    });
    return () => { obsolete = true; cancelAnimationFrame(frame); };
  }, [photo.id, loader]);

  useEffect(() => () => loader.closePhoto(), [loader]);

  return <dialog ref={dialog} className="lightbox" aria-label={`${collection.title} photograph viewer`} onCancel={cancel}
    onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } }}>
    <div className="lightbox-top"><button className="lightbox-close" onClick={onClose} aria-label="Close photograph"><X size={23} strokeWidth={1.2} /></button></div>
    <div className="lightbox-stage" {...photoGuards} aria-busy={!original && !originalFailed}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onTouchStart={(event) => { touch.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => { if (touch.current === null) return; const delta = event.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 55) move(delta > 0 ? -1 : 1); touch.current = null; }}>
      <img className="portfolio-photo lightbox-preview" {...photoGuards} draggable={false} src={preview} alt={original ? '' : photo.alt ?? photo.title} decoding="async" fetchPriority="high" />
      {original && <img key={photo.id} className="portfolio-photo lightbox-original" {...photoGuards} draggable={false} src={original} alt={photo.alt ?? photo.title} decoding="sync" />}
      {originalFailed && <span className="lightbox-status" role="status">Original could not load. Showing preview.</span>}
    </div>
    <div className="lightbox-bottom"><button onClick={() => move(-1)} aria-label="Previous photograph"><ChevronLeft size={23} strokeWidth={1.25} /></button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">Photograph {index + 1} of {collection.count}</span>
      <button onClick={() => move(1)} aria-label="Next photograph"><ChevronRight size={23} strokeWidth={1.25} /></button></div>
  </dialog>;
}
