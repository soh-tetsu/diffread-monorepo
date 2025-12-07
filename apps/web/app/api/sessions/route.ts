import { type NextRequest, NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { deleteSessionByToken } from '@/lib/db/sessions'

export async function DELETE(request: NextRequest) {
  try {
    // Get guest ID from cookie
    const guestId = extractGuestId(request)
    if (!guestId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get session token from query params
    const { searchParams } = new URL(request.url)
    const sessionToken = searchParams.get('token')

    if (!sessionToken) {
      return NextResponse.json({ error: 'Session token is required' }, { status: 400 })
    }

    // Delete the session (only if it belongs to this user)
    await deleteSessionByToken(sessionToken, guestId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
