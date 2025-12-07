import { NextResponse } from 'next/server'
import { ensureSessionForGuest, extractGuestId, GuestSessionError } from '@/lib/api/guest-session'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')
    const guestId = extractGuestId(request)
    const session = await ensureSessionForGuest(token, guestId, {
      messages: {
        MISSING_TOKEN: 'Missing session token',
        SESSION_NOT_FOUND: 'Session not found',
      },
    })

    if (!session.quiz_id) {
      return NextResponse.json({
        status: 'pending',
        questions: null,
        errorMessage: null,
      })
    }

    const curiosityQuiz = await getCuriosityQuizByQuizId(session.quiz_id)

    if (!curiosityQuiz) {
      return NextResponse.json({
        status: 'pending',
        questions: null,
        errorMessage: null,
      })
    }

    return NextResponse.json({
      status: curiosityQuiz.status,
      questions: curiosityQuiz.questions,
      errorMessage: curiosityQuiz.error_message,
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to fetch curiosity quiz')
    return NextResponse.json(
      { error: 'Failed to fetch curiosity quiz', details: err.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { currentToken, url } = body
    const guestId = extractGuestId(request)

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    // Resolve userId from either currentToken (warm start) or guestId (cold start)
    let userId: string

    if (currentToken) {
      // Warm start: validate currentToken belongs to this guestId
      const currentSession = await ensureSessionForGuest(currentToken, guestId, {
        messages: {
          MISSING_TOKEN: 'Invalid session token',
          SESSION_NOT_FOUND: 'Session not found',
        },
      })
      userId = currentSession.user_id
    } else {
      // Cold start: use guestId directly as userId
      if (!guestId) {
        return NextResponse.json({ error: 'Missing guest ID' }, { status: 400 })
      }
      userId = guestId
    }

    // Always initialize the full chain: session → article → quiz → curiosity_quiz
    const { initializeSessionChain } = await import('@/lib/workflows/session-init')
    const { ensureGuestUser, synthesizeGuestEmail } = await import('@/lib/db/users')
    const { countQueueItems } = await import('@/lib/db/queue')
    const { updateSession } = await import('@/lib/db/sessions')

    const { user } = await ensureGuestUser({ userId })
    const { session, article } = await initializeSessionChain({
      userId: user.id,
      email: user.email ?? synthesizeGuestEmail(user.id),
      originalUrl: url,
    })

    // Check queue size - determines if we trigger worker or just bookmark
    const queueCount = await countQueueItems(user.id)
    let workerInvoked = false

    if (queueCount < 2 && session.status === 'bookmarked') {
      // Queue has space - move to pending and trigger worker
      const updatedSession = await updateSession(session.id, { status: 'pending' })

      // Trigger worker (fire-and-forget)
      const { triggerQuizWorker } = await import('@/lib/workflows/enqueue-session')
      triggerQuizWorker(updatedSession, article, { sync: false }).catch((err) => {
        logger.error({ err, sessionToken: session.session_token }, 'Worker invocation failed')
      })

      workerInvoked = true
    }

    return NextResponse.json({
      sessionToken: session.session_token,
      status: session.status,
      workerInvoked,
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to initialize session')
    return NextResponse.json(
      { error: 'Failed to initialize session', details: err.message },
      { status: 500 }
    )
  }
}
