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

    // Session must have quiz_id after initializeSessionChain
    if (!session.quiz_id) {
      logger.error({ sessionId: session.id }, 'Session missing quiz_id after initialization')
      throw new Error('Session initialization failed: missing quiz_id')
    }

    // Get curiosity quiz (guaranteed to exist after initializeSessionChain)
    const curiosityQuiz = await getCuriosityQuizByQuizId(session.quiz_id)
    if (!curiosityQuiz) {
      logger.error(
        { sessionId: session.id, quizId: session.quiz_id },
        'Curiosity quiz missing after initialization'
      )
      throw new Error('Session initialization failed: missing curiosity quiz')
    }

    if (
      queueCount < 2 &&
      (session.status === 'bookmarked' ||
        session.status === 'pending' ||
        session.status === 'errored')
    ) {
      // Check if curiosity quiz is already ready
      if (curiosityQuiz.status === 'ready') {
        // Quiz is ready - back-propagate status through the chain
        // Ensure article content is available (ensureArticleContent handles status checking)
        if (article.status !== 'ready') {
          logger.info(
            {
              articleId: article.id,
              articleStatus: article.status,
              curiosityQuizStatus: curiosityQuiz.status,
            },
            'Curiosity quiz is ready but article not ready - ensuring article content'
          )
          const { ensureArticleContent } = await import('@/lib/workflows/article-content')
          ensureArticleContent(article).catch((err) => {
            logger.error({ err, articleId: article.id }, 'Failed to ensure article content')
          })
        }

        // Update all sessions linked to this quiz
        const { updateSessionsByQuizId } = await import('@/lib/db/sessions')
        await updateSessionsByQuizId(session.quiz_id, { status: 'ready' })

        // Update local session object
        session.status = 'ready'

        logger.info(
          { sessionToken: session.session_token, quizId: session.quiz_id },
          'Curiosity quiz already ready - back-propagated status to all sessions'
        )
      } else {
        // Queue has space - move to pending if bookmarked, or retry if already pending/errored
        const sessionToProcess =
          session.status === 'bookmarked'
            ? await updateSession(session.id, { status: 'pending' })
            : session

        // Trigger worker (fire-and-forget)
        // Pass curiosityQuizId to ensure we process the specific quiz for this session
        const { triggerQuizWorker } = await import('@/lib/workflows/enqueue-session')
        triggerQuizWorker(sessionToProcess, article, {
          sync: false,
          curiosityQuizId: curiosityQuiz?.id,
        }).catch((err) => {
          logger.error({ err, sessionToken: session.session_token }, 'Worker invocation failed')
        })

        // Update session reference after status change
        Object.assign(session, sessionToProcess)
      }
    }

    // Get error message from curiosity quiz if it exists
    const errorMessage = curiosityQuiz?.error_message ?? null

    // Get queue status: all ready sessions user can take
    // Reuse same logic as /api/queue-count
    const { data: readySessions, error: queueError } = await supabase
      .from('sessions')
      .select('session_token', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .in('study_status', ['not_started', 'curiosity_in_progress'])
      .order('created_at', { ascending: true })

    if (queueError) {
      logger.error({ err: queueError, userId: user.id }, 'Failed to fetch ready sessions')
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
    logger.error({ err }, 'Failed to initialize session')
    return NextResponse.json(
      { error: 'Failed to initialize session', details: err.message },
      { status: 500 }
    )
  }
}
