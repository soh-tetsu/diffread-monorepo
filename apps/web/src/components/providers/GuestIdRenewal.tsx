'use client'

import { useEffect } from 'react'
import { readGuestIdFromCookie, renewGuestIdCookie } from '@/lib/guest/cookie'

/**
 * Client-side component that auto-renews guest ID cookie on every page load
 * This keeps the cookie alive for active users (1 year max-age from last visit)
 */
export function GuestIdRenewal() {
  useEffect(() => {
    const guestId = readGuestIdFromCookie()
    if (guestId) {
      renewGuestIdCookie(guestId)
    }
  }, [])

  return null // This component renders nothing
}
