import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    // Sjekk oppdatering når appen åpnes fra hjemskjerm
    setInterval(() => {
      void registration.update()
    }, 60 * 60 * 1000)
    console.info('[pwa] service worker', swUrl)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
