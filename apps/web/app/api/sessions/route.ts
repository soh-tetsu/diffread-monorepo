import { type NextRequest, NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { deleteSessionByToken, getSessionByToken, updateSession } from '@/lib/db/sessions'
import type { SessionStatus, StudyStatus } from '@/types/db'

export async function PATCH(request: NextRequest) {
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

    // Verify session belongs to this user
    const session = await getSessionByToken(sessionToken)
    if (!session || session.user_id !== guestId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get update payload
    const body = await request.json()
    const { status, study_status } = body

    if (!status && !study_status) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    // Update the session
    const updates: { status?: SessionStatus; study_status?: StudyStatus } = {}
    if (status) updates.status = status as SessionStatus
    if (study_status) updates.study_status = study_status as StudyStatus

    await updateSession(session.id, updates)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update session:', error)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}

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
