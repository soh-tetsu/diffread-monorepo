import { cookies } from 'next/headers'
import { after, NextResponse } from 'next/server'
import {
  extractGuestId,
  GuestSessionError,
  validateSessionOwnership,
} from '@/lib/api/guest-session'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')
    const guestId = extractGuestId(request)
    const session = await validateSessionOwnership(token, guestId, {
      messages: {
        MISSING_TOKEN: 'Missing session token',
        SESSION_NOT_FOUND: 'Session not found',
      },
    })

    // Session may not have quiz_id yet if still in setup phase
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
    const { currentToken, url, title } = body
    const guestId = extractGuestId(request)

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const { getUserById, createGuestUser, synthesizeGuestEmail } = await import('@/lib/db/users')
    const { getOrCreateSession } = await import('@/lib/db/sessions')

    let userId: string

    // Case A: Both currentToken and guestId → validate ownership
    if (currentToken && guestId) {
      const session = await validateSessionOwnership(currentToken, guestId, {
        messages: {
          MISSING_TOKEN: 'Invalid session token',
          SESSION_NOT_FOUND: 'Session not found',
        },
      })
      userId = session.user_id
    }
    // Case B: Only guestId → existing user, new submission
    else if (guestId) {
      let user = await getUserById(guestId)
      if (!user) {
        // Soft policy: recreate deleted guest
        user = await createGuestUser({
          userId: guestId,
          metadata: { recreatedAt: new Date().toISOString() },
        })

        // Set cookie for recreated user
        const cookieStore = await cookies()
        cookieStore.set('diffread_guest_id', user.id, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60, // 1 year
          path: '/',
        })
      }
      userId = user.id
    }
    // Case C: No guestId → create new guest
    else {
      const user = await createGuestUser()
      userId = user.id

      // Set guest ID cookie for new users (same as /api/guests)
      const cookieStore = await cookies()
      cookieStore.set('diffread_guest_id', user.id, {
        httpOnly: false, // Client can read and renew
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60, // 1 year
        path: '/',
      })
    }

    // Fetch title if not provided (URL submission from home screen)
    let sessionTitle = title
    if (!sessionTitle) {
      const { fetchArticleTitle } = await import('@/lib/quiz/scraper')
      const { normalizeUrl } = await import('@/lib/utils/normalize-url')

      const normalizedUrl = normalizeUrl(url)
      sessionTitle = await fetchArticleTitle(normalizedUrl)
    }

    // Create session (with title from share-target or fetched from URL)
    const session = await getOrCreateSession({
      userId,
      articleUrl: url,
      email: synthesizeGuestEmail(userId),
      metadata: sessionTitle ? { title: sessionTitle } : undefined,
    })

    // Check queue capacity (abuse prevention)
    const { countQueueItems, MAX_QUEUE_SIZE } = await import('@/lib/db/queue')
    const queueCount = await countQueueItems(userId)

    if (queueCount >= MAX_QUEUE_SIZE) {
      // Queue full - session remains 'bookmarked' (waiting list)
      return NextResponse.json({
        sessionToken: session.session_token,
        status: 'bookmarked',
        queueStatus: 'full',
      })
    } else {
      // Queue has slots - trigger background worker
      // Worker will handle all setup: article, quiz, curiosity quiz, generation
      const { processSession } = await import('@/lib/workers/process-session-coordinator')
      after(() => processSession(session))

      return NextResponse.json({
        sessionToken: session.session_token,
        status: 'pending',
      })
    }
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
