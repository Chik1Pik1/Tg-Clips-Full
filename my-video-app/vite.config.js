import { defineConfig } from 'vite';

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
      input: './index.html' // Явно указываем точку входа
    }
  }
});
