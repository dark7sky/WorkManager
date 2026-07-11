function lockPortrait() {
  // Manifest orientation only applies at install time on some launchers;
  // an explicit lock covers already-installed apps. Fails silently where
  // unsupported (iOS) or when not running standalone.
  if (!matchMedia('(display-mode: standalone)').matches) return
  screen.orientation?.lock?.('portrait').catch(() => {})
}

export function registerPWA() {
  lockPortrait()
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lockPortrait() })
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('workmanager:update-ready'))
          }
        })
      })
    } catch (error) {
      console.warn('PWA service worker registration failed', error)
    }
  })
}
