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
