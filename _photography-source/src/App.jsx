import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Aperture as ApertureIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Aperture from './Aperture.jsx';
import { collections as defaultCollections } from './data/galleryData.generated.js';

const base = import.meta.env.BASE_URL;
const asset = (path = '') => `${base}${path.replace(/^\//, '')}`;
const srcSet = (photo) => photo.variants?.map((variant) => `${asset(variant.src)} ${variant.width}w`).join(', ');

function Photo({ photo, cover = false, eager = false, full = false, ...props }) {
  return <img src={asset(full ? photo.fullSrc ?? photo.src : photo.src)}
    srcSet={full ? undefined : srcSet(photo)}
    sizes={full ? undefined : '(max-width: 700px) 100vw, 50vw'}
    width={photo.width} height={photo.height} loading={eager ? 'eager' : 'lazy'}
    fetchPriority={eager ? 'high' : 'auto'} decoding="async"
    alt={cover ? '' : photo.alt ?? photo.title} {...props} />;
}

export default function App({ collections = defaultCollections }) {
  const collectionFromHash = () => collections.find((item) => `#${item.id}` === window.location.hash) ?? null;
  const [collection, setCollection] = useState(collectionFromHash);
  const [photoIndex, setPhotoIndex] = useState(null);
  const heading = useRef(null);
  const returningTo = useRef(null);
  const navigating = useRef(false);

  useEffect(() => {
    const sync = () => {
      setCollection(collectionFromHash());
      setPhotoIndex(null);
      navigating.current = true;
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

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
    window.location.hash = item.id;
  }

  function home(event) {
    event?.preventDefault();
    if (collection) window.location.hash = '';
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const nextCollection = collection ? collections[(collections.indexOf(collection) + 1) % collections.length] : null;

  return <>
    <Aperture brand="Canoe" />
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to photographs</a>
    <header className="site-header page-width">
      <a className="brand" href={base} onClick={home} aria-label="Canoe photography home">
        <ApertureIcon size={23} strokeWidth={1.25} aria-hidden="true" /><span>Canoe</span>
      </a>
    </header>

    <main id="main-content" className="page-width" tabIndex={-1}>
      {collection ? <section className="collection-page" key={collection.id} aria-labelledby="collection-title">
        <a href={base} onClick={home} className="back-link" aria-label="Back to all sets"><ArrowLeft size={22} strokeWidth={1.25} /></a>
        <h1 className="collection-title" ref={heading} tabIndex={-1} id="collection-title">{collection.title}</h1>
        <div className={`photo-gallery ${collection.count <= 2 ? 'photo-gallery--pair' : ''}`}>
          {collection.photos.map((photo, index) => <button className="gallery-photo" key={photo.id}
            type="button" aria-label={`View ${collection.title}, photograph ${index + 1} of ${collection.count}`}
            onClick={() => setPhotoIndex(index)}>
            <Photo photo={photo} eager={index < 2} />
          </button>)}
        </div>
        {nextCollection && collections.length > 1 && <a className="next-set" href={`#${nextCollection.id}`} aria-label={`Next set: ${nextCollection.title}`} onClick={() => { returningTo.current = nextCollection.id; }}>
          <ArrowRight size={26} strokeWidth={1.25} />
        </a>}
      </section> : <section className="home-page" aria-labelledby="page-title">
        <h1 className="sr-only" id="page-title" ref={heading} tabIndex={-1}>Canoe photography portfolio</h1>
        <div className="collection-grid" aria-label="Photography sets">
          {collections.map((item, index) => <a className="collection-cover" id={`cover-${item.id}`} key={item.id}
            href={`#${item.id}`} onClick={(event) => { event.preventDefault(); openCollection(item); }}
            aria-label={`Open ${item.title}, ${item.count} photographs`}>
            <span className="cover-image"><Photo photo={item.coverPhoto ?? item.photos[0]} cover eager={index < 2} />
              <span className="cover-title-bar"><span className="cover-title">{item.title}</span><span className="cover-arrow"><ArrowUpRight size={24} strokeWidth={1.2} /></span></span>
            </span>
          </a>)}
        </div>
        {!collections.length && <p className="empty-message">Photographs coming soon.</p>}
      </section>}
    </main>

    <footer className="site-footer page-width"><span>© {new Date().getFullYear()} Canoe. All rights reserved.</span></footer>

    {collection && photoIndex !== null && <Lightbox collection={collection} index={photoIndex}
      onClose={() => setPhotoIndex(null)} onChange={setPhotoIndex} />}
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

function Lightbox({ collection, index, onClose, onChange }) {
  const dialog = useRef(null);
  const touch = useRef(null);
  const cancel = useModal(dialog, onClose);
  const photo = collection.photos[index];
  const move = (direction) => onChange((index + direction + collection.count) % collection.count);
  useEffect(() => {
    const next = collection.photos[(index + 1) % collection.count];
    const image = new window.Image();
    image.src = asset(next.fullSrc ?? next.src);
  }, [index, collection]);
  return <dialog ref={dialog} className="lightbox" aria-label={`${collection.title} photograph viewer`} onCancel={cancel}
    onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } }}>
    <div className="lightbox-top"><button className="lightbox-close" onClick={onClose} aria-label="Close photograph"><X size={23} strokeWidth={1.2} /></button></div>
    <div className="lightbox-stage" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onTouchStart={(event) => { touch.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => { if (touch.current === null) return; const delta = event.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 55) move(delta > 0 ? -1 : 1); touch.current = null; }}>
      <Photo key={photo.id} photo={photo} full eager />
    </div>
    <div className="lightbox-bottom"><button onClick={() => move(-1)} aria-label="Previous photograph"><ChevronLeft size={23} strokeWidth={1.25} /></button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">Photograph {index + 1} of {collection.count}</span>
      <button onClick={() => move(1)} aria-label="Next photograph"><ChevronRight size={23} strokeWidth={1.25} /></button></div>
  </dialog>;
}

