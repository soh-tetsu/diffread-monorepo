import { NextResponse } from 'next/server'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { getSessionByToken } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { enqueueAndProcessSession } from '@/lib/workflows/enqueue-session'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')

    if (!token) {
      return NextResponse.json({ error: 'Missing session token' }, { status: 400 })
    }

    const session = await getSessionByToken(token)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

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

    if (!currentToken || typeof currentToken !== 'string') {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 400 })
    }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    // Look up email from current session token
    const currentSession = await getSessionByToken(currentToken)
    if (!currentSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Enqueue session and invoke worker asynchronously
    const { session, workerInvoked } = await enqueueAndProcessSession(
      currentSession.user_email,
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
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to initialize session')
    return NextResponse.json(
      { error: 'Failed to initialize session', details: err.message },
      { status: 500 }
    )
  }
}
