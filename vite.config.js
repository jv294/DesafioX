import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import os from 'os'

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0', // Permite que o servidor seja acessado de outros aparelhos na rede local
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  define: {
    __LOCAL_IP__: JSON.stringify(getLocalIp())
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Desafio X',
        short_name: 'DesafioX',
        description: 'Rede social híbrida para desafios',
        theme_color: '#0f172a',
        background_color: '#2a180fff',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
})
