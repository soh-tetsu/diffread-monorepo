import { NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { getUserById } from '@/lib/db/users'
import { logger } from '@/lib/logger'

/**
 * Get current user's profile and metadata
 */
export async function GET(request: Request) {
  try {
    const guestId = extractGuestId(request)

    if (!guestId) {
      return NextResponse.json({ error: 'No guest ID provided' }, { status: 401 })
    }

    const user = await getUserById(guestId)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      metadata: user.metadata || {},
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to fetch user profile')
    return NextResponse.json(
      { error: 'Failed to fetch user profile', details: err.message },
      { status: 500 }
    )
  }
}
