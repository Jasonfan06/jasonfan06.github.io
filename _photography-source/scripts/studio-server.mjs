#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runFile = promisify(execFile);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE = 'https://github.com/Jasonfan06/jasonfan06.github.io.git';
const PUBLIC_URL = 'https://jasonfan06.github.io/photography/';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_ORIGINAL = 50 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif' };

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

function parseGallery(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!data || data.version !== 1 || !Array.isArray(data.collections)) throw new ApiError(500, 'The saved gallery is not readable. No photos were changed.');
  for (const collection of data.collections) {
    if (!collection || typeof collection.id !== 'string' || typeof collection.title !== 'string' || !Array.isArray(collection.photos)) throw new ApiError(500, 'The saved gallery is not readable. No photos were changed.');
  }
  return data;
}

function cleanText(value, maximum, label, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new ApiError(400, `${label} must be text.`);
  const text = value.trim();
  if (text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new ApiError(400, `${label} is too long or contains unsupported characters.`);
  return text;
}

/** Read the dimensions from the actual WebP image frame, not client metadata. */
export function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP' || buffer.readUInt32LE(4) + 8 !== buffer.length) throw new ApiError(400, 'An optimized image is not a valid WebP file. Please choose the photo again.');
  let dimensions;
  let extended;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new ApiError(400, 'An optimized image is incomplete. Please choose the photo again.');
    if (type === 'ANIM' || type === 'ANMF') throw new ApiError(400, 'Please upload still photographs.');
    if (type === 'VP8X' && length >= 10) extended = { width: buffer.readUIntLE(start + 4, 3) + 1, height: buffer.readUIntLE(start + 7, 3) + 1 };
    if (type === 'VP8 ' && length >= 10 && buffer.toString('hex', start + 3, start + 6) === '9d012a') dimensions = { width: buffer.readUInt16LE(start + 6) & 0x3fff, height: buffer.readUInt16LE(start + 8) & 0x3fff };
    if (type === 'VP8L' && length >= 5 && buffer[start] === 0x2f) {
      const bits = buffer.readUInt32LE(start + 1);
      dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = start + length + (length % 2);
  }
  if (!dimensions?.width || !dimensions?.height || offset !== buffer.length || (extended && (extended.width !== dimensions.width || extended.height !== dimensions.height))) throw new ApiError(400, 'An optimized image has invalid dimensions. Please choose the photo again.');
  return dimensions;
}

function validUploadId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value); }

/** Recognize supported originals without decoding, rewriting, or stripping bytes. */
export function originalImageInfo(header, byteSize) {
  if (header.length >= 24 && header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && header.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'image/png', extension: 'png', width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  }
  if (header.length >= 12 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    let dimensions = {};
    let offset = 2;
    while (offset + 4 < header.length) {
      if (header[offset] !== 0xff) break;
      while (header[offset] === 0xff) offset++;
      const marker = header[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > header.length) break;
      const length = header.readUInt16BE(offset);
      if (length < 2) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && offset + 7 <= header.length) {
        dimensions = { height: header.readUInt16BE(offset + 3), width: header.readUInt16BE(offset + 5) }; break;
      }
      offset += length;
    }
    if (!dimensions.width || !dimensions.height) throw new ApiError(400, 'This JPEG photograph has an invalid image header.');
    return { type: 'image/jpeg', extension: 'jpg', ...dimensions };
  }
  if (header.length >= 30 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' && header.readUInt32LE(4) + 8 === byteSize) {
    let dimensions = {};
    let offset = 12;
    while (offset + 8 <= header.length) {
      const chunk = header.toString('ascii', offset, offset + 4);
      const start = offset + 8;
      const length = header.readUInt32LE(offset + 4);
      if (chunk === 'VP8X' && start + 10 <= header.length) { dimensions = { width: header.readUIntLE(start + 4, 3) + 1, height: header.readUIntLE(start + 7, 3) + 1 }; break; }
      if (chunk === 'VP8 ' && start + 10 <= header.length && header.toString('hex', start + 3, start + 6) === '9d012a') { dimensions = { width: header.readUInt16LE(start + 6) & 0x3fff, height: header.readUInt16LE(start + 8) & 0x3fff }; break; }
      if (chunk === 'VP8L' && start + 5 <= header.length && header[start] === 0x2f) { const bits = header.readUInt32LE(start + 1); dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; break; }
      offset = start + length + (length % 2);
    }
    if (!dimensions.width || !dimensions.height) throw new ApiError(400, 'This WebP photograph has an invalid image header.');
    return { type: 'image/webp', extension: 'webp', ...dimensions };
  }
  if (header.length >= 16 && header.toString('ascii', 4, 8) === 'ftyp') {
    const size = Math.min(header.readUInt32BE(0), header.length);
    const brands = [header.toString('ascii', 8, 12)];
    for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(header.toString('ascii', offset, offset + 4));
    if (brands.includes('avif') || brands.includes('avis')) return { type: 'image/avif', extension: 'avif' };
  }
  throw new ApiError(400, 'Choose an original JPEG, PNG, WebP, or AVIF photograph.');
}

async function validateUpload(input, resolvePhoto) {
  const title = cleanText(input?.title, 120, 'Set name');
  if (!title) throw new ApiError(400, 'Enter a name for the set.');
  if (!Array.isArray(input.photos) || input.photos.length < 1 || input.photos.length > 30) throw new ApiError(400, 'Choose between 1 and 30 photographs.');
  if (!Number.isInteger(input.coverIndex) || input.coverIndex < 0 || input.coverIndex >= input.photos.length) throw new ApiError(400, 'Choose a cover photograph.');
  if (!validUploadId(input.requestId)) throw new ApiError(400, 'The draft identifier is invalid. Refresh the studio and try again.');
  const fingerprint = createHash('sha256').update(JSON.stringify([title, input.coverIndex]));
  const photos = [];
  const seen = new Set();
  for (let index = 0; index < input.photos.length; index++) {
    const photo = input.photos[index];
    if (!photo || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1 || photo.width > 50000 || photo.height > 50000 || photo.width * photo.height > 200_000_000) throw new ApiError(400, `Photograph ${index + 1} has invalid dimensions.`);
    if (!validUploadId(photo.uploadId) || seen.has(photo.uploadId)) throw new ApiError(400, 'Each photograph needs its own completed upload.');
    seen.add(photo.uploadId);
    const original = await resolvePhoto(input.requestId, photo.uploadId);
    if (original.width && original.height && !((original.width === photo.width && original.height === photo.height) || (original.width === photo.height && original.height === photo.width))) throw new ApiError(400, `Photograph ${index + 1} does not match its original dimensions.`);
    const filename = cleanText(photo.filename, 250, 'Photo filename', `Photograph ${index + 1}`);
    const alt = cleanText(photo.alt, 600, 'Photo description', `${title}, photograph ${index + 1}`) || `${title}, photograph ${index + 1}`;
    fingerprint.update(JSON.stringify([filename, alt, photo.width, photo.height, original.sha256]));
    photos.push({ ...original, filename, alt, width: photo.width, height: photo.height, uploadId: photo.uploadId });
  }
  return { title, coverIndex: input.coverIndex, photos, requestId: input.requestId, fingerprint: fingerprint.digest('hex') };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY) { done = true; chunks.length = 0; reject(new ApiError(413, 'This upload is too large. Please create a smaller set.')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (done) return;
      done = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ApiError(400, 'The upload could not be read. Please try again.')); }
    });
    request.on('error', (error) => { if (!done) { done = true; reject(error); } });
    request.on('aborted', () => { if (!done) { done = true; reject(new ApiError(400, 'The upload was interrupted.')); } });
  });
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  response.end(body);
}

function safeImagePath(value) { return typeof value === 'string' && (/^optimized\/(?:[A-Za-z0-9_-]+\/){1,3}[1-9][0-9]{0,4}\.webp$/.test(value) || /^originals\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(value)); }

function within(directory, file) { const relative = path.relative(directory, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }

async function serveStatic(request, response, directory, relative) {
  const root = await fs.realpath(directory);
  const candidate = path.resolve(root, relative);
  if (!within(root, candidate)) return false;
  let file;
  try { file = await fs.realpath(candidate); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
  if (!within(root, file)) return false;
  const stat = await fs.stat(file);
  if (!stat.isFile()) return false;
  response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': path.extname(file) === '.html' || path.extname(file) === '.json' ? 'no-store' : 'public, max-age=3600' });
  if (request.method === 'HEAD') response.end();
  else response.end(await fs.readFile(file));
  return true;
}

/** Private loopback studio. Test configuration never comes from request data or CLI. */
export function createStudioServer(options = {}) {
  const root = path.resolve(options.root || PROJECT_ROOT);
  const state = path.join(root, '.canoe-studio');
  const repository = path.join(state, 'repository');
  const pendingFile = path.join(state, 'pending.json');
  const pendingFiles = path.join(state, 'pending-images');
  const uploadsDirectory = path.join(state, 'uploads');
  const receiving = new Set();
  const testRemote = options.testMode === true && typeof options.remote === 'string' && path.isAbsolute(options.remote) ? options.remote : null;
  const remote = testRemote || REMOTE;
  const publicUrl = testRemote ? (options.publicUrl || PUBLIC_URL) : PUBLIC_URL;
  const token = randomBytes(32).toString('hex');
  let publishing = false;
  let lastResult = null;

  const git = async (args, extra = {}) => {
    return runFile('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 90000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...extra });
  };

  async function ensureRepository() {
    await fs.mkdir(state, { recursive: true, mode: 0o700 });
    if (!await exists(path.join(repository, '.git'))) {
      if (await exists(repository)) throw new ApiError(409, 'The studio checkout is incomplete. Please reopen the studio after checking its .canoe-studio folder.');
      await runFile('git', ['clone', '--depth', '1', '--branch', 'main', remote, repository], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    }
    const { stdout: savedRemote } = await git(['remote', 'get-url', 'origin']);
    if (savedRemote.trim() !== remote) throw new ApiError(409, 'The studio checkout points to another repository. No files were published.');
    const { stdout: branch } = await git(['branch', '--show-current']);
    if (branch.trim() !== 'main') throw new ApiError(409, 'The studio checkout is on another branch. No files were published.');
    await git(['fetch', 'origin', 'main']);
    for (const [key, value] of [['user.name', 'Jason Fan'], ['user.email', '128120655+Jasonfan06@users.noreply.github.com']]) {
      try { const current = await git(['config', '--local', '--get', key]); if (current.stdout.trim()) continue; } catch {}
      await git(['config', '--local', key, value]);
    }
  }

  async function remoteGallery() {
    try { return parseGallery((await git(['show', 'origin/main:photography/gallery.json'])).stdout); }
    catch (error) {
      // The first studio deployment seeds the canonical gallery locally.
      if (String(error.stderr || '').includes("does not exist") || String(error.stderr || '').includes("exists on disk, but not")) return parseGallery(await fs.readFile(path.join(root, 'public', 'gallery.json'), 'utf8'));
      throw error;
    }
  }

  async function pending() {
    try { return JSON.parse(await fs.readFile(pendingFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  function allowed(transaction, file) {
    return file === 'photography/gallery.json' || file === '_photography-source/public/gallery.json' || transaction.files.some((item) => file === `photography/${item.src}` || file === `_photography-source/public/${item.src}`);
  }

  async function cleanOwnedCheckout(transaction) {
    if (!transaction.files.every((item) => safeImagePath(item.src))) throw new ApiError(409, 'The pending set contains an invalid image path. No files were changed.');
    const changes = (await git(['status', '--porcelain', '--untracked-files=all'])).stdout.split('\n').filter(Boolean);
    if (changes.some((line) => !allowed(transaction, line.slice(3)))) throw new ApiError(409, 'The studio checkout has unrelated changes. No files were overwritten.');
    const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    const upstream = (await git(['rev-parse', 'origin/main'])).stdout.trim();
    if (head !== upstream && head !== transaction.baseSha && head !== transaction.commitSha) {
      // A crash can occur between committing and recording the commit SHA.
      let isAncestor = false;
      try { await git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']); isAncestor = true; } catch {}
      const message = (await git(['log', '-1', '--format=%B'])).stdout;
      const paths = (await git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])).stdout.trim().split('\n').filter(Boolean);
      const parent = (await git(['rev-parse', 'HEAD^'])).stdout.trim();
      if (!isAncestor && (!message.includes(`Canoe-Upload: ${transaction.requestId}`) || parent !== transaction.baseSha || paths.some((file) => !allowed(transaction, file)))) throw new ApiError(409, 'The studio checkout has an unpublished change from another task. No files were overwritten.');
    }
    // Only the dedicated checkout and this transaction's known paths are reset.
    await git(['reset', '--hard', 'origin/main']);
    for (const item of transaction.files) {
      await fs.rm(path.join(repository, 'photography', item.src), { force: true });
      await fs.rm(path.join(repository, '_photography-source', 'public', item.src), { force: true });
    }
  }

  async function syncLocal(transaction, gallery) {
    for (const item of transaction.files) {
      if (!safeImagePath(item.src) || (item.staged && !/^[a-f0-9-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(item.staged))) throw new ApiError(409, 'The pending set contains an invalid image path. No files were changed.');
      const destination = path.join(root, 'public', item.src);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const staged = path.join(pendingFiles, item.staged);
      if (item.staged && await exists(staged)) await fs.copyFile(staged, destination);
      else if (!await exists(destination)) {
        const { stdout } = await git(['show', `origin/main:photography/${item.src}`], { encoding: 'buffer', maxBuffer: MAX_ORIGINAL + 1024 });
        await fs.writeFile(destination, stdout);
      }
    }
    await atomicJson(path.join(root, 'public', 'gallery.json'), gallery);
    await fs.rm(pendingFile, { force: true });
    await fs.rm(pendingFiles, { recursive: true, force: true });
  }

  async function receiveOriginal(request, url) {
    const requestId = url.searchParams.get('requestId');
    const uploadId = url.searchParams.get('photoId');
    if (!validUploadId(requestId) || !validUploadId(uploadId)) throw new ApiError(400, 'This photograph has an invalid upload identifier.');
    if (Number(request.headers['content-length']) > MAX_ORIGINAL) throw new ApiError(413, 'Each original photograph must be 50 MB or smaller.');
    const declared = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg','image/jpg','image/png','image/webp','image/avif','application/octet-stream'].includes(declared)) throw new ApiError(400, 'Choose an original JPEG, PNG, WebP, or AVIF photograph.');
    const key = `${requestId}/${uploadId}`;
    if (receiving.has(key)) throw new ApiError(409, 'This photograph is already uploading. Please wait.');
    receiving.add(key);
    const directory = path.join(uploadsDirectory, requestId);
    const temporary = path.join(directory, `.upload-${randomUUID()}`);
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const records = (await fs.readdir(directory)).filter((name) => name.endsWith('.json'));
      if (records.length >= 30 && !records.includes(`${uploadId}.json`)) throw new ApiError(400, 'A set can contain up to 30 photographs.');
      let byteSize = 0;
      let captured = 0;
      const headers = [];
      const digest = createHash('sha256');
      const counter = new Transform({ transform(chunk, encoding, done) {
        byteSize += chunk.length;
        if (byteSize > MAX_ORIGINAL) { done(new ApiError(413, 'Each original photograph must be 50 MB or smaller.')); return; }
        digest.update(chunk);
        if (captured < 1024 * 1024) { const part = chunk.subarray(0, 1024 * 1024 - captured); headers.push(part); captured += part.length; }
        done(null, chunk);
      } });
      await pipeline(request, counter, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      const info = originalImageInfo(Buffer.concat(headers), byteSize);
      if (declared !== 'application/octet-stream' && declared !== info.type && !(declared === 'image/jpg' && info.type === 'image/jpeg')) throw new ApiError(400, 'This photograph does not match its file type.');
      const sha256 = digest.digest('hex');
      const recordFile = path.join(directory, `${uploadId}.json`);
      if (await exists(recordFile)) {
        const previous = JSON.parse(await fs.readFile(recordFile, 'utf8'));
        if (previous.sha256 !== sha256 || previous.byteSize !== byteSize) throw new ApiError(409, 'This upload identifier was already used by another photograph. Choose the photo again.');
        return { uploadId, byteSize, sha256, type: info.type };
      }
      await fs.rename(temporary, path.join(directory, `${uploadId}.original`));
      await atomicJson(recordFile, { ...info, uploadId, byteSize, sha256 });
      return { uploadId, byteSize, sha256, type: info.type };
    } finally { receiving.delete(key); await fs.rm(temporary, { force: true }); }
  }

  async function resolveOriginal(requestId, uploadId) {
    const directory = path.join(uploadsDirectory, requestId);
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(directory, `${uploadId}.json`), 'utf8'));
      const file = path.join(directory, `${uploadId}.original`);
      const stat = await fs.stat(file);
      if (metadata.uploadId !== uploadId || stat.size !== metadata.byteSize || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw new ApiError(400, 'An original photograph is incomplete. Upload it again.');
      return { ...metadata, file };
    } catch (error) { if (error.code === 'ENOENT') throw new ApiError(400, 'A photograph has not finished uploading. Upload it again.'); throw error; }
  }

  async function stageTransaction(upload) {
    const slug = upload.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,55) || 'set';
    const id = `${slug}-${randomUUID().slice(0,8)}`;
    const files = [];
    await fs.mkdir(pendingFiles, { recursive: true, mode: 0o700 });
    const photos = [];
    for (let index = 0; index < upload.photos.length; index++) {
      const input = upload.photos[index];
      const photoId = randomUUID();
      const src = `originals/${id}/${photoId}.${input.extension}`;
      const staged = `${photoId}.${input.extension}`;
      await fs.copyFile(input.file, path.join(pendingFiles, staged));
      files.push({ src, staged });
      photos.push({ id: `${id}-${index+1}`, title: path.parse(input.filename).name || `Photograph ${index+1}`, alt: input.alt, filename: input.filename, uploadId: input.uploadId, src, fullSrc: src, width: input.width, height: input.height, original: true, byteSize: input.byteSize, sha256: input.sha256 });
    }
    const coverPhoto = photos[upload.coverIndex];
    const collection = { id, title: upload.title, folder: upload.title, cover: coverPhoto.src, coverPhoto, count: photos.length, photos, uploadRequestId: upload.requestId, uploadFingerprint: upload.fingerprint };
    const baseSha = (await git(['rev-parse', 'origin/main'])).stdout.trim();
    const transaction = { requestId: upload.requestId, fingerprint: upload.fingerprint, baseSha, collection, files };
    await atomicJson(pendingFile, transaction);
    return transaction;
  }

  async function publishTransaction(transaction) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await git(['fetch', 'origin', 'main']);
      const gallery = await remoteGallery();
      const existing = gallery.collections.find((collection) => collection.uploadRequestId === transaction.requestId);
      if (existing) {
        if (existing.uploadFingerprint && existing.uploadFingerprint !== transaction.fingerprint) throw new ApiError(409, 'This draft changed after publishing. Start a new set to publish different photographs.');
        await syncLocal(transaction, gallery);
        return { collection: existing, url: `${publicUrl}#${encodeURIComponent(existing.id)}`, commit: (await git(['rev-parse', 'origin/main'])).stdout.trim() };
      }
      await cleanOwnedCheckout(transaction);
      transaction.baseSha = (await git(['rev-parse', 'origin/main'])).stdout.trim();
      transaction.commitSha = null;
      await atomicJson(pendingFile, transaction);
      for (const item of transaction.files) {
        for (const prefix of ['photography', '_photography-source/public']) {
          const destination = path.join(repository, prefix, item.src);
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.copyFile(path.join(pendingFiles, item.staged), destination);
        }
      }
      const updated = { ...gallery, collections: [...gallery.collections, transaction.collection] };
      await atomicJson(path.join(repository, 'photography', 'gallery.json'), updated);
      await atomicJson(path.join(repository, '_photography-source', 'public', 'gallery.json'), updated);
      const paths = ['photography/gallery.json', '_photography-source/public/gallery.json', ...transaction.files.flatMap((item) => [`photography/${item.src}`, `_photography-source/public/${item.src}`])];
      await git(['add', '--', ...paths]);
      const staged = (await git(['diff', '--cached', '--name-only'])).stdout.trim().split('\n').filter(Boolean);
      if (staged.some((file) => !allowed(transaction, file))) throw new ApiError(409, 'The studio checkout has unrelated staged changes. Nothing was published.');
      await git(['commit', '-m', `Add photography set: ${transaction.collection.title}\n\nCanoe-Upload: ${transaction.requestId}`]);
      transaction.commitSha = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      await atomicJson(pendingFile, transaction);
      try { await git(['push', 'origin', 'HEAD:refs/heads/main']); }
      catch (error) {
        if (/non-fast-forward|fetch first|rejected/i.test(String(error.stderr || '')) && attempt < 2) continue;
        // A connection can fail after GitHub has accepted the commit.
        try {
          await git(['fetch', 'origin', 'main']);
          const latest = await remoteGallery();
          if (latest.collections.some((collection) => collection.uploadRequestId === transaction.requestId)) {
            await syncLocal(transaction, latest);
            return { collection: transaction.collection, url: `${publicUrl}#${encodeURIComponent(transaction.collection.id)}`, commit: transaction.commitSha };
          }
        } catch {}
        throw error;
      }
      await syncLocal(transaction, updated);
      return { collection: transaction.collection, url: `${publicUrl}#${encodeURIComponent(transaction.collection.id)}`, commit: transaction.commitSha };
    }
    throw new ApiError(502, 'GitHub changed while the set was publishing. Your photos are saved; click Publish again to retry.');
  }

  async function publish(input) {
    const saved = await pending();
    if (saved && saved.requestId !== input?.requestId) throw new ApiError(409, 'A previous set is waiting to publish. Resume it first.');
    const upload = await validateUpload(input, resolveOriginal);
    await ensureRepository();
    if (saved) {
      if (saved.requestId === upload.requestId && saved.fingerprint !== upload.fingerprint) throw new ApiError(409, 'This pending draft has changed. Retry with the original photos, or reopen the studio to recover it.');
      if (saved.requestId !== upload.requestId) throw new ApiError(409, 'A previous set is waiting to publish. Resume it first.');
      return publishTransaction(saved);
    }
    const gallery = await remoteGallery();
    const existing = gallery.collections.find((collection) => collection.uploadRequestId === upload.requestId);
    if (existing) {
      if (existing.uploadFingerprint && existing.uploadFingerprint !== upload.fingerprint) throw new ApiError(409, 'This draft changed after publishing. Start a new set to publish different photographs.');
      const files = existing.photos.flatMap((photo) => photo.variants?.map((variant) => ({ src: variant.src, staged: '' })) || [{ src: photo.src, staged: '' }]);
      await syncLocal({ files }, gallery);
      return { collection: existing, url: `${publicUrl}#${encodeURIComponent(existing.id)}`, commit: (await git(['rev-parse', 'origin/main'])).stdout.trim() };
    }
    return publishTransaction(await stageTransaction(upload));
  }

  const server = http.createServer({ maxHeaderSize: 16384 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://jasonfan06.github.io; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const address = server.address();
      const expectedHost = `127.0.0.1:${address.port}`;
      const origin = `http://${expectedHost}`;
      if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Open the studio directly on this Mac.');
      const url = new URL(request.url, origin);
      if (url.origin !== origin) throw new ApiError(403, 'Open the studio directly on this Mac.');
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const saved = await pending();
        json(response, 200, { token, publicUrl, owner: 'Jasonfan06', repository: 'jasonfan06.github.io', studio: 'canoe-local-v1', pending: saved ? { title: saved.collection.title, count: saved.collection.count } : null });
        return;
      }
      if (url.pathname === '/api/gallery' && request.method === 'GET') {
        const gallery = parseGallery(await fs.readFile(path.join(root, 'public', 'gallery.json'), 'utf8'));
        json(response, 200, { collections: gallery.collections }); return;
      }
      if (url.pathname === '/api/status' && request.method === 'GET') {
        json(response, 200, { publishing, lastResult, pending: Boolean(await pending()) }); return;
      }
      if (url.pathname === '/api/photos' && request.method === 'POST') {
        const supplied = request.headers['x-canoe-token'];
        if (request.headers.origin !== origin || typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) throw new ApiError(403, 'The studio session has expired. Refresh this page and try again.');
        if (publishing) throw new ApiError(409, 'A set is publishing. Please wait before uploading more photographs.');
        json(response, 201, await receiveOriginal(request, url));
        return;
      }
      if (['/api/sets', '/api/retry'].includes(url.pathname) && request.method === 'POST') {
        if (request.headers.origin !== origin || !/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) throw new ApiError(403, 'Please publish from the studio page.');
        const supplied = request.headers['x-canoe-token'];
        if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) throw new ApiError(403, 'The studio session has expired. Refresh this page and try again.');
        if (Number(request.headers['content-length']) > MAX_BODY) throw new ApiError(413, 'This upload is too large. Please create a smaller set.');
        if (publishing) throw new ApiError(409, 'Another set is publishing. Please wait a moment.');
        publishing = true;
        try {
          let result;
          if (url.pathname === '/api/retry') {
            if (Number(request.headers['content-length'] || 0) > 0) await readBody(request);
            await ensureRepository();
            const saved = await pending();
            if (!saved) throw new ApiError(404, 'There is no pending set to resume.');
            result = await publishTransaction(saved);
          } else result = await publish(await readBody(request));
          lastResult = { ...result, publishedAt: new Date().toISOString() };
          json(response, 201, result);
        } catch (error) {
          if (error instanceof ApiError) throw error;
          console.error('Canoe Studio could not publish:', String(error.stderr || error.message).trim().slice(0, 1200));
          const authentication = /authentication|could not read username|permission denied|credential/i.test(String(error.stderr || error.message));
          throw new ApiError(502, authentication ? 'GitHub sign-in could not be used. Sign into GitHub for Git on this Mac, then click Publish again. Your draft remains in this page.' : 'Publishing could not finish. Check your internet connection, then click Publish again. Any pending photos are saved and retries will not duplicate your set.');
        } finally { publishing = false; }
        return;
      }
      if (url.pathname.startsWith('/api/')) throw new ApiError(404, 'This studio action does not exist.');
      if (!['GET', 'HEAD'].includes(request.method)) throw new ApiError(405, 'This action is not supported.');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\')) throw new ApiError(400, 'Invalid file path.');
      if (decoded === '/gallery.json') {
        if (await serveStatic(request, response, path.join(root, 'public'), 'gallery.json')) return;
      }
      if (decoded.startsWith('/optimized/') || decoded.startsWith('/originals/') || decoded.startsWith('/photos/')) {
        if (await serveStatic(request, response, path.join(root, 'public'), decoded.slice(1))) return;
      }
      if (await serveStatic(request, response, path.join(root, 'dist'), decoded === '/' ? 'index.html' : decoded.slice(1))) return;
      throw new ApiError(404, 'This file does not exist.');
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { error: error instanceof ApiError ? error.message : 'The studio could not complete this action. Please try again.' });
      else response.destroy();
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  return server;
}

export async function startStudio(options = {}) {
  const root = path.resolve(options.root || PROJECT_ROOT);
  if (!await exists(path.join(root, 'dist', 'index.html'))) throw new Error('Build the portfolio first with npm run build, then open Canoe Studio again.');
  const port = options.port || 4317;
  const studioUrl = `http://127.0.0.1:${port}/#studio`;
  const server = createStudioServer({ root });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(2500) });
        const session = await response.json();
        if (response.ok && session.studio === 'canoe-local-v1' && session.publicUrl === PUBLIC_URL) {
          if (options.open) await runFile('/usr/bin/open', [studioUrl]);
          console.log(`Canoe Studio is already open: ${studioUrl}`);
          return null;
        }
      } catch {}
    }
    throw error;
  }
  console.log(`Canoe Studio: ${studioUrl}`);
  console.log('Keep this window open while uploading. Your public portfolio stays online when the studio is closed.');
  if (options.open) await runFile('/usr/bin/open', [studioUrl]);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4317;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('Choose a local port between 1024 and 65535.'); process.exitCode = 1; }
  else startStudio({ port, open: process.argv.includes('--open') }).catch((error) => { console.error(`Canoe Studio: ${error.message}`); process.exitCode = 1; });
}
