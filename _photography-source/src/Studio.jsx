import { useEffect, useRef, useState } from 'react';
import { Aperture, ArrowLeft, ArrowUpRight, Check, CheckCircle2, ImagePlus, LoaderCircle, LockKeyhole, Plus, Upload, X } from 'lucide-react';
import './studio.css';

const MAX_FILES = 30;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;
const IMAGE_WIDTHS = [600, 1200, 2000];
const EXTENSIONS = /\.(jpe?g|png|webp|avif)$/i;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const makeRequestId = () => crypto.randomUUID();

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('The private studio is not running. Open Canoe Studio on this Mac and try again.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || `The studio could not complete that request (${response.status}).`);
  return data;
}

async function openImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* Try the browser image decoder below. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`“${file.name}” could not be opened. Try exporting it as JPG, PNG, WebP, or AVIF.`);
  }
}

function webpBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.type !== 'image/webp') reject(new Error('This browser cannot create WebP images. Open the studio in a current version of Chrome or Safari.'));
    else resolve(blob);
  }, 'image/webp', 0.86));
}

function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('A photograph could not be read. Please try again.'));
    reader.readAsDataURL(blob);
  });
}

async function preparePhoto(item, title, index, budget) {
  const image = await openImage(item.file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) { image.close?.(); throw new Error('Your browser could not prepare the photographs. Please reload the studio.'); }
  try {
    const width = image.width;
    const height = image.height;
    if (!width || !height) throw new Error(`“${item.file.name}” has no readable image dimensions.`);
    const variants = [];
    const sizes = [...new Set(IMAGE_WIDTHS.map((size) => Math.min(width, size)))];
    for (const targetWidth of sizes) {
      const targetHeight = Math.max(1, Math.round(height * targetWidth / width));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image.source || image, 0, 0, targetWidth, targetHeight);
      const blob = await webpBlob(canvas);
      if (blob.size > 3 * 1024 * 1024) throw new Error(`“${item.file.name}” is too large to prepare. Try exporting a smaller copy.`);
      budget.bytes += blob.size;
      if (budget.bytes > MAX_OUTPUT_BYTES) throw new Error('This set is too large after preparation. Remove a few photographs and publish them as a separate set.');
      variants.push({ width: targetWidth, height: targetHeight, base64: await blobBase64(blob) });
    }
    return {
      filename: item.file.name,
      alt: item.alt.trim() || `${title}, photograph ${index + 1}`,
      width,
      height,
      variants,
    };
  } finally {
    image.close?.();
    canvas.width = 1;
    canvas.height = 1;
  }
}

export default function Studio() {
  const [session, setSession] = useState(null);
  const [connection, setConnection] = useState('loading');
  const [connectionError, setConnectionError] = useState('');
  const [existing, setExisting] = useState([]);
  const [title, setTitle] = useState('');
  const [photos, setPhotos] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(null);
  const [success, setSuccess] = useState(null);
  const input = useRef(null);
  const urls = useRef(new Set());
  const requestId = useRef(makeRequestId());
  const submitLock = useRef(false);
  const busy = Boolean(stage);
  const cover = photos.find((photo) => photo.id === coverId) || photos[0];
  const canPublish = connection === 'ready' && !session?.pending && title.trim().length > 0 && photos.length > 0 && !busy;
  const publicUrl = session?.publicUrl || 'https://jasonfan06.github.io/photography/';

  useEffect(() => {
    document.title = 'Canoe Studio';
    const controller = new AbortController();
    async function connect() {
      try {
        const current = await readJson(await fetch('/api/session', { signal: controller.signal, cache: 'no-store' }));
        if (!current.token) throw new Error('Open the private Canoe Studio on this Mac to upload photographs.');
        const data = await readJson(await fetch('/api/gallery', {
          signal: controller.signal, cache: 'no-store', headers: { 'X-Canoe-Token': current.token },
        }));
        setSession(current);
        setExisting(Array.isArray(data.collections) ? data.collections : []);
        setConnection('ready');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setConnection('unavailable');
        setConnectionError(err.message || 'The private studio could not connect. Please reopen Canoe Studio on this Mac.');
      }
    }
    connect();
    return () => controller.abort();
  }, []);

  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    if ((!photos.length && !title.trim() && !busy) || success) return undefined;
    const protectDraft = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [photos.length, title, success, busy]);

  function addFiles(list) {
    if (busy || success) return;
    setDragging(false);
    setError('');
    const files = [...list];
    if (!files.length) return;
    const unsupported = files.find((file) => !EXTENSIONS.test(file.name));
    if (unsupported) { setError(`“${unsupported.name}” is not supported. Choose JPG, PNG, WebP, or AVIF photographs.`); return; }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) { setError(`“${oversized.name}” is larger than 50 MB. Choose a smaller copy.`); return; }
    const fingerprints = new Set(photos.map((photo) => photo.fingerprint));
    const unique = files.filter((file) => {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (fingerprints.has(fingerprint)) return false;
      fingerprints.add(fingerprint);
      return true;
    });
    if (photos.length + unique.length > MAX_FILES) { setError('A set can contain up to 30 photographs. Choose fewer files or create another set.'); return; }
    const additions = unique.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { id: crypto.randomUUID(), file, url, alt: '', fingerprint: `${file.name}:${file.size}:${file.lastModified}` };
    });
    if (!additions.length) { setError('Those photographs are already in this set.'); return; }
    setPhotos((current) => [...current, ...additions]);
    if (!coverId) setCoverId(additions[0].id);
    requestId.current = makeRequestId();
  }

  function removePhoto(id) {
    const photo = photos.find((item) => item.id === id);
    if (photo) { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); }
    const remaining = photos.filter((item) => item.id !== id);
    setPhotos(remaining);
    if (coverId === id) setCoverId(remaining[0]?.id || null);
    setError('');
    requestId.current = makeRequestId();
  }

  function newDraft() {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
    setPhotos([]);
    setCoverId(null);
    setTitle('');
    setError('');
    setSuccess(null);
    requestId.current = makeRequestId();
  }

  function finishPublishing(result, fallbackTitle) {
    setSuccess({ ...result, title: result.collection?.title || fallbackTitle });
    setSession((current) => ({ ...current, pending: null }));
    if (result.collection) setExisting((current) => [...current.filter((item) => item.id !== result.collection.id), result.collection]);
  }

  async function resumePublishing() {
    if (!session?.pending || busy || submitLock.current) return;
    submitLock.current = true;
    setError('');
    setStage({ phase: 'resuming' });
    try {
      const result = await readJson(await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Canoe-Token': session.token },
        body: '{}',
      }));
      finishPublishing(result, session.pending.title);
    } catch (err) {
      setError(err.message || 'Publishing could not be resumed. Your saved set is still here; please try again.');
    } finally {
      setStage(null);
      submitLock.current = false;
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (!canPublish || submitLock.current) return;
    submitLock.current = true;
    setError('');
    const name = title.trim();
    const budget = { bytes: 0 };
    let submitted = false;
    try {
      const prepared = [];
      for (let index = 0; index < photos.length; index += 1) {
        setStage({ phase: 'preparing', current: index, total: photos.length, detail: photos[index].file.name });
        prepared.push(await preparePhoto(photos[index], name, index, budget));
        setStage({ phase: 'preparing', current: index + 1, total: photos.length, detail: photos[index].file.name });
      }
      setStage({ phase: 'publishing', total: photos.length, bytes: budget.bytes });
      let response;
      try {
        submitted = true;
        response = await fetch('/api/sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Canoe-Token': session.token },
          body: JSON.stringify({ title: name, photos: prepared, coverIndex: Math.max(0, photos.findIndex((photo) => photo.id === cover?.id)), requestId: requestId.current }),
        });
      } catch {
        throw new Error('The connection ended before publishing could be confirmed. Check your portfolio before retrying; the studio will reuse this draft’s publishing request.');
      }
      const result = await readJson(response);
      finishPublishing(result, name);
    } catch (err) {
      setError(err.message || 'The set could not be published. Your draft is still here; please try again.');
      if (submitted) {
        try {
          const latest = await readJson(await fetch('/api/session', { cache: 'no-store' }));
          setSession((current) => ({ ...current, pending: latest.pending || null }));
        } catch { /* The draft remains available if the local connection is down. */ }
      }
    } finally {
      setStage(null);
      submitLock.current = false;
    }
  }

  return <div className="studio-shell">
    <header className="studio-header">
      <a href="/" className="studio-brand" aria-label="View the Canoe portfolio"><Aperture size={24} strokeWidth={1.2} /><span>Canoe</span><small>Studio</small></a>
      <span className="studio-private"><LockKeyhole size={12} strokeWidth={1.5} /> Private on this Mac</span>
    </header>
    <main className="studio-main">
      <div className="studio-intro"><a className="studio-portfolio-link" href="/"><ArrowLeft size={14} /> View portfolio</a><h1>Create a set</h1><p>Add photographs, choose a cover, then publish.</p></div>
      {session?.pending && !success && <section className="studio-pending" aria-labelledby="studio-pending-title">
        <div><h2 id="studio-pending-title">A previous set is waiting to publish</h2><p><strong>{session.pending.title}</strong>{session.pending.count ? ` · ${session.pending.count} ${session.pending.count === 1 ? 'photograph' : 'photographs'}` : ''}</p><p>Resume this saved set before publishing a new one.</p></div>
        <button className="studio-primary" type="button" disabled={busy} onClick={resumePublishing}>{stage?.phase === 'resuming' ? <><LoaderCircle className="studio-spinner" size={15} /> Resuming publishing</> : <><Upload size={15} /> Resume publishing</>}</button>
        {error && <div className="studio-error" role="alert">{error}</div>}
      </section>}
      {connection === 'unavailable' ? <section className="studio-unavailable" role="alert"><LockKeyhole size={28} strokeWidth={1.2} /><h2>Open your private studio</h2><p>{connectionError}</p><button className="studio-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></section> : success ? <section className="studio-success" aria-labelledby="studio-success-title">
        <div className="studio-success-icon"><CheckCircle2 size={34} strokeWidth={1.2} /></div><p className="studio-eyebrow">Sent to GitHub</p><h2 id="studio-success-title">{success.title}</h2><p>Your set has been submitted. GitHub Pages is updating your portfolio; this can take a few minutes.</p>
        <div className="studio-success-actions"><a className="studio-primary" href={success.url || `${publicUrl}#${success.collection?.id || ''}`} target="_blank" rel="noreferrer">View set <ArrowUpRight size={17} /></a><button className="studio-secondary" type="button" onClick={newDraft}><Plus size={16} /> Create another set</button></div>
      </section> : <form className="studio-editor" onSubmit={publish} aria-busy={busy}>
        <div className="studio-editor-main">
          <label className="studio-field studio-set-name"><span>Set name</span><input value={title} onChange={(event) => { setTitle(event.target.value); requestId.current = makeRequestId(); }} disabled={busy} placeholder="A name for these photographs" maxLength={100} autoComplete="off" required /></label>
          <div className={`studio-dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-disabled' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} role="group" aria-label="Upload photographs">
            <input className="studio-file-input" ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" multiple disabled={busy} tabIndex={-1} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} aria-label="Choose photographs" />
            <Upload size={28} strokeWidth={1.1} /><h2>Drop your photographs here</h2><p>JPG, PNG, WebP, or AVIF · up to 30 photos</p><button className="studio-secondary" type="button" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={16} /> Choose photographs</button>
          </div>
          {error && !session?.pending && <div className="studio-error" role="alert">{error}</div>}
          {photos.length > 0 && <><div className="studio-photo-list-heading"><h2>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</h2><p>Select a photograph to use as the set cover.</p></div><div className="studio-photo-grid">
            {photos.map((photo, index) => <article className={`studio-photo-card${cover?.id === photo.id ? ' is-cover' : ''}`} key={photo.id}>
              <div className="studio-photo-image"><label className="studio-cover-target" aria-label={`Use ${photo.file.name} as cover`}><input className="studio-cover-input" type="radio" name="studio-cover" checked={cover?.id === photo.id} disabled={busy} onChange={() => { setCoverId(photo.id); requestId.current = makeRequestId(); }} /><img src={photo.url} alt={`Preview of ${photo.file.name}`} loading="lazy" /><span className="studio-cover-label">{cover?.id === photo.id ? <><Check size={13} /> Cover</> : 'Use as cover'}</span></label><button className="studio-remove-photo" type="button" disabled={busy} onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.file.name}`}><X size={15} /></button></div>
              <div className="studio-photo-details"><p title={photo.file.name}><span>{String(index + 1).padStart(2, '0')}</span>{photo.file.name}</p><label className="studio-field studio-alt-field"><span>Image description <small>(optional)</small></span><input value={photo.alt} onChange={(event) => { setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, alt: event.target.value } : item)); requestId.current = makeRequestId(); }} disabled={busy} maxLength={300} placeholder="Describe what is in the photo" /></label></div>
            </article>)}
          </div></>}
        </div>
        <aside className="studio-publish-panel" aria-label="Set preview and publishing">
          <p className="studio-eyebrow">Your set</p><div className={`studio-cover-preview${cover ? '' : ' is-empty'}`}>{cover ? <img src={cover.url} alt="Selected set cover" /> : <Aperture size={36} strokeWidth={0.8} />}</div><h2 className={title.trim() ? '' : 'is-placeholder'}>{title.trim() || 'Untitled set'}</h2><p className="studio-publish-count">{photos.length ? `${photos.length} ${photos.length === 1 ? 'photograph' : 'photographs'}` : 'No photographs yet'}</p>
          <p className="studio-publish-note">Your photos will be prepared for the web. Originals on your Mac stay unchanged.</p>
          <button className="studio-primary studio-publish-button" type="submit" disabled={!canPublish}>{busy ? <><LoaderCircle className="studio-spinner" size={16} /> {stage.phase === 'preparing' ? 'Preparing photographs' : 'Publishing set'}</> : <><Upload size={16} /> Publish set</>}</button>
          <div className="studio-progress" role="status" aria-live="polite">{connection === 'loading' ? <p><LoaderCircle className="studio-spinner" size={12} /> Connecting to your studio…</p> : stage?.phase === 'preparing' ? <><progress value={stage.current} max={stage.total} aria-label="Preparing photographs" /><p>{stage.current} of {stage.total} prepared</p></> : stage?.phase === 'publishing' ? <><progress aria-label="Uploading and publishing" /><p>Uploading {mb(stage.bytes)} and sending your set to GitHub. Keep this window open.</p></> : stage?.phase === 'resuming' ? <><progress aria-label="Resuming publishing" /><p>Sending your saved set to GitHub. Keep this window open.</p></> : session?.pending ? <p>Resume the saved set above before publishing a new one.</p> : <p>Publishes to your existing portfolio.</p>}</div>
        </aside>
      </form>}
      {existing.length > 0 && <section className="studio-existing" aria-labelledby="studio-existing-title"><div className="studio-section-heading"><h2 id="studio-existing-title">Published sets</h2><span>{existing.length} sets</span></div><div className="studio-existing-grid">{existing.map((collection) => <a key={collection.id} href={`${publicUrl}#${collection.id}`} target="_blank" rel="noreferrer"><span>{collection.title}</span><ArrowUpRight size={15} strokeWidth={1.25} /></a>)}</div></section>}
    </main>
    <footer className="studio-footer">Canoe Studio <span>Only available on this Mac</span></footer>
  </div>;
}
