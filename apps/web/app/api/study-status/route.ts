import { type NextRequest, NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { tryProcessNextInQueue } from '@/lib/db/queue'
import { getSessionByToken, updateSessionByToken } from '@/lib/db/sessions'
import type { StudyStatus } from '@/types/db'

export const runtime = 'nodejs'

type UpdateStudyStatusRequest = {
  sessionToken: string
  studyStatus: StudyStatus
}

/**
 * POST /api/study-status
 * Updates the study_status of a session
 * When status is set to 'archived', triggers queue processing
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const guestId = extractGuestId(request)

    if (!guestId) {
      return NextResponse.json({ error: 'Guest ID required' }, { status: 401 })
    }

    const body = (await request.json()) as UpdateStudyStatusRequest
    const { sessionToken, studyStatus } = body

    if (!sessionToken || !studyStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify session belongs to this user
    const session = await getSessionByToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.user_id !== guestId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Update study status
    const updatedSession = await updateSessionByToken(sessionToken, { study_status: studyStatus })

    // If archived, try to process next bookmarked item in queue
    if (studyStatus === 'archived') {
      await tryProcessNextInQueue(guestId)
    }

    return NextResponse.json({
      success: true,
      session: {
        sessionToken: updatedSession.session_token,
        studyStatus: updatedSession.study_status,
      },
    })
  } catch (error) {
    console.error('Failed to update study status:', error)
    return NextResponse.json({ error: 'Failed to update study status' }, { status: 500 })
  }
}
