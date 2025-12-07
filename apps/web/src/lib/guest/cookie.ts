/**
 * Client-side cookie management for guest ID
 *
 * Uses non-HttpOnly cookies to allow client-side read/write for auto-renewal.
 * Cookie is automatically sent by browser to all API requests.
 */

const COOKIE_NAME = 'diffread_guest_id'
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60 // 1 year

/**
 * Read guest ID from browser cookie
 * @returns Guest ID string or null if not found
 */
export function readGuestIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(new RegExp(`(^| )${COOKIE_NAME}=([^;]+)`))
  if (!match) return null

  const guestId = match[2].trim()
  return guestId.length > 0 ? guestId : null
}

/**
 * Renew guest ID cookie by resetting max-age to 1 year
 * Call this on every page load to keep the cookie alive
 *
 * @param guestId - The guest ID to renew
 */
export function renewGuestIdCookie(guestId: string): void {
  if (typeof document === 'undefined') return
  if (!guestId || guestId.trim().length === 0) return

  const isSecure = window.location.protocol === 'https:'
  const secureFlag = isSecure ? 'Secure; ' : ''

  // biome-ignore lint/suspicious/noDocumentCookie: Client-side cookie management
  document.cookie = `${COOKIE_NAME}=${guestId}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax; ${secureFlag}`
}

/**
 * Delete guest ID cookie (for testing/logout)
 */
export function deleteGuestIdCookie(): void {
  if (typeof document === 'undefined') return

  // biome-ignore lint/suspicious/noDocumentCookie: Client-side cookie deletion
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`
}
