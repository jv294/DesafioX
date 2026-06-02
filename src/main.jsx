import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Registrar Service Worker para suporte a offline e atualizações automáticas
registerSW({
  onNeedRefresh() {
    console.log('Novo conteúdo disponível. Recarregue a página.');
  },
  onOfflineReady() {
    console.log('App pronto para funcionar offline.');
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
