'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Skip service worker registration in development
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      console.log('[SW] Service Worker disabled in development mode')
      return
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[SW] Service Worker registered:', registration.scope)

            // Check for updates periodically
            setInterval(
              () => {
                registration.update()
              },
              60 * 60 * 1000
            ) // Check every hour
          })
          .catch((error) => {
            console.error('[SW] Service Worker registration failed:', error)
          })
      })
    }
  }, [])

  return null
}
