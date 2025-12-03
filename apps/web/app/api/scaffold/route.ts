import { NextResponse } from 'next/server'
import { getScaffoldQuizByQuizId } from '@/lib/db/scaffold-quizzes'
import { getSessionByToken } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'

function extractGuestId(request: Request): string | null {
  const guestId = request.headers.get('x-diffread-guest-id')
  return guestId && guestId.trim().length > 0 ? guestId : null
}

export async function POST(request: Request) {
  try {
    const { currentToken } = await request.json()
    const guestId = extractGuestId(request)

    if (!currentToken) {
      return NextResponse.json({ message: 'Missing currentToken.' }, { status: 400 })
    }

    const session = await getSessionByToken(currentToken)

    if (!session) {
      return NextResponse.json({ message: 'Session not found.' }, { status: 404 })
    }

    if (guestId && session.user_id !== guestId) {
      return NextResponse.json(
        { message: 'Session token does not match guest user.' },
        { status: 403 }
      )
    }

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

    if (!token) {
      return NextResponse.json({ message: 'Missing session token.' }, { status: 400 })
    }

    const session = await getSessionByToken(token)

    if (!session) {
      return NextResponse.json({ message: 'Session not found.' }, { status: 404 })
    }

    if (guestId && session.user_id !== guestId) {
      return NextResponse.json(
        { message: 'Session token does not match guest user.' },
        { status: 403 }
      )
    }

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
    logger.error({ err: error }, 'GET /api/instructions failed')
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error.' },
      { status: 500 }
    )
  }
}
