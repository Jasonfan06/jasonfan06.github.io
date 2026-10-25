import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStudioServer, webpDimensions } from './studio-server.mjs';
const run = promisify(execFile);
const image = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAaJaQAA3AA/v4UoAA=';
const payload = (requestId = 'test-upload-request-0001', title = 'Evening / Light') => ({ requestId, title, coverIndex: 0, photos: [{ filename: 'white.jpg', alt: 'A white photograph.', width: 1, height: 1, variants: [{ width: 1, height: 1, base64: image }] }] });

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
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, root, remote, seed, origin, session, send, git };
}

test('WebP verification reads real frame dimensions and rejects fake data', () => {
  assert.deepEqual(webpDimensions(Buffer.from(image, 'base64')), { width: 1, height: 1 });
  assert.throws(() => webpDimensions(Buffer.from('<svg onload=alert(1)>')), /valid WebP/);
  const wrongLength = Buffer.from(image, 'base64'); wrongLength.writeUInt32LE(2, 4);
  assert.throws(() => webpDimensions(wrongLength), /valid WebP/);
});

test('session, origin, token, static traversal, and image validation protections', async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.origin}/api/session`, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  const badHost = await new Promise((resolve, reject) => { const request = http.get(`${f.origin}/api/session`, { headers: { Host: 'attacker.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); });
  assert.equal(badHost, 403);
  assert.equal((await f.send('/api/sets', payload(), { 'X-Canoe-Token': 'a'.repeat(64) })).status, 403);
  assert.equal((await f.send('/api/sets', payload(), { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await f.send('/api/sets', payload(), { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await fetch(`${f.origin}/optimized/%2e%2e/%2e%2e/.canoe-studio/pending.json`)).status, 404);
  const invalid = payload(); invalid.photos[0].variants[0].base64 = Buffer.from('not a photograph').toString('base64');
  assert.equal((await f.send('/api/sets', invalid)).status, 400);
  const dimensions = payload(); dimensions.photos[0].variants[0].height = 2;
  assert.equal((await f.send('/api/sets', dimensions)).status, 400);
  const unicodeToken = await f.send('/api/sets', payload(), { 'X-Canoe-Token': 'z'.repeat(64) });
  assert.equal(unicodeToken.status, 403);
  assert.equal((await f.send('/api/retry', {})).status, 404);
});

test('publishing appends one set, preserves the personal site, writes only optimized files, and retries idempotently', async (t) => {
  const f = await fixture(t);
  const response = await f.send('/api/sets', payload());
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.match(result.collection.id, /^evening-light-[a-f0-9-]+$/);
  assert.equal(result.collection.uploadRequestId, 'test-upload-request-0001');
  assert.equal(result.collection.coverPhoto.alt, 'A white photograph.');
  const remoteFile = (name) => run('git', ['--git-dir', f.remote, 'show', `main:${name}`]);
  assert.equal((await remoteFile('index.html')).stdout, 'PERSONAL WEBSITE UNCHANGED');
  const gallery = JSON.parse((await remoteFile('photography/gallery.json')).stdout);
  assert.equal(gallery.collections.length, 2);
  assert.equal(gallery.collections[0].id, 'existing');
  assert.equal(JSON.parse((await remoteFile('_photography-source/public/gallery.json')).stdout).collections.length, 2);
  const imagePath = result.collection.photos[0].src;
  assert.ok((await fs.readFile(path.join(f.root, 'public', imagePath))).equals(Buffer.from(image, 'base64')));
  assert.equal((await fetch(`${f.origin}/${imagePath}`)).status, 200);
  assert.equal((await (await fetch(`${f.origin}/gallery.json`)).json()).collections.length, 2);
  const retry = await f.send('/api/sets', payload());
  assert.equal(retry.status, 201, JSON.stringify(await retry.clone().json()));
  assert.equal((await retry.json()).commit, result.commit);
  assert.equal(JSON.parse((await remoteFile('photography/gallery.json')).stdout).collections.length, 2);
  const changed = payload(); changed.title = 'A different title';
  assert.equal((await f.send('/api/sets', changed)).status, 409);
  // A second external publisher can append a different set between studio uploads.
  await f.git(['pull', '--ff-only', 'origin', 'main']);
  gallery.collections.push({ id: 'external', title: 'External set', count: 0, photos: [] });
  await fs.writeFile(path.join(f.seed, 'photography/gallery.json'), JSON.stringify(gallery));
  await f.git(['add', 'photography/gallery.json']); await f.git(['commit', '-m', 'External gallery edit']); await f.git(['push', 'origin', 'main']);
  const second = await f.send('/api/sets', payload('test-upload-request-0002', 'After rain'));
  assert.equal(second.status, 201, JSON.stringify(await second.clone().json()));
  const latest = JSON.parse((await remoteFile('photography/gallery.json')).stdout);
  assert.deepEqual(latest.collections.map((entry) => entry.title), ['Existing', 'Evening / Light', 'External set', 'After rain']);
});

test('a rejected push retains a resumable draft, blocks new requests, and resumes without duplicates', async (t) => {
  const f = await fixture(t);
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  await fs.writeFile(hook, '#!/bin/sh\necho "temporarily unavailable" >&2\nexit 1\n', { mode: 0o755 });
  const response = await f.send('/api/sets', payload());
  assert.equal(response.status, 502);
  const saved = JSON.parse(await fs.readFile(path.join(f.root, '.canoe-studio/pending.json'), 'utf8'));
  assert.equal(saved.requestId, 'test-upload-request-0001');
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending.title, 'Evening / Light');
  const duplicate = await f.send('/api/sets', payload('new-request-after-reload'));
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /Resume it first/);
  await fs.rm(hook);
  const resumed = await f.send('/api/retry', {});
  assert.equal(resumed.status, 201, JSON.stringify(await resumed.clone().json()));
  const gallery = JSON.parse((await run('git', ['--git-dir', f.remote, 'show', 'main:photography/gallery.json'])).stdout);
  assert.equal(gallery.collections.length, 2);
  assert.equal((await (await fetch(`${f.origin}/api/session`)).json()).pending, null);
  assert.equal((await f.send('/api/retry', {})).status, 404);
});
