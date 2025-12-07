/**
 * Force update the service worker and reload the page.
 * This unregisters all service workers and clears caches.
 */
export async function forceUpdateApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    // Unregister all service workers
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    // Clear all caches
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))

    // Reload the page
    window.location.reload()
  }
}

/**
 * Check if there's a service worker update available.
 */
export async function checkForUpdate(): Promise<boolean> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      await registration.update()
      return !!registration.waiting
    }
  }
  return false
}
