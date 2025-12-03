import { NextResponse } from 'next/server'
import { ensureSessionForGuest, extractGuestId, GuestSessionError } from '@/lib/api/guest-session'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { logger } from '@/lib/logger'
import { enqueueAndProcessSession } from '@/lib/workflows/enqueue-session'

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

    // Look up email from current session token
    const currentSession = await ensureSessionForGuest(currentToken, guestId, {
      messages: {
        MISSING_TOKEN: 'Invalid session token',
        SESSION_NOT_FOUND: 'Session not found',
      },
    })

    // Enqueue session and invoke worker asynchronously
    const { session, workerInvoked } = await enqueueAndProcessSession(
      {
        userId: currentSession.user_id,
        email: currentSession.user_email,
      },
      url,
      {
        sync: false, // API returns immediately
      }
    )

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
