import { getSessionByToken } from '@/lib/db/sessions'
import type { SessionRow } from '@/types/db'

export type GuestSessionErrorCode = 'MISSING_TOKEN' | 'SESSION_NOT_FOUND' | 'GUEST_MISMATCH'

export class GuestSessionError extends Error {
  status: number
  code: GuestSessionErrorCode

  constructor(code: GuestSessionErrorCode, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function extractGuestId(request: Request): string | null {
  // Try custom header first (for API calls from our JavaScript)
  const headerGuestId = request.headers.get('x-diffread-guest-id')
  if (headerGuestId) {
    const trimmed = headerGuestId.trim()
    if (trimmed.length > 0) return trimmed
  }

  // Fallback to cookie (for share-target where browser doesn't send custom headers)
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const match = cookieHeader.match(/diffread_guest_id=([^;]+)/)
    if (match) {
      const trimmed = match[1].trim()
      if (trimmed.length > 0) return trimmed
    }
  }

  return null
}

type ValidateSessionOptions = {
  tokenName?: string
  messages?: Partial<Record<GuestSessionErrorCode, string>>
}

export async function validateSessionOwnership(
  tokenInput: unknown,
  guestId: string | null,
  options: ValidateSessionOptions = {}
): Promise<SessionRow> {
  const tokenLabel = options.tokenName ?? 'session token'
  const messages = options.messages ?? {}
  const token = typeof tokenInput === 'string' ? tokenInput.trim() : ''

  const missingMessage = messages.MISSING_TOKEN ?? `Missing ${tokenLabel}.`
  const notFoundMessage = messages.SESSION_NOT_FOUND ?? 'Session not found.'
  const mismatchMessage = messages.GUEST_MISMATCH ?? 'Session token does not match guest user.'

  if (!token) {
    throw new GuestSessionError('MISSING_TOKEN', missingMessage, 400)
  }

  const session = await getSessionByToken(token)

  if (!session) {
    throw new GuestSessionError('SESSION_NOT_FOUND', notFoundMessage, 404)
  }

  if (guestId && session.user_id !== guestId) {
    throw new GuestSessionError('GUEST_MISMATCH', mismatchMessage, 403)
  }

  return session
}
