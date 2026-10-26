import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createStudioServer, webpDimensions, originalImageInfo } from './studio-server.mjs';
const run = promisify(execFile);
const image = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAaJaQAA3AA/v4UoAA=';
// Actual JPEG with EXIF orientation 6, artist, and description metadata.
const original = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QCARXhpZgAATU0AKgAAAAgAAwEOAAIAAAAaAAAAMgESAAMAAAABAAYAAAE7AAIAAAArAAAATAAAAABDYW5vZSB1bmNoYW5nZWQtYnl0ZSB0ZXN0AE9yaWdpbmFsIHBob3RvIG1ldGFkYXRhIG11c3QgcmVtYWluIGludGFjdAAA/9sAQwADAgICAgIDAgICAwMDAwQGBAQEBAQIBgYFBgkICgoJCAkJCgwPDAoLDgsJCQ0RDQ4PEBAREAoMEhMSEBMPEBAQ/9sAQwEDAwMEAwQIBAQIEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/8AAEQgAAgADAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A8Cooor1T+wD/2Q==', 'base64');
const photoId = 'photo-upload-id-0001';
const payload = (requestId = 'test-upload-request-0001', title = 'Evening / Light') => ({ requestId, title, coverIndex: 0, photos: [{ uploadId: photoId, filename: 'original.jpg', alt: 'An original portrait photograph.', width: 2, height: 3 }] });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'canoe-studio-test-'));
  const root = path.join(directory, 'project');
  const seed = path.join(directory, 'seed');
  const remote = path.join(directory, 'remote.git');
  const initial = { version: 1, collections: [{ id: 'existing', title: 'Existing', count: 0, photos: [] }] };
  await fs.mkdir(path.join(root, 'public'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html><title>Studio test</title>');
  await fs.writeFile(path.join(root, 'public', 'gallery.json'), JSON.stringify(initial));
  await fs.mkdir(seed);
  await run('git', ['init', '--bare', '--initial-branch=main', remote]);
  await run('git', ['init', '--initial-branch=main', seed]);
  const git = (args) => run('git', args, { cwd: seed });
  await git(['config', 'user.name', 'Studio test']);
  await git(['config', 'user.email', 'studio-test@example.invalid']);
  await fs.mkdir(path.join(seed, 'photography'));
  await fs.writeFile(path.join(seed, 'index.html'), 'PERSONAL WEBSITE UNCHANGED');
  await fs.writeFile(path.join(seed, 'photography', 'gallery.json'), JSON.stringify(initial));
  await git(['add', '.']); await git(['commit', '-m', 'Seed personal site']);
  await git(['remote', 'add', 'origin', remote]); await git(['push', 'origin', 'main']);
  const server = createStudioServer({ root, testMode: true, remote });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = await (await fetch(`${origin}/api/session`)).json();
  const send = (endpoint, body, headers = {}) => fetch(`${origin}${endpoint}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Canoe-Token': session.token, ...headers }, body: JSON.stringify(body) });
  const upload = (requestId = 'test-upload-request-0001', bytes = original, type = 'image/jpeg', headers = {}, id = photoId) => fetch(`${origin}/api/photos?requestId=${encodeURIComponent(requestId)}&photoId=${encodeURIComponent(id)}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': type, 'X-Canoe-Token': session.token, ...headers }, body: bytes });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, root, remote, seed, origin, session, send, upload, git };
}

test('WebP verification reads real frame dimensions and rejects fake data', () => {
  assert.deepEqual(webpDimensions(Buffer.from(image, 'base64')), { width: 1, height: 1 });
  assert.throws(() => webpDimensions(Buffer.from('<svg onload=alert(1)>')), /valid WebP/);
  const wrongLength = Buffer.from(image, 'base64'); wrongLength.writeUInt32LE(2, 4);
  assert.throws(() => webpDimensions(wrongLength), /valid WebP/);
});

test('session, origin, token, traversal, original-format and file-size protections', async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.origin}/api/session`, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  const badHost = await new Promise((resolve, reject) => { const request = http.get(`${f.origin}/api/session`, { headers: { Host: 'attacker.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); });
  assert.equal(badHost, 403);
  assert.equal((await f.send('/api/sets', payload(), { 'X-Canoe-Token': 'a'.repeat(64) })).status, 403);
  assert.equal((await f.upload(undefined, original, 'image/jpeg', { 'X-Canoe-Token': 'a'.repeat(64) })).status, 403);
  assert.equal((await f.upload(undefined, original, 'image/jpeg', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await f.send('/api/sets', payload(), { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await fetch(`${f.origin}/originals/%2e%2e/%2e%2e/.canoe-studio/pending.json`)).status, 404);
  assert.equal((await f.upload(undefined, Buffer.from('not a photograph'))).status, 400);
  assert.equal((await f.upload(undefined, original, 'image/png')).status, 400);
  assert.equal((await f.upload('../escape', original)).status, 400);
  const tooLarge = await new Promise((resolve, reject) => {
    const request = http.request(`${f.origin}/api/photos?requestId=test-upload-request-0001&photoId=${photoId}`, { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'image/jpeg', 'X-Canoe-Token': f.session.token, 'Content-Length': 50 * 1024 * 1024 + 1 } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(tooLarge, 413);
  assert.equal((await f.send('/api/sets', payload())).status, 400); // No original has completed yet.
  const uploaded = await f.upload(); assert.equal(uploaded.status, 201);
  const metadata = await uploaded.json(); assert.equal(metadata.byteSize, original.length); assert.equal(metadata.sha256, createHash('sha256').update(original).digest('hex'));
  const dimensions = payload(); dimensions.photos[0].height = 20;
  assert.equal((await f.send('/api/sets', dimensions)).status, 400);
  assert.equal((await f.send('/api/sets', payload('another-draft-request'))).status, 400); // Upload IDs are draft-scoped.
  assert.equal((await f.send('/api/retry', {})).status, 404);
});

test('original JPEG bytes and EXIF remain exact through publishing, serving, and idempotent retries', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(originalImageInfo(original, original.length), { type: 'image/jpeg', extension: 'jpg', width: 3, height: 2 });
  assert.equal((await f.upload()).status, 201);
  const response = await f.send('/api/sets', payload());
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.match(result.collection.id, /^evening-light-[a-f0-9-]+$/);
  assert.equal(result.collection.uploadRequestId, 'test-upload-request-0001');
  assert.equal(result.collection.coverPhoto.alt, 'An original portrait photograph.');
  const photo = result.collection.photos[0];
  assert.equal(photo.original, true); assert.notEqual(photo.src, photo.fullSrc); assert.equal(photo.variants.length, 1);
  assert.equal(result.collection.coverPhoto.src, photo.src);
  assert.equal(result.collection.cover, photo.coverSrc);
  assert.notEqual(photo.coverSrc, photo.src);
  assert.deepEqual(photo.coverVariants.map(({width,height}) => ({width,height})), [{width:2,height:1}]);
  assert.match(photo.src, /^optimized\/evening-light-[a-f0-9-]+\/[a-f0-9-]+\/2\.webp$/);
  assert.deepEqual(photo.variants.map(({width,height}) => ({width,height})), [{width:2,height:3}]);
  assert.equal(photo.width, 2); assert.equal(photo.height, 3); // Oriented display dimensions; stored JPEG remains unchanged.
  assert.equal(photo.byteSize, original.length); assert.equal(photo.sha256, createHash('sha256').update(original).digest('hex'));
  assert.match(photo.fullSrc, /^originals\/evening-light-[a-f0-9-]+\/[a-f0-9-]+\.jpg$/);
  const remoteFile = (name, binary = false) => run('git', ['--git-dir', f.remote, 'show', `main:${name}`], binary ? { encoding: 'buffer' } : {});
  assert.equal((await remoteFile('index.html')).stdout, 'PERSONAL WEBSITE UNCHANGED');
  const gallery = JSON.parse((await remoteFile('photography/gallery.json')).stdout);
  assert.equal(gallery.collections.length, 2); assert.equal(gallery.collections[0].id, 'existing');
  assert.equal(JSON.parse((await remoteFile('_photography-source/public/gallery.json')).stdout).collections.length, 2);
  assert.ok((await fs.readFile(path.join(f.root, 'public', photo.fullSrc))).equals(original));
  assert.ok((await remoteFile(`photography/${photo.fullSrc}`, true)).stdout.equals(original));
  assert.ok((await remoteFile(`_photography-source/public/${photo.fullSrc}`, true)).stdout.equals(original));
  const served = await fetch(`${f.origin}/${photo.fullSrc}`); assert.equal(served.headers.get('content-type'), 'image/jpeg');
  assert.ok(Buffer.from(await served.arrayBuffer()).equals(original));
  const display = Buffer.from(await (await fetch(`${f.origin}/${photo.src}`)).arrayBuffer());
  assert.deepEqual(webpDimensions(display), {width:2,height:3});
  assert.ok(!display.equals(original));
  assert.equal(display.length, photo.variants[0].byteSize);
  assert.ok((await remoteFile(`photography/${photo.src}`, true)).stdout.equals(display));
  assert.ok((await remoteFile(`_photography-source/public/${photo.src}`, true)).stdout.equals(display));
  const cover = Buffer.from(await (await fetch(`${f.origin}/${photo.coverSrc}`)).arrayBuffer());
  assert.deepEqual(webpDimensions(cover), {width:2,height:1});
  assert.equal(cover.length, photo.coverVariants[0].byteSize);
  assert.ok((await remoteFile(`photography/${photo.coverSrc}`, true)).stdout.equals(cover));
  assert.ok((await remoteFile(`_photography-source/public/${photo.coverSrc}`, true)).stdout.equals(cover));
  assert.equal((await (await fetch(`${f.origin}/gallery.json`)).json()).collections.length, 2);
  const retry = await f.send('/api/sets', payload()); assert.equal(retry.status, 201); assert.equal((await retry.json()).commit, result.commit);
  assert.equal(JSON.parse((await remoteFile('photography/gallery.json')).stdout).collections.length, 2);
  const reupload = await f.upload(); assert.equal(reupload.status, 201); // A lost upload response is safe to retry, too.
  const changed = payload(); changed.title = 'A different title'; assert.equal((await f.send('/api/sets', changed)).status, 409);
  await f.git(['pull', '--ff-only', 'origin', 'main']);
  gallery.collections.push({ id: 'external', title: 'External set', count: 0, photos: [] });
  await fs.writeFile(path.join(f.seed, 'photography/gallery.json'), JSON.stringify(gallery));
  await f.git(['add', 'photography/gallery.json']); await f.git(['commit', '-m', 'External gallery edit']); await f.git(['push', 'origin', 'main']);
  assert.equal((await f.upload('test-upload-request-0002')).status, 201);
  const second = await f.send('/api/sets', payload('test-upload-request-0002', 'After rain')); assert.equal(second.status, 201, JSON.stringify(await second.clone().json()));
  const latest = JSON.parse((await remoteFile('photography/gallery.json')).stdout);
  assert.deepEqual(latest.collections.map((entry) => entry.title), ['Existing', 'Evening / Light', 'External set', 'After rain']);
});

test('failed original publication can resume without duplicate sets or altered bytes', async (t) => {
  const f = await fixture(t);
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  await fs.writeFile(hook, '#!/bin/sh\necho "temporarily unavailable" >&2\nexit 1\n', { mode: 0o755 });
  assert.equal((await f.upload()).status, 201);
  assert.equal((await f.send('/api/sets', payload())).status, 502);
  const saved = JSON.parse(await fs.readFile(path.join(f.root, '.canoe-studio/pending.json'), 'utf8')); assert.equal(saved.requestId, 'test-upload-request-0001');
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending.title, 'Evening / Light');
  const duplicate = await f.send('/api/sets', payload('new-request-after-reload')); assert.equal(duplicate.status, 409); assert.match((await duplicate.json()).error, /Resume it first/);
  await fs.rm(hook);
  const resumed = await f.send('/api/retry', {}); assert.equal(resumed.status, 201, JSON.stringify(await resumed.clone().json()));
  const result = await resumed.json();
  const gallery = JSON.parse((await run('git', ['--git-dir', f.remote, 'show', 'main:photography/gallery.json'])).stdout); assert.equal(gallery.collections.length, 2);
  assert.ok((await fs.readFile(path.join(f.root, 'public', result.collection.photos[0].fullSrc))).equals(original));
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending, null);
  assert.equal((await f.send('/api/retry', {})).status, 404);
});


test('preview generation failure never commits a set or falls back to the full original', async (t) => {
  const f = await fixture(t);
  const before = (await run('git', ['--git-dir', f.remote, 'rev-parse', 'main'])).stdout.trim();
  // Keep the real JPEG frame header but remove the image data, making Pillow reject it.
  const truncated = original.subarray(0, original.indexOf(Buffer.from([0xff, 0xc0])) + 19);
  assert.equal(originalImageInfo(truncated, truncated.length).width, 3);
  assert.equal((await f.upload(undefined, truncated)).status, 201);
  const response = await f.send('/api/sets', payload());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Display copies could not be prepared/);
  assert.equal((await run('git', ['--git-dir', f.remote, 'rev-parse', 'main'])).stdout.trim(), before);
  const gallery = JSON.parse(await fs.readFile(path.join(f.root, 'public/gallery.json'), 'utf8'));
  assert.equal(gallery.collections.length, 1);
  const staged = path.join(f.root, '.canoe-studio/uploads/test-upload-request-0001', `${photoId}.original`);
  assert.ok((await fs.readFile(staged)).equals(truncated));
});

async function createEditableSet(f, requestId = 'edit-seed-request-0001') {
  const entries = [];
  for (let index = 0; index < 3; index++) {
    const id = `seed-photo-upload-000${index}`;
    assert.equal((await f.upload(requestId, original, 'image/jpeg', {}, id)).status, 201);
    entries.push({ uploadId: id, filename: `photo-${index + 1}.jpg`, alt: `Original description ${index + 1}`, width: 2, height: 3 });
  }
  const response = await f.send('/api/sets', { requestId, title: 'Editable set', photos: entries, coverIndex: 0 });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return response.json();
}

const editPayload = (created, requestId = 'edit-set-request-0001') => ({
  requestId, title: created.collection.title, baseRevision: created.revision,
  photos: created.collection.photos.map((photo) => ({ existingId: photo.id, alt: photo.alt })),
  coverIndex: 0, coverCrop: { x: 0.5, y: 0.5, zoom: 1 },
});

test('editing adds, removes, and reorders photographs in place, changes the cover crop, and retries safely', async (t) => {
  const f = await fixture(t);
  const created = await createEditableSet(f);
  const before = created.collection;
  const data = await (await fetch(`${f.origin}/api/gallery`)).json();
  assert.equal(data.revisions[before.id], created.revision);
  const additionId = 'new-photo-upload-0001';
  const update = editPayload(created);
  assert.equal((await f.upload(update.requestId, original, 'image/jpeg', {}, additionId)).status, 201);
  update.title = 'Edited name';
  update.photos = [update.photos[2], update.photos[0], { uploadId: additionId, filename: 'added.jpg', alt: 'Added original', width: 2, height: 3 }];
  update.coverCrop = { x: 0.2, y: 0.8, zoom: 1.5 };
  const endpoint = `/api/sets/${before.id}`;
  const response = await f.send(endpoint, update);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const saved = await response.json(); const after = saved.collection;
  assert.equal(after.id, before.id); assert.equal(saved.url, created.url); assert.equal(after.title, 'Edited name');
  assert.equal(after.count, 3); assert.equal(new Set(after.photos.map((photo) => photo.id)).size, 3);
  assert.deepEqual(after.photos.slice(0, 2).map((photo) => photo.id), [before.photos[2].id, before.photos[0].id]);
  assert.ok(!after.photos.some((photo) => photo.id === before.photos[1].id));
  assert.equal(after.photos[2].filename, 'added.jpg');
  assert.equal(after.coverPhoto.id, before.photos[2].id);
  assert.deepEqual(after.coverCrop, update.coverCrop);
  assert.notEqual(after.cover, before.cover); assert.notEqual(saved.revision, created.revision);
  assert.equal(after.photos[0].fullSrc, before.photos[2].fullSrc);
  assert.deepEqual(after.photos[0].variants, before.photos[2].variants);
  const remoteFile = (name) => run('git', ['--git-dir', f.remote, 'show', `main:${name}`], { encoding: 'buffer' });
  for (const photo of [...before.photos, after.photos[2]]) {
    assert.ok((await remoteFile(`photography/${photo.fullSrc}`)).stdout.equals(original), 'retained, removed, and added originals remain byte-for-byte intact');
  }
  const latest = JSON.parse((await remoteFile('photography/gallery.json')).stdout);
  assert.deepEqual(latest.collections.map((collection) => collection.id), ['existing', before.id]);
  assert.deepEqual(JSON.parse((await remoteFile('_photography-source/public/gallery.json')).stdout), latest);
  assert.equal((await remoteFile('index.html')).stdout.toString(), 'PERSONAL WEBSITE UNCHANGED');
  const retried = await f.send(endpoint, update); assert.equal(retried.status, 201); assert.equal((await retried.json()).commit, saved.commit);
  const alteredRetry = { ...update, coverCrop: { x: 0.8, y: 0.8, zoom: 1.5 } };
  assert.equal((await f.send(endpoint, alteredRetry)).status, 409);
  // A reorder with the same cover and crop only changes the gallery metadata.
  const reordered = editPayload(saved, 'edit-set-request-0002');
  reordered.photos = [reordered.photos[1], reordered.photos[0], reordered.photos[2]];
  reordered.coverIndex = 1; reordered.coverCrop = after.coverCrop;
  const orderResponse = await f.send(endpoint, reordered);
  assert.equal(orderResponse.status, 201, JSON.stringify(await orderResponse.clone().json()));
  const orderSaved = await orderResponse.json();
  assert.equal(orderSaved.collection.cover, after.cover);
  const paths = (await run('git', ['--git-dir', f.remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', orderSaved.commit])).stdout.trim().split('\n');
  assert.deepEqual(paths.sort(), ['_photography-source/public/gallery.json', 'photography/gallery.json']);
});

test('editing rejects stale revisions, invalid crops, duplicate references, and foreign photos without changing published files', async (t) => {
  const f = await fixture(t); const created = await createEditableSet(f);
  const endpoint = `/api/sets/${created.collection.id}`;
  const before = (await run('git', ['--git-dir', f.remote, 'rev-parse', 'main'])).stdout.trim();
  assert.equal((await f.send(endpoint, editPayload(created), { 'X-Canoe-Token': 'a'.repeat(64) })).status, 403);
  assert.equal((await f.send(endpoint, { ...editPayload(created), photos: [] })).status, 400);
  assert.equal((await f.send(endpoint, { ...editPayload(created), photos: [{existingId:'../../another-set'}] })).status, 400);
  const duplicate = editPayload(created); duplicate.photos = [duplicate.photos[0], duplicate.photos[0]];
  assert.equal((await f.send(endpoint, duplicate)).status, 400);
  assert.equal((await f.send(endpoint, { ...editPayload(created), coverCrop: {x:0.5,y:2,zoom:1} })).status, 400);
  assert.equal((await f.send(endpoint, { ...editPayload(created), baseRevision: 'f'.repeat(64) })).status, 409);
  assert.equal((await run('git', ['--git-dir', f.remote, 'rev-parse', 'main'])).stdout.trim(), before);
  // An edit from elsewhere must be preserved, while the studio can fetch fresh metadata.
  await f.git(['pull', '--ff-only', 'origin', 'main']);
  const file = path.join(f.seed, 'photography/gallery.json');
  const external = JSON.parse(await fs.readFile(file, 'utf8')); external.collections[1].title = 'Changed elsewhere';
  await fs.writeFile(file, JSON.stringify(external)); await f.git(['add','photography/gallery.json']); await f.git(['commit','-m','Concurrent edit']); await f.git(['push','origin','main']);
  const stale = await f.send(endpoint, editPayload(created)); assert.equal(stale.status, 409); assert.match((await stale.json()).error, /changed since/);
  const refreshed = await (await fetch(`${f.origin}/api/gallery?refresh=1`, { headers: {'X-Canoe-Token':f.session.token} })).json();
  assert.equal(refreshed.collections[1].title, 'Changed elsewhere');
  assert.notEqual(refreshed.revisions[created.collection.id], created.revision);
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending, null);
});

test('a failed edit resumes without adding a second set or losing the existing photo order', async (t) => {
  const f = await fixture(t); const created = await createEditableSet(f);
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', {mode:0o755});
  const update = editPayload(created); update.photos.reverse(); update.coverIndex = 2;
  assert.equal((await f.send(`/api/sets/${created.collection.id}`, update)).status, 502);
  const pending = JSON.parse(await fs.readFile(path.join(f.root,'.canoe-studio/pending.json'),'utf8'));
  assert.equal(pending.operation, 'edit');
  await fs.rm(hook);
  const resumed = await f.send('/api/retry', {});
  assert.equal(resumed.status, 201, JSON.stringify(await resumed.clone().json()));
  const saved = await resumed.json(); assert.equal(saved.collection.id, created.collection.id);
  assert.deepEqual(saved.collection.photos.map((photo) => photo.id), created.collection.photos.map((photo) => photo.id).reverse());
  assert.equal((await (await fetch(`${f.origin}/api/gallery`)).json()).collections.length, 2);
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending, null);
});

test('cover framing selects the requested region, respects zoom, and never modifies the original', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'canoe-cover-test-'));
  t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const source = path.join(directory,'original.png'); const output = path.join(directory,'covers');
  await run(process.env.PYTHON || 'python3', ['-c', "from PIL import Image;import sys;im=Image.new('RGB',(900,900),'red');im.paste('blue',(0,450,900,900));im.save(sys.argv[1])",source]);
  const before = await fs.readFile(source);
  const helper = path.resolve('scripts/create-cover-previews.py');
  async function render(crop) {
    const {stdout} = await run(process.env.PYTHON || 'python3', [helper, source, output, JSON.stringify(crop)]);
    const result = JSON.parse(stdout); const variant = result.variants.at(-1);
    const {stdout: pixel} = await run(process.env.PYTHON || 'python3', ['-c', "from PIL import Image;import sys,json;im=Image.open(sys.argv[1]);print(json.dumps(im.getpixel((im.width//2,im.height//2))))",path.join(output,variant.file)]);
    return {variant,pixel:JSON.parse(pixel)};
  }
  const top = await render({x:0.5,y:0,zoom:2}); assert.equal(top.variant.width,450); assert.equal(top.variant.height,300); assert.ok(top.pixel[0]>240 && top.pixel[2]<15);
  const bottom = await render({x:0.5,y:1,zoom:2}); assert.ok(bottom.pixel[2]>240 && bottom.pixel[0]<15, 'changing the crop must invalidate the cached cover');
  assert.ok((await fs.readFile(source)).equals(before));
  await assert.rejects(run(process.env.PYTHON || 'python3',[helper,source,output,JSON.stringify({x:0,y:0,zoom:0})]));
});

test('an existing legacy photograph with a URL-encoded folder can be reframed without altering it', async (t) => {
  const f = await fixture(t); const created = await createEditableSet(f);
  await f.git(['pull','--ff-only','origin','main']);
  const galleryFile = path.join(f.seed,'photography/gallery.json');
  const gallery = JSON.parse(await fs.readFile(galleryFile,'utf8'));
  const collection = gallery.collections[1]; const photo = collection.photos[1];
  const legacy = path.join(f.seed,'photography/photos/Legacy Folder/original.jpg');
  await fs.mkdir(path.dirname(legacy),{recursive:true}); await fs.writeFile(legacy,original);
  photo.fullSrc = 'photos/Legacy%20Folder/original.jpg';
  await fs.writeFile(galleryFile,JSON.stringify(gallery));
  await f.git(['add','photography']); await f.git(['commit','-m','Legacy photograph path']); await f.git(['push','origin','main']);
  const refreshed = await (await fetch(`${f.origin}/api/gallery?refresh=1`,{headers:{'X-Canoe-Token':f.session.token}})).json();
  const update = editPayload({collection:refreshed.collections[1],revision:refreshed.revisions[collection.id]}); update.coverIndex=1; update.coverCrop={x:0.5,y:0,zoom:1};
  const response = await f.send(`/api/sets/${collection.id}`,update);
  assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const saved = await response.json(); assert.equal(saved.collection.coverPhoto.id,photo.id);
  assert.equal(saved.collection.photos[1].fullSrc,photo.fullSrc);
  const remote = await run('git',['--git-dir',f.remote,'show','main:photography/photos/Legacy Folder/original.jpg'],{encoding:'buffer'});
  assert.ok(remote.stdout.equals(original));
});

test('a conflicting edit while a publication is pending leaves the newer set intact and releases the pending draft', async (t) => {
  const f = await fixture(t); const created = await createEditableSet(f);
  const hook = path.join(f.remote,'hooks/pre-receive'); await fs.writeFile(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});
  const update=editPayload(created); update.title='Pending title';
  assert.equal((await f.send(`/api/sets/${created.collection.id}`,update)).status,502);
  await fs.rm(hook);
  await f.git(['pull','--ff-only','origin','main']);
  const file=path.join(f.seed,'photography/gallery.json'); const external=JSON.parse(await fs.readFile(file,'utf8')); external.collections[1].title='Newer external title';
  await fs.writeFile(file,JSON.stringify(external)); await f.git(['add','photography/gallery.json']); await f.git(['commit','-m','Newer set edit']); await f.git(['push','origin','main']);
  const retry=await f.send('/api/retry',{}); assert.equal(retry.status,409); assert.match((await retry.json()).error,/changed since/);
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending,null);
  const latest=JSON.parse((await run('git',['--git-dir',f.remote,'show','main:photography/gallery.json'])).stdout);
  assert.equal(latest.collections[1].title,'Newer external title');
  const refreshed=await (await fetch(`${f.origin}/api/gallery?refresh=1`,{headers:{'X-Canoe-Token':f.session.token}})).json();
  const next=editPayload({collection:refreshed.collections[1],revision:refreshed.revisions[created.collection.id]},'next-edit-request-0002'); next.title='Reviewed latest set';
  const saved=await f.send(`/api/sets/${created.collection.id}`,next); assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
});
