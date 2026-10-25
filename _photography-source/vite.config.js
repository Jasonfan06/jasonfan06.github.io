import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateGalleryData } from './scripts/generate-gallery-data.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const photosRoot = path.join(projectRoot, 'public', 'photos');

function galleryDataPlugin() {
  let refreshTimer;

  const refreshGallery = async (server) => {
    await generateGalleryData();
    server.ws.send({ type: 'full-reload' });
  };

  const shouldRefresh = (filePath = '') => {
    return filePath.startsWith(photosRoot);
  };

  return {
    name: 'gallery-data-generator',
    async buildStart() {
      await generateGalleryData();
    },
    async writeBundle(options) {
      const output = path.resolve(projectRoot, options.dir || 'dist');
      await fs.cp(path.join(projectRoot, 'public', 'optimized'), path.join(output, 'optimized'), {
        recursive: true,
        filter: (source) => !path.basename(source).startsWith('.')
      });
      await fs.copyFile(path.join(projectRoot, 'public', 'favicon.svg'), path.join(output, 'favicon.svg'));
      await fs.copyFile(path.join(projectRoot, 'public', 'gallery.json'), path.join(output, 'gallery.json'));
    },
    async configureServer(server) {
      await generateGalleryData();
      server.watcher.add(photosRoot);

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
