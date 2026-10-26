import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoadingCoordinator } from '../src/loading.js';

test('stages, cancellation, collection priority, and decoded foreground originals', async () => {
const tick = () => new Promise((resolve) => setImmediate(resolve));
const images = [], transfers = [], idle = new Map(); let idleId = 0;
const page = { baseURI: 'https://example.test/photography/', hidden: false, addEventListener(){},removeEventListener(){} };
class FakeImage {
  constructor(){ this.naturalWidth=600; this.naturalHeight=400; }
  set src(value){
    this.value=value;
    if (!value) { if(this.request)this.request.aborted=true; return; }
    const request={url:value,image:this,priority:this.fetchPriority,aborted:false};
    this.request=request;images.push(request);
  }
  get src(){return this.value;}
  decode(){
    if(this.value.includes('/originals/')) return new Promise(resolve=>{this.request.decodeResolve=resolve;});
    return Promise.resolve();
  }
}
const env={document:page,innerWidth:1200,innerHeight:900,devicePixelRatio:1,navigator:{connection:{saveData:false}},Image:FakeImage,setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},requestIdleCallback(cb){const id=++idleId;idle.set(id,cb);return id;},cancelIdleCallback(id){idle.delete(id);}};
const fetcher=async(url,options)=>{
  const request={url,options,aborted:false};transfers.push(request);
  const body=new Promise((resolve,reject)=>{
    request.finish=()=>resolve(new ArrayBuffer(1));
    options.signal.addEventListener('abort',()=>{request.aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});
  });
  return {ok:true,arrayBuffer:()=>body};
};
const photo=(id)=>({id,width:3000,height:4500,src:`optimized/${id}/1200.webp`,fullSrc:`originals/${id}.jpg`,variants:[600,1200,2000].map(width=>({width,height:width*1.5,src:`optimized/${id}/${width}.webp`}))});
const [a,b,c,d]=['a','b','c','d'].map(photo);
const collections=[{id:'one',photos:[a,b],coverPhoto:a},{id:'two',photos:[c,d],coverPhoto:c}];
const m=createLoadingCoordinator(collections,{environment:env,fetch:fetcher,asset:p=>'./'+p});
const load=async(request)=>{request.image.onload();await tick();await tick();};
const nextIdle=async()=>{const callbacks=[...idle.values()];idle.clear();for(const cb of callbacks)cb();await tick();await tick();};
assert.equal(images.length,0);assert.equal(transfers.length,0);
m.animationFinished();assert.equal(images.length,1);assert.equal(images[0].priority,'high');
await load(images[0]);assert.equal(images.length,2);assert.equal(transfers.length,0);
await load(images[1]);await nextIdle();assert.equal(images.length,3);assert.equal(images[2].priority,'low');assert.equal(transfers.length,0);
await load(images[2]);await nextIdle();assert.equal(images.length,4);assert.equal(transfers.length,0);
await load(images[3]);await nextIdle();assert.equal(transfers.length,1);assert.match(transfers[0].url,/originals\/a\.jpg$/);assert.equal(transfers[0].options.priority,'low');
m.enterCollection('two');await tick();assert.equal(transfers[0].aborted,true);await nextIdle();assert.equal(transfers.length,1);assert.equal(m.snapshot().stage,'transition');
m.transitionFinished('two');await nextIdle();assert.equal(transfers.length,2);assert.match(transfers[1].url,/originals\/c\.jpg$/);
let resolved=false;const full=m.loadOriginal(b).then(src=>{resolved=true;return src;});await tick();assert.equal(transfers[1].aborted,true);
const original=images.at(-1);assert.match(original.url,/originals\/b\.jpg$/);assert.equal(original.priority,'high');original.image.onload();await tick();assert.equal(resolved,false);original.decodeResolve();assert.equal(await full,'https://example.test/photography/originals/b.jpg');await tick();await nextIdle();assert.match(transfers.at(-1).url,/originals\/c\.jpg$/);
const current=transfers.at(-1);m.animationStarted();await tick();assert.equal(current.aborted,true);assert.equal(m.snapshot().stage,'aperture');const count=transfers.length;await nextIdle();assert.equal(transfers.length,count);
m.notifyPreviewLoaded(a,'https://example.test/photography/optimized/a/600.webp');assert.equal(m.getCachedPreviewSrc(a),'https://example.test/photography/optimized/a/600.webp');
m.destroy();await tick();assert.equal(idle.size,0);
});

test('original warming drains stream chunks without allocating a full-file buffer', async () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  let reads = 0;
  let released = 0;
  const page = { baseURI: 'https://example.test/', hidden: false, addEventListener(){}, removeEventListener(){} };
  class LoadedImage {
    constructor() { this.naturalWidth = 600; this.naturalHeight = 400; }
    set src(value) { this.value = value; if (value) queueMicrotask(() => this.onload?.()); }
    get src() { return this.value; }
    decode() { return Promise.resolve(); }
  }
  const environment = {
    document: page, innerWidth: 600, innerHeight: 800, devicePixelRatio: 1,
    navigator: {}, Image: LoadedImage, setTimeout, clearTimeout,
    requestIdleCallback(callback) { queueMicrotask(callback); return 1; },
    cancelIdleCallback(){},
  };
  const photograph = { id: 'photo', width: 600, height: 400, src: 'optimized/photo.webp', fullSrc: 'originals/photo.jpg', variants: [{ src: 'optimized/photo.webp', width: 600, height: 400 }] };
  const loader = createLoadingCoordinator([{ id: 'set', photos: [photograph], coverPhoto: photograph }], {
    environment,
    fetch: async () => ({
      ok: true,
      body: { getReader: () => ({
        async read() { reads += 1; return reads < 3 ? { done: false, value: new Uint8Array(1024) } : { done: true }; },
        async cancel(){},
        releaseLock() { released += 1; },
      }) },
      arrayBuffer() { throw new Error('A full-file buffer must not be allocated for a streaming response.'); },
    }),
  });
  loader.animationFinished();
  for (let attempt = 0; attempt < 10 && !loader.snapshot().originalsLoaded; attempt += 1) await tick();
  assert.equal(loader.snapshot().originalsLoaded, 1);
  assert.equal(reads, 3);
  assert.equal(released, 1);
  loader.destroy();
});

test('hiding the tab preserves a requested original and resumes background work on return', async () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const events = new Map();
  const images = [];
  const idle = new Map();
  let idleId = 0;
  let transfers = 0;
  const page = {
    baseURI: 'https://example.test/', hidden: false,
    addEventListener(type, callback) { events.set(type, callback); },
    removeEventListener(type) { events.delete(type); },
  };
  class RequestedImage {
    constructor() { this.naturalWidth = 600; this.naturalHeight = 400; }
    set src(value) {
      this.value = value;
      if (value) images.push(this);
    }
    get src() { return this.value; }
    decode() { return new Promise((resolve) => { this.finishDecode = resolve; }); }
  }
  const environment = {
    document: page, innerWidth: 600, innerHeight: 800, devicePixelRatio: 1,
    navigator: {}, Image: RequestedImage, setTimeout, clearTimeout,
    requestIdleCallback(callback) { const id = ++idleId; idle.set(id, callback); return id; },
    cancelIdleCallback(id) { idle.delete(id); },
  };
  const photograph = { id: 'requested', width: 600, height: 400, src: 'optimized/requested.webp', fullSrc: 'originals/requested.jpg', variants: [{ src: 'optimized/requested.webp', width: 600, height: 400 }] };
  const loader = createLoadingCoordinator([{ id: 'set', photos: [photograph], coverPhoto: photograph }], {
    environment,
    fetch: async () => { transfers += 1; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
  });
  loader.animationFinished();
  let rejected = false;
  const original = loader.loadOriginal(photograph).catch((error) => { rejected = true; throw error; });
  const requestedImage = images.at(-1);
  assert.match(requestedImage.src, /originals\/requested\.jpg$/);
  requestedImage.onload();
  await tick();
  page.hidden = true;
  events.get('visibilitychange')();
  await tick();
  assert.equal(rejected, false);
  assert.match(requestedImage.src, /originals\/requested\.jpg$/);
  requestedImage.finishDecode();
  assert.equal(await original, 'https://example.test/originals/requested.jpg');
  await tick();
  assert.equal(loader.snapshot().stage, 'paused');
  assert.equal(transfers, 0);
  const countWhileHidden = images.length;
  page.hidden = false;
  events.get('visibilitychange')();
  await tick();
  assert.ok(images.length > countWhileHidden, 'cover/preview work resumes after returning');
  loader.destroy();
});

function entryFixture() {
  const images = [];
  const transfers = [];
  const decoded = [];
  const idle = new Map();
  let idleId = 0;
  const page = { baseURI: 'https://example.test/', hidden: false, addEventListener(){}, removeEventListener(){} };
  class EntryImage {
    constructor() { this.naturalWidth = 600; this.naturalHeight = 400; }
    set src(value) { this.value = value; if (value) images.push(this); }
    get src() { return this.value; }
    decode() { decoded.push(this.src); return Promise.resolve(); }
  }
  const environment = {
    document: page, innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    navigator: {}, Image: EntryImage, setTimeout, clearTimeout,
    requestIdleCallback(callback) { const id = ++idleId; idle.set(id, callback); return id; },
    cancelIdleCallback(id) { idle.delete(id); },
  };
  const photos = ['a', 'b', 'c', 'd'].map((id) => ({
    id, width: 600, height: 400, src: `optimized/${id}.webp`, fullSrc: `originals/${id}.jpg`,
    variants: [{ src: `optimized/${id}.webp`, width: 600, height: 400 }],
  }));
  const loader = createLoadingCoordinator([{ id: 'set', photos, coverPhoto: photos[2] }], {
    environment,
    fetch: async (url, options) => {
      const transfer = { url, options, aborted: false };
      transfers.push(transfer);
      const body = new Promise((resolve, reject) => {
        transfer.finish = () => resolve(new ArrayBuffer(1));
        options.signal.addEventListener('abort', () => { transfer.aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      return { ok: true, arrayBuffer: () => body };
    },
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const nextIdle = async () => { const callbacks = [...idle.values()]; idle.clear(); callbacks.forEach((callback) => callback()); await tick(); await tick(); };
  return { loader, photos, images, transfers, decoded, tick, nextIdle };
}

test('entry warm-up decodes two critical previews, then animation transfers previews one at a time without decoding', async () => {
  const { loader, photos, images, transfers, decoded, tick, nextIdle } = entryFixture();
  assert.equal(images.length, 0);
  const prepared = loader.prepareEntry({ photoIds: photos.map((photo) => photo.id), budgetMs: 320 });
  assert.equal(images.length, 2);
  assert.equal(transfers.length, 0);
  assert.deepEqual(images.map((image) => image.src), photos.slice(0, 2).map((photo) => loader.getPreviewSrc(photo)));
  images[0].onload(); images[1].onload();
  const result = await prepared;
  assert.equal(result.timedOut, false);
  assert.deepEqual(result.readyPhotoIds, ['a', 'b']);
  assert.equal(decoded.length, 2);
  loader.animationStarted();
  await nextIdle();
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].options.priority, 'low');
  assert.equal(transfers[0].url, loader.getPreviewSrc(photos[2]));
  assert.equal(images.length, 2);
  assert.equal(decoded.length, 2);
  transfers[0].finish(); await tick(); await nextIdle();
  assert.equal(transfers.length, 2);
  assert.equal(transfers[1].url, loader.getPreviewSrc(photos[3]));
  assert.ok(transfers.every((transfer) => transfer.url.includes('/optimized/')));
  assert.equal(images.length, 2);
  assert.equal(decoded.length, 2);
  loader.animationFinished(); await tick();
  assert.equal(transfers[1].aborted, true);
  assert.equal(images.length, 3, 'normal cover decode resumes after the aperture finishes');
  assert.equal(images[2].src, loader.getPreviewSrc(photos[2], { cover: true }));
  assert.equal(loader.isPreviewReady(photos[2]), false, 'byte-only warm-up must not claim the image is decoded');
  loader.destroy();
});

test('entry budget releases startup and reprepare/destroy settle superseded warm-ups', async () => {
  const { loader, images, transfers, decoded, tick, nextIdle } = entryFixture();
  const bounded = await loader.prepareEntry({ photoIds: ['a', 'b', 'c', 'd'], budgetMs: 8 });
  assert.equal(bounded.timedOut, true);
  assert.deepEqual(bounded.readyPhotoIds, []);
  assert.ok(images.every((image) => image.src === ''));
  assert.equal(decoded.length, 0);
  assert.equal(transfers.length, 0);
  loader.animationStarted();
  await nextIdle();
  assert.match(transfers[0].url, /optimized\/a\.webp$/);
  assert.equal(images.length, 2);
  assert.equal(decoded.length, 0);
  loader.animationFinished();
  await tick();
  assert.equal(transfers[0].aborted, true);
  const old = loader.prepareEntry({ photoIds: ['a'], budgetMs: 500 });
  const replacement = loader.prepareEntry({ photoIds: ['b'], budgetMs: 500 });
  assert.equal((await old).canceled, true);
  loader.destroy();
  assert.equal((await replacement).canceled, true);
  assert.equal(transfers.length, 1);
});
