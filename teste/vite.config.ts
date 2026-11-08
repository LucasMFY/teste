import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';

// base relativo: funciona tanto em GitHub Pages (/<repo>/) quanto aberto localmente.
export default defineConfig({
  base: './',
  build: {chunkSizeWarningLimit: 8000}, // o motor do Showdown é um bundle grande, e tudo bem
  // o clone de batalhas do Showdown (State) identifica objetos pelo nome da classe: não pode minificar nomes
  esbuild: {keepNames: true},
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lenda — Batalhas Gen 5',
        short_name: 'Lenda',
        description: 'Simulador pessoal de batalhas Pokémon (BW2 Ubers) contra IA',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#14161c',
        theme_color: '#14161c',
        icons: [{src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}],
      },
      workbox: {
        // o motor do Showdown + dados de todas as gerações é grande
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            // sprites: guardadas em cache após o primeiro acesso -> funcionam offline depois
            urlPattern: /^https:\/\/play\.pokemonshowdown\.com\/sprites\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sprites',
              expiration: {maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365},
              cacheableResponse: {statuses: [0, 200]},
            },
          },
        ],
      },
    }),
  ],
});
