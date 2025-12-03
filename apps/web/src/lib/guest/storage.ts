const STORAGE_KEY = 'diffread:guestId'

export function readGuestId(): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && stored.length > 0 ? stored : null
}

export function writeGuestId(value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, value)
}

export { STORAGE_KEY as GUEST_STORAGE_KEY }
