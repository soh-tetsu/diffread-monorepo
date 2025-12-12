import { NextResponse } from 'next/server'
import {
  extractGuestId,
  GuestSessionError,
  validateSessionOwnership,
} from '@/lib/api/guest-session'
import { getScaffoldQuizByQuizId } from '@/lib/db/scaffold-quizzes'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  try {
    const { currentToken } = await request.json()
    const guestId = extractGuestId(request)
    const session = await validateSessionOwnership(currentToken, guestId, {
      tokenName: 'currentToken',
      messages: {
        MISSING_TOKEN: 'Missing currentToken.',
        SESSION_NOT_FOUND: 'Session not found.',
      },
    })

    if (!session.quiz_id) {
      return NextResponse.json({ message: 'Session has no quiz.' }, { status: 400 })
    }

    // Check if scaffold quiz already exists
    let scaffoldQuiz = await getScaffoldQuizByQuizId(session.quiz_id)

    if (scaffoldQuiz) {
      // Scaffold quiz exists - return current status
      return NextResponse.json({
        sessionToken: session.session_token,
        status: scaffoldQuiz.status,
      })
    }

    // Create scaffold quiz on-demand
    const { createScaffoldQuiz } = await import('@/lib/db/scaffold-quizzes')
    scaffoldQuiz = await createScaffoldQuiz(session.quiz_id)

    // Trigger worker to process it (fire-and-forget)
    const { processNextPendingScaffoldQuiz } = await import('@/lib/workers/process-scaffold-quiz')
    processNextPendingScaffoldQuiz().catch((err) => {
      logger.error({ err, quizId: session.quiz_id }, 'Scaffold quiz worker failed')
    })

    return NextResponse.json({
      sessionToken: session.session_token,
      status: 'pending',
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'POST /api/instructions failed')
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error.' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')
    const guestId = extractGuestId(request)
    const session = await validateSessionOwnership(token, guestId, {
      messages: {
        MISSING_TOKEN: 'Missing session token.',
        SESSION_NOT_FOUND: 'Session not found.',
      },
    })

    if (!session.quiz_id) {
      // No quiz yet - return pending status
      return NextResponse.json({
        status: 'pending',
        questions: [],
        failureReason: null,
      })
    }

    const scaffoldQuiz = await getScaffoldQuizByQuizId(session.quiz_id)

    if (!scaffoldQuiz) {
      // Scaffold quiz not created yet - return pending status
      return NextResponse.json({
        status: 'pending',
        questions: [],
        failureReason: null,
      })
    }

    // Extract questions from JSONB
    const questions = (scaffoldQuiz.questions as unknown[]) || []

    return NextResponse.json({
      status: scaffoldQuiz.status,
      questions,
      failureReason: scaffoldQuiz.error_message,
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'GET /api/instructions failed')
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error.' },
      { status: 500 }
    )
  }
}
