import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { syncGalleryData } from './scripts/sync-gallery-data.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const photosRoot = path.join(projectRoot, 'public', 'photos');

function galleryDataPlugin() {
  let refreshTimer;

  const refreshGallery = async (server) => {
    await syncGalleryData();
    server.ws.send({ type: 'full-reload' });
  };

  const shouldRefresh = (filePath = '') => {
    return filePath.startsWith(photosRoot) || filePath === path.join(projectRoot, 'public', 'gallery.json');
  };

  return {
    name: 'gallery-data-generator',
    async buildStart() {
      await syncGalleryData();
    },
    async writeBundle(options) {
      const output = path.resolve(projectRoot, options.dir || 'dist');
      for (const directory of ['photos', 'originals', 'optimized']) {
        const source = path.join(projectRoot, 'public', directory);
        try { await fs.access(source); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        await fs.cp(source, path.join(output, directory), { recursive: true, filter: (file) => !path.basename(file).startsWith('.') });
      }
      await fs.copyFile(path.join(projectRoot, 'public', 'favicon.svg'), path.join(output, 'favicon.svg'));
      await fs.copyFile(path.join(projectRoot, 'public', 'gallery.json'), path.join(output, 'gallery.json'));
    },
    async configureServer(server) {
      await syncGalleryData();
      server.watcher.add([photosRoot, path.join(projectRoot, 'public', 'gallery.json')]);

      const queueRefresh = (filePath) => {
        if (!shouldRefresh(filePath)) return;

        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          refreshGallery(server).catch((error) => {
            server.config.logger.error(error);
          });
        }, 120);
      };

      server.watcher.on('add', queueRefresh);
      server.watcher.on('unlink', queueRefresh);
      server.watcher.on('addDir', queueRefresh);
      server.watcher.on('unlinkDir', queueRefresh);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [galleryDataPlugin(), react()],
  build: {
    copyPublicDir: false
  },
  server: {
    host: '127.0.0.1'
  },
  preview: {
    host: '127.0.0.1'
  }
});
