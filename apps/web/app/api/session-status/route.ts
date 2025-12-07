import { NextResponse } from 'next/server'
import { ensureSessionForGuest, extractGuestId, GuestSessionError } from '@/lib/api/guest-session'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')
    const guestId = extractGuestId(request)

    // Validate session belongs to this guest
    const session = await ensureSessionForGuest(token, guestId, {
      messages: {
        MISSING_TOKEN: 'Missing session token',
        SESSION_NOT_FOUND: 'Session not found',
      },
    })

    // Get error message from curiosity quiz if it exists
    let errorMessage: string | null = null
    if (session.quiz_id) {
      const curiosityQuiz = await getCuriosityQuizByQuizId(session.quiz_id)
      if (curiosityQuiz) {
        errorMessage = curiosityQuiz.error_message
      }
    }

    // Get queue status: all ready sessions user can take
    // Reuse same logic as /api/queue-count
    // Use session.user_id as source of truth (validated by ensureSessionForGuest)
    const { data: readySessions, error } = await supabase
      .from('sessions')
      .select('session_token', { count: 'exact' })
      .eq('user_id', session.user_id)
      .eq('status', 'ready')
      .in('study_status', ['not_started', 'curiosity_in_progress'])
      .order('created_at', { ascending: true })

    if (error) {
      logger.error(
        { err: error, userId: session.user_id },
        'Failed to fetch ready sessions for queue status'
      )
    }

    const sessionTokens = readySessions?.map((s) => s.session_token) || []

    return NextResponse.json({
      sessionToken: session.session_token,
      status: session.status,
      queueStatus: {
        total: sessionTokens.length,
        sessionTokens,
      },
      errorMessage,
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to fetch session status')
    return NextResponse.json(
      { error: 'Failed to fetch session status', details: err.message },
      { status: 500 }
    )
  }
}
