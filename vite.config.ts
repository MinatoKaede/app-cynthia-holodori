import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// 앱 화면 빌드 (Capacitor가 dist/를 APK에 넣는다)
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  server: { port: 5173 },
});
