import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
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
        manualChunks: {
          editor: ['@tiptap/react', '@tiptap/core', '@tiptap/starter-kit'],
          syntax: ['lowlight'],
          math: ['katex']
        }
      }
    },
    chunkSizeWarningLimit: 700
  }
})
