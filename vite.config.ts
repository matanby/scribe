import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  // The native packager includes the icon; the web UI has no public assets.
  publicDir: false,
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'chokidar', 'gray-matter', 'fs', 'path', 'os']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'fs', 'path', 'os']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing libraries out of the app chunk so a code
        // change doesn't invalidate a megabyte of vendor code.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Keep React out of the editor chunk so the shell and Quick Capture
          // can render without importing the writing tools.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id) || id.includes('commonjsHelpers')) return 'react';
          if (/node_modules\/(@tiptap\/|prosemirror-)/.test(id)) return 'editor';
          if (/node_modules\/(lowlight|highlight.js)\//.test(id)) return 'syntax';
          if (/node_modules\/katex\//.test(id)) return 'math';
        }
      }
    },
    chunkSizeWarningLimit: 700
  }
})
