import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/', // Базовый путь для Vercel
  root: '.', // Корень проекта
  publicDir: 'public', // Папка для статических ресурсов
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist', // Папка для сборки
    assetsDir: 'assets', // Папка для JS/CSS
    sourcemap: true, // Для отладки
    rollupOptions: {
      input: resolve(__dirname, 'index.html'), // Явно указываем путь к index.html
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
