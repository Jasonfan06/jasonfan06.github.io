import { useEffect, useRef, useState } from 'react';
import { Aperture, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, CheckCircle2, GripVertical, ImagePlus, LoaderCircle, LockKeyhole, Pencil, Plus, RefreshCw, Upload, X } from 'lucide-react';
import CoverCrop, { DEFAULT_CROP } from './CoverCrop.jsx';
import './studio.css';

const MAX_FILES = 30;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
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

async function photoDimensions(file) {
  const image = await openImage(file);
  try {
    if (!image.width || !image.height) throw new Error(`“${file.name}” has no readable image dimensions.`);
    return { width: image.width, height: image.height };
  } finally {
    image.close?.();
  }
}

function photoContentType(file) {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) return file.type;
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' }[extension] || 'application/octet-stream';
}

const snapshot = (title, photos, coverId, crop) => JSON.stringify([title, photos.map((photo) => [photo.id, photo.alt]), coverId, crop]);
const localAsset = (value) => `/${value.replace(/^\//, '')}`;

export default function Studio() {
  const [session, setSession] = useState(null);
  const [connection, setConnection] = useState('loading');
  const [connectionError, setConnectionError] = useState('');
  const [existing, setExisting] = useState([]);
  const [revisions, setRevisions] = useState({});
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [photos, setPhotos] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [crop, setCrop] = useState({ ...DEFAULT_CROP });
  const [dragging, setDragging] = useState(false);
  const [dragPhotoId, setDragPhotoId] = useState(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(null);
  const [success, setSuccess] = useState(null);
  const input = useRef(null);
  const editor = useRef(null);
  const urls = useRef(new Set());
  const requestId = useRef(makeRequestId());
  const submitLock = useRef(false);
  const baseline = useRef(snapshot('', [], null, DEFAULT_CROP));
  const busy = Boolean(stage);
  const locked = busy || Boolean(session?.pending);
  const dirty = snapshot(title, photos, coverId, crop) !== baseline.current;
  const cover = photos.find((photo) => photo.id === coverId) || photos[0];
  const canPublish = connection === 'ready' && !locked && title.trim().length > 0 && photos.length > 0 && (!editing || dirty);
  const publicUrl = session?.publicUrl || 'https://jasonfan06.github.io/photography/';
  const changed = () => { requestId.current = makeRequestId(); setError(''); };
  const changeCrop = (next) => { setCrop(next); changed(); };

  useEffect(() => {
    document.title = 'Canoe Studio';
    const controller = new AbortController();
    async function connect() {
      try {
        const current = await readJson(await fetch('/api/session', { signal: controller.signal, cache: 'no-store' }));
        if (!current.token) throw new Error('Open the private Canoe Studio on this Mac to manage photographs.');
        const data = await readJson(await fetch('/api/gallery', { signal: controller.signal, cache: 'no-store', headers: { 'X-Canoe-Token': current.token } }));
        setSession(current); setExisting(data.collections || []); setRevisions(data.revisions || {}); setConnection('ready');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setConnection('unavailable'); setConnectionError(err.message || 'The private studio could not connect. Reopen Canoe Studio on this Mac.');
      }
    }
    connect();
    return () => controller.abort();
  }, []);
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    if ((!dirty && !busy) || success) return undefined;
    const protectDraft = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [dirty, busy, success]);

  function clearUrls() { urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current.clear(); }
  function maySwitch() { return !dirty || success || window.confirm('Discard your unsaved changes?'); }
  function newDraft() {
    if (!maySwitch()) return;
    clearUrls(); setEditing(null); setPhotos([]); setCoverId(null); setCrop({ ...DEFAULT_CROP }); setTitle(''); setSuccess(null); changed();
    baseline.current = snapshot('', [], null, DEFAULT_CROP);
  }
  function editSet(collection, revision = revisions[collection.id]) {
    if (locked || !maySwitch()) return;
    if (!revision) { setError('Reload the published sets to open this set for editing.'); return; }
    clearUrls();
    const items = collection.photos.map((photo) => ({ id: photo.id, existingId: photo.id, filename: photo.filename || `${photo.title || 'Photograph'}.jpg`, alt: photo.alt || '', url: localAsset(photo.src), remoteUrl: `${publicUrl}${photo.src}`, width: photo.width, height: photo.height, fingerprint: `existing:${photo.id}` }));
    const selected = items.find((photo) => photo.id === collection.coverPhoto?.id)?.id || items[0]?.id || null;
    const position = { ...DEFAULT_CROP, ...collection.coverCrop };
    baseline.current = snapshot(collection.title, items, selected, position);
    setEditing({ id: collection.id, revision }); setTitle(collection.title); setPhotos(items); setCoverId(selected); setCrop(position); setSuccess(null); changed();
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function refreshSets() {
    if (locked) return;
    setStage({ phase: 'refreshing' }); setError('');
    try {
      const data = await readJson(await fetch('/api/gallery?refresh=1', { cache: 'no-store', headers: { 'X-Canoe-Token': session.token } }));
      setExisting(data.collections || []); setRevisions(data.revisions || {});
    } catch (err) { setError(err.message); }
    finally { setStage(null); }
  }
  function addFiles(list) {
    if (locked || success) return;
    setDragging(false); setError('');
    const files = [...list];
    if (!files.length) return;
    const unsupported = files.find((file) => !EXTENSIONS.test(file.name));
    if (unsupported) { setError(`“${unsupported.name}” is not supported. Choose JPG, PNG, WebP, or AVIF photographs.`); return; }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) { setError(`“${oversized.name}” is larger than 50 MB. Choose a smaller copy.`); return; }
    const fingerprints = new Set(photos.map((photo) => photo.fingerprint));
    const unique = files.filter((file) => { const value = `${file.name}:${file.size}:${file.lastModified}`; if (fingerprints.has(value)) return false; fingerprints.add(value); return true; });
    if (photos.length + unique.length > MAX_FILES) { setError('A set can contain up to 30 photographs. Choose fewer files or create another set.'); return; }
    const additions = unique.map((file) => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: crypto.randomUUID(), file, filename: file.name, url, alt: '', fingerprint: `${file.name}:${file.size}:${file.lastModified}` }; });
    if (!additions.length) { setError('Those photographs are already in this set.'); return; }
    setPhotos((current) => [...current, ...additions]);
    if (!coverId) { setCoverId(additions[0].id); setCrop({ ...DEFAULT_CROP }); }
    changed();
  }
  function removePhoto(id) {
    if (locked) return;
    const photo = photos.find((item) => item.id === id);
    if (photo && urls.current.has(photo.url)) { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); }
    const remaining = photos.filter((item) => item.id !== id);
    setPhotos(remaining);
    if (coverId === id) { setCoverId(remaining[0]?.id || null); setCrop({ ...DEFAULT_CROP }); }
    changed();
  }
  function movePhoto(id, destination) {
    if (locked) return;
    const current = photos.findIndex((photo) => photo.id === id);
    if (current < 0 || destination < 0 || destination >= photos.length || current === destination) return;
    const next = [...photos]; const [photo] = next.splice(current, 1); next.splice(destination, 0, photo); setPhotos(next); changed();
  }
  function finishPublishing(result, fallbackTitle) {
    setSuccess({ ...result, title: result.collection?.title || fallbackTitle, updated: Boolean(editing) });
    setSession((current) => ({ ...current, pending: null }));
    if (result.collection) {
      setExisting((current) => current.some((item) => item.id === result.collection.id) ? current.map((item) => item.id === result.collection.id ? result.collection : item) : [...current, result.collection]);
      setRevisions((current) => ({ ...current, [result.collection.id]: result.revision }));
    }
  }
  async function resumePublishing() {
    if (!session?.pending || busy || submitLock.current) return;
    submitLock.current = true; setError(''); setStage({ phase: 'resuming' });
    try {
      const result = await readJson(await fetch('/api/retry', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Canoe-Token': session.token }, body: '{}' }));
      finishPublishing(result, session.pending.title);
    } catch (err) { setError(err.message || 'Publishing could not be resumed. Your saved set is still here; please try again.'); await renewSession(); }
    finally { setStage(null); submitLock.current = false; }
  }
  async function renewSession() {
    try { const latest = await readJson(await fetch('/api/session', { cache: 'no-store' })); setSession((current) => ({ ...current, token: latest.token, pending: latest.pending || null })); }
    catch { /* Keep the draft if the local connection is down. */ }
  }
  async function publish(event) {
    event.preventDefault();
    if (!canPublish || submitLock.current) return;
    submitLock.current = true; setError('');
    const name = title.trim(); const draftRequestId = requestId.current;
    const additions = photos.filter((photo) => photo.file);
    const totalBytes = additions.reduce((total, item) => total + item.file.size, 0);
    let uploadedBytes = 0; let uploadedCount = 0;
    try {
      const uploaded = [];
      for (let index = 0; index < photos.length; index += 1) {
        const item = photos[index];
        const alt = item.alt.trim() || `${name}, photograph ${index + 1}`;
        if (item.existingId) { uploaded.push({ existingId: item.existingId, alt }); continue; }
        setStage({ phase: 'uploading', current: uploadedCount, total: additions.length, bytes: uploadedBytes, totalBytes });
        const dimensions = await photoDimensions(item.file);
        const upload = await readJson(await fetch(`/api/photos?requestId=${encodeURIComponent(draftRequestId)}&photoId=${encodeURIComponent(item.id)}`, { method: 'POST', headers: { 'Content-Type': photoContentType(item.file), 'X-Canoe-Token': session.token }, body: item.file }));
        if (!upload.uploadId) throw new Error(`“${item.filename}” could not be confirmed. Please try publishing again.`);
        uploaded.push({ uploadId: upload.uploadId, filename: item.filename, alt, ...dimensions });
        uploadedBytes += item.file.size; uploadedCount += 1;
        setStage({ phase: 'uploading', current: uploadedCount, total: additions.length, bytes: uploadedBytes, totalBytes });
      }
      setStage({ phase: 'publishing', bytes: uploadedBytes });
      const result = await readJson(await fetch(editing ? `/api/sets/${encodeURIComponent(editing.id)}` : '/api/sets', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Canoe-Token': session.token },
        body: JSON.stringify({ title: name, photos: uploaded, coverIndex: Math.max(0, photos.findIndex((photo) => photo.id === cover?.id)), coverCrop: crop, requestId: draftRequestId, ...(editing ? { baseRevision: editing.revision } : {}) }),
      }));
      finishPublishing(result, name);
    } catch (err) { setError(err.message || 'Publishing could not finish. Your draft is still here; please try again.'); await renewSession(); }
    finally { setStage(null); submitLock.current = false; }
  }
  const phaseLabel = stage?.phase === 'uploading' ? 'Uploading new originals' : stage?.phase === 'resuming' ? 'Resuming publishing' : stage?.phase === 'refreshing' ? 'Reloading sets' : editing ? 'Saving changes' : 'Publishing set';

  return <div className="studio-shell">
    <header className="studio-header">
      <a href="/" className="studio-brand" aria-label="View the Canoe portfolio"><Aperture size={24} strokeWidth={1.2} /><span>Canoe</span><small>Studio</small></a>
      <span className="studio-private"><LockKeyhole size={12} strokeWidth={1.5} /> Private on this Mac</span>
    </header>
    <main className="studio-main">
      <div className="studio-intro" ref={editor}>
        <a className="studio-portfolio-link" href="/"><ArrowLeft size={14} /> View portfolio</a>
        <div className="studio-editor-toolbar"><label className="studio-field"><span>Set to edit</span><select value={editing?.id || ''} disabled={locked || connection !== 'ready'} onChange={(event) => { const selected = existing.find((item) => item.id === event.target.value); if (selected) editSet(selected); else newDraft(); }}><option value="">Create a new set</option>{existing.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{editing && <button className="studio-secondary" type="button" disabled={locked} onClick={newDraft}><Plus size={14} /> New set</button>}</div>
        <h1>{editing ? 'Edit set' : 'Create a set'}</h1><p>{editing ? 'Add, remove, and reorder photographs. Frame your cover, then save your changes.' : 'Add photographs, choose a cover, then publish.'}</p>
        {editing && <p className="studio-edit-status">{dirty && !success ? 'Unsaved changes' : 'Editing the published set'} · Your set’s link stays the same.</p>}
      </div>
      {session?.pending && !success && <section className="studio-pending" aria-labelledby="studio-pending-title"><div><h2 id="studio-pending-title">A previous publication is waiting</h2><p><strong>{session.pending.title}</strong> · {session.pending.count} photographs</p><p>Resume the saved publication before making more changes.</p></div><button className="studio-primary" type="button" disabled={busy} onClick={resumePublishing}><Upload size={15} /> {busy ? phaseLabel : 'Resume publishing'}</button>{error && <div className="studio-error" role="alert">{error}</div>}</section>}
      {connection === 'unavailable' ? <section className="studio-unavailable" role="alert"><LockKeyhole size={28} strokeWidth={1.2} /><h2>Open your private studio</h2><p>{connectionError}</p><button className="studio-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></section> : success ? <section className="studio-success" aria-labelledby="studio-success-title">
        <div className="studio-success-icon"><CheckCircle2 size={34} strokeWidth={1.2} /></div><p className="studio-eyebrow">{success.updated ? 'Changes sent to GitHub' : 'Sent to GitHub'}</p><h2 id="studio-success-title">{success.title}</h2><p>Your {success.updated ? 'changes have' : 'set has'} been submitted. GitHub Pages is updating your portfolio; this can take a few minutes.</p>
        <div className="studio-success-actions"><a className="studio-primary" href={success.url} target="_blank" rel="noreferrer">View set <ArrowUpRight size={17} /></a><button className="studio-secondary" type="button" onClick={() => editSet(success.collection, success.revision)}><Pencil size={14} /> Edit this set</button><button className="studio-secondary" type="button" onClick={newDraft}><Plus size={16} /> New set</button></div>
      </section> : <form className="studio-editor" onSubmit={publish} aria-busy={busy}>
        <div className="studio-editor-main">
          <label className="studio-field studio-set-name"><span>Set name</span><input value={title} onChange={(event) => { setTitle(event.target.value); changed(); }} disabled={locked} placeholder="A name for these photographs" maxLength={100} autoComplete="off" required /></label>
          <div className={`studio-dropzone${photos.length ? ' is-compact' : ''}${dragging ? ' is-dragging' : ''}${locked ? ' is-disabled' : ''}`} onDragOver={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} role="group" aria-label="Upload photographs">
            <input className="studio-file-input" ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" multiple disabled={locked} tabIndex={-1} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} aria-label="Choose photographs" />
            <Upload size={28} strokeWidth={1.1} /><h2>{editing ? 'Add more photographs' : 'Drop your photographs here'}</h2><p>JPG, PNG, WebP, or AVIF · up to 30 photos per set</p><button className="studio-secondary" type="button" disabled={locked} onClick={() => input.current?.click()}><ImagePlus size={16} /> Choose photographs</button>
          </div>
          {error && !session?.pending && <div className="studio-error" role="alert">{error}</div>}
          {photos.length > 0 && <><div className="studio-photo-list-heading"><h2 aria-live="polite">{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</h2><p>Drag the handles or use arrows to reorder. Select a photo for the cover.</p></div><div className="studio-photo-grid">
            {photos.map((photo, index) => <article className={`studio-photo-card${cover?.id === photo.id ? ' is-cover' : ''}${dragPhotoId === photo.id ? ' is-reordering' : ''}`} key={photo.id} aria-label={`Photograph ${index + 1}: ${photo.filename}`}
              onDragOver={(event) => { if (dragPhotoId && !locked) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
              onDrop={(event) => { if (!dragPhotoId) return; event.preventDefault(); event.stopPropagation(); movePhoto(dragPhotoId, index); setDragPhotoId(null); }}>
              <div className="studio-photo-image"><label className="studio-cover-target" aria-label={`Use ${photo.filename} as cover`}><input className="studio-cover-input" type="radio" name="studio-cover" checked={cover?.id === photo.id} disabled={locked} onChange={() => { setCoverId(photo.id); setCrop({ ...DEFAULT_CROP }); changed(); }} /><img src={photo.url} alt={`Preview of ${photo.filename}`} draggable={false} loading="lazy" onError={(event) => { if (photo.remoteUrl && event.currentTarget.src !== photo.remoteUrl) event.currentTarget.src = photo.remoteUrl; }} /><span className="studio-cover-label">{cover?.id === photo.id ? <><Check size={13} /> Cover</> : 'Use as cover'}</span></label><button className="studio-remove-photo" type="button" disabled={locked} onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.filename}`}><X size={15} /></button></div>
              <div className="studio-photo-details"><p title={photo.filename}><span>{String(index + 1).padStart(2, '0')}</span>{photo.filename}</p>
                <div className="studio-order-controls"><button type="button" draggable={!locked} disabled={locked} aria-label={`Drag to reorder ${photo.filename}`} className="studio-drag-handle" onDragStart={(event) => { setDragPhotoId(photo.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-canoe-photo', photo.id); }} onDragEnd={() => setDragPhotoId(null)}><GripVertical size={15} /><span>Move</span></button><button type="button" disabled={locked || index === 0} onClick={() => movePhoto(photo.id, index - 1)} aria-label={`Move ${photo.filename} earlier`}><ArrowUp size={15} /></button><button type="button" disabled={locked || index === photos.length - 1} onClick={() => movePhoto(photo.id, index + 1)} aria-label={`Move ${photo.filename} later`}><ArrowDown size={15} /></button></div>
                <label className="studio-field studio-alt-field"><span>Image description <small>(optional)</small></span><input value={photo.alt} onChange={(event) => { setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, alt: event.target.value } : item)); changed(); }} disabled={locked} maxLength={300} placeholder="Describe what is in the photo" /></label>
              </div>
            </article>)}
          </div></>}
          {editing && !photos.length && <p className="studio-empty-edit" role="status">Add at least one photograph before saving this set.</p>}
        </div>
        <aside className="studio-publish-panel" aria-label="Set preview and publishing">
          <p className="studio-eyebrow">Your cover</p>{cover ? <CoverCrop key={cover.id} photo={cover} crop={crop} onChange={changeCrop} disabled={locked} /> : <div className="studio-cover-preview is-empty"><Aperture size={36} strokeWidth={0.8} /></div>}
          <h2 className={title.trim() ? '' : 'is-placeholder'}>{title.trim() || 'Untitled set'}</h2><p className="studio-publish-count">{photos.length ? `${photos.length} ${photos.length === 1 ? 'photograph' : 'photographs'}` : 'No photographs yet'}</p>
          <p className="studio-publish-note">Originals stay unchanged. The crop applies only to the set cover.</p>
          <button className="studio-primary studio-publish-button" type="submit" disabled={!canPublish}>{busy ? <><LoaderCircle className="studio-spinner" size={16} /> {phaseLabel}</> : <><Upload size={16} /> {editing ? 'Save changes' : 'Publish set'}</>}</button>
          <div className="studio-progress" role="status" aria-live="polite">{connection === 'loading' ? <p>Connecting to your studio…</p> : stage?.phase === 'uploading' ? <><progress value={stage.bytes} max={stage.totalBytes || 1} aria-label="Uploading new original photographs" /><p>{stage.current} of {stage.total} new photos uploaded · {mb(stage.bytes)} of {mb(stage.totalBytes)}</p></> : stage?.phase === 'publishing' ? <><progress aria-label="Publishing set" /><p>{editing ? 'Updating this set on GitHub.' : 'Sending this set to GitHub.'} Keep this window open.</p></> : busy ? <p>{phaseLabel}…</p> : session?.pending ? <p>Resume the saved publication above first.</p> : <p>{editing && !dirty ? 'Make a change to save this set.' : 'Publishes to your existing portfolio.'}</p>}</div>
        </aside>
      </form>}
      {existing.length > 0 && <section className="studio-existing" aria-labelledby="studio-existing-title"><div className="studio-section-heading"><h2 id="studio-existing-title">Published sets</h2><button className="studio-reload" type="button" disabled={locked || connection !== 'ready'} onClick={refreshSets}><RefreshCw size={12} className={stage?.phase === 'refreshing' ? 'studio-spinner' : ''} /> Reload sets</button></div><div className="studio-existing-grid">{existing.map((collection) => <article className={`studio-existing-set${editing?.id === collection.id ? ' is-editing' : ''}`} key={collection.id}>
        <img src={localAsset(collection.cover)} alt="" loading="lazy" onError={(event) => { const remote = `${publicUrl}${collection.cover}`; if (event.currentTarget.src !== remote) event.currentTarget.src = remote; }} />
        <div><h3>{collection.title}</h3><p>{collection.photos.length} photographs</p><div className="studio-existing-actions"><button type="button" disabled={locked || connection !== 'ready'} onClick={() => editSet(collection)} aria-label={`Edit ${collection.title}`}><Pencil size={12} /> Edit set</button><a href={`${publicUrl}#${collection.id}`} target="_blank" rel="noreferrer" aria-label={`View ${collection.title}`}><ArrowUpRight size={15} /></a></div></div>
      </article>)}</div></section>}
    </main>
    <footer className="studio-footer">Canoe Studio <span>Only available on this Mac</span></footer>
  </div>;
}
